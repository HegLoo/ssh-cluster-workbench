import { posix } from 'node:path'
import type { FileEntryWithStats, SFTPWrapper, Stats } from 'ssh2'
import type { RemoteDirectory, RemoteEntry } from '@shared/types'
import { AppError } from '@main/lib/errors'
import { formatMode, modeToType } from '@main/lib/mode'
import { expandRemoteHome, joinRemotePath, normalizeRemotePath } from '@main/lib/remotePath'
import type { SshManager } from './sshManager'

export class SftpService {
  private sharedSftp: SFTPWrapper | null = null

  constructor(private readonly sshManager: SshManager) {}

  clear(): void {
    this.sharedSftp = null
  }

  async home(): Promise<string> {
    const sftp = await this.getShared()
    return this.call(sftp, (done) => sftp.realpath('.', done), '无法读取远端家目录')
  }

  async resolve(path: string): Promise<string> {
    const homePath = await this.home()
    const expanded = expandRemoteHome(path || '~', homePath)
    const sftp = await this.getShared()
    return this.call(sftp, (done) => sftp.realpath(expanded, done), `无法解析远端路径：${path}`)
  }

  async list(path: string): Promise<RemoteDirectory> {
    const homePath = await this.home()
    const resolved = await this.resolve(path)
    const sftp = await this.getShared()
    const entries = await this.call<FileEntryWithStats[]>(
      sftp,
      (done) => sftp.readdir(resolved, done),
      `无法读取目录：${resolved}`
    )

    const mapped = entries
      .map((entry) => this.mapEntry(resolved, entry))
      .filter((entry): entry is RemoteEntry => entry !== null)
      .sort((left, right) => {
        if (left.type === 'directory' && right.type !== 'directory') return -1
        if (left.type !== 'directory' && right.type === 'directory') return 1
        return left.name.localeCompare(right.name, 'zh-CN', { numeric: true, sensitivity: 'base' })
      })

    return { path: resolved, homePath, entries: mapped }
  }

  async mkdir(path: string): Promise<void> {
    const resolved = await this.resolve(path)
    const sftp = await this.getShared()
    await this.call<void>(sftp, (done) => sftp.mkdir(resolved, done), `无法创建目录：${resolved}`)
  }

  async rename(source: string, destination: string): Promise<void> {
    const sourcePath = await this.resolve(source)
    const destinationPath = await this.resolve(destination)
    const sftp = await this.getShared()
    await this.call<void>(
      sftp,
      (done) => sftp.rename(sourcePath, destinationPath, done),
      '无法重命名远端项目'
    )
  }

  async remove(paths: string[]): Promise<void> {
    for (const path of paths) {
      const resolved = await this.resolve(path)
      await this.removeRecursive(resolved)
    }
  }

  async openSession(): Promise<SFTPWrapper> {
    const client = this.sshManager.getClient()
    return new Promise<SFTPWrapper>((resolve, reject) => {
      client.sftp((error, sftp) => {
        if (error) reject(new AppError('SFTP_SESSION_FAILED', '无法启动 SFTP 会话', error.message))
        else resolve(sftp)
      })
    })
  }

  async lstat(sftp: SFTPWrapper, path: string): Promise<Stats> {
    return this.call(sftp, (done) => sftp.lstat(path, done), `无法读取远端属性：${path}`)
  }

  async stat(sftp: SFTPWrapper, path: string): Promise<Stats> {
    return this.call(sftp, (done) => sftp.stat(path, done), `无法读取远端属性：${path}`)
  }

  async exists(sftp: SFTPWrapper, path: string): Promise<boolean> {
    try {
      await this.lstat(sftp, path)
      return true
    } catch {
      return false
    }
  }

  async readdir(sftp: SFTPWrapper, path: string): Promise<FileEntryWithStats[]> {
    return this.call(sftp, (done) => sftp.readdir(path, done), `无法读取目录：${path}`)
  }

  async ensureRemoteDirectory(sftp: SFTPWrapper, path: string): Promise<void> {
    const normalized = normalizeRemotePath(path)
    const parts = normalized.split('/').filter(Boolean)
    let current = '/'
    for (const part of parts) {
      current = joinRemotePath(current, part)
      try {
        const stats = await this.stat(sftp, current)
        if (!stats.isDirectory()) {
          throw new AppError('REMOTE_NOT_DIRECTORY', `远端路径不是目录：${current}`)
        }
      } catch (error) {
        if (error instanceof AppError && error.code !== 'SFTP_ERROR') throw error
        await this.call<void>(
          sftp,
          (done) => sftp.mkdir(current, done),
          `无法创建远端目录：${current}`
        )
      }
    }
  }

  async uniqueRemotePath(sftp: SFTPWrapper, desiredPath: string): Promise<string> {
    if (!(await this.exists(sftp, desiredPath))) return desiredPath
    const directory = posix.dirname(desiredPath)
    const extension = posix.extname(desiredPath)
    const base = posix.basename(desiredPath, extension)
    for (let index = 1; index < 10_000; index += 1) {
      const candidate = posix.join(directory, `${base} (${index})${extension}`)
      if (!(await this.exists(sftp, candidate))) return candidate
    }
    throw new AppError('NAME_CONFLICT', '无法为冲突文件生成新名称')
  }

  private mapEntry(parent: string, entry: FileEntryWithStats): RemoteEntry | null {
    if (!entry.filename || entry.filename === '.' || entry.filename === '..') return null
    return {
      name: entry.filename,
      path: joinRemotePath(parent, entry.filename),
      type: modeToType(entry.attrs.mode),
      size: entry.attrs.size,
      modifiedAt: entry.attrs.mtime ? entry.attrs.mtime * 1000 : null,
      permissions: formatMode(entry.attrs.mode),
      uid: entry.attrs.uid,
      gid: entry.attrs.gid
    }
  }

  private async removeRecursive(path: string): Promise<void> {
    const sftp = await this.getShared()
    const stats = await this.lstat(sftp, path)
    if (!stats.isDirectory()) {
      await this.call<void>(sftp, (done) => sftp.unlink(path, done), `无法删除：${path}`)
      return
    }

    const children = await this.readdir(sftp, path)
    for (const child of children) {
      if (child.filename === '.' || child.filename === '..') continue
      await this.removeRecursive(joinRemotePath(path, child.filename))
    }
    await this.call<void>(sftp, (done) => sftp.rmdir(path, done), `无法删除目录：${path}`)
  }

  private async getShared(): Promise<SFTPWrapper> {
    if (this.sharedSftp) return this.sharedSftp
    this.sharedSftp = await this.openSession()
    this.sharedSftp.once('close', () => {
      this.sharedSftp = null
    })
    return this.sharedSftp
  }

  private call<T>(
    sftp: SFTPWrapper,
    invoke: (done: (error: Error | null | undefined, result: T) => void) => void,
    fallback: string
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      invoke((error, result) => {
        if (error) reject(new AppError('SFTP_ERROR', fallback, error.message))
        else resolve(result)
      })
    })
  }
}
