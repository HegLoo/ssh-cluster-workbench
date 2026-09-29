import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import type { SFTPWrapper, Stats } from 'ssh2'
import { SftpService } from '@main/services/sftpService'
import type { SshManager } from '@main/services/sshManager'

interface FakeNode {
  type: 'file' | 'directory'
  size: number
}

function stats(type: FakeNode['type'], size = 0): Stats {
  const mode = type === 'directory' ? 0o040755 : 0o100644
  return {
    mode,
    uid: 1000,
    gid: 1000,
    size,
    atime: 1,
    mtime: 1,
    isDirectory: () => type === 'directory',
    isFile: () => type === 'file',
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isSymbolicLink: () => false,
    isFIFO: () => false,
    isSocket: () => false
  }
}

class FakeSftp extends EventEmitter {
  nodes = new Map<string, FakeNode>([
    ['/home/alice', { type: 'directory', size: 0 }],
    ['/home/alice/file.txt', { type: 'file', size: 12 }],
    ['/home/alice/folder', { type: 'directory', size: 0 }],
    ['/home/alice/folder/nested.txt', { type: 'file', size: 4 }]
  ])

  realpath(path: string, callback: (error: Error | undefined, result: string) => void): void {
    callback(undefined, path === '.' || path === '~' ? '/home/alice' : path)
  }

  readdir(path: string, callback: (error: Error | undefined, result: unknown[]) => void): void {
    const entries = [...this.nodes.entries()]
      .filter(
        ([candidate]) =>
          candidate.startsWith(`${path}/`) && !candidate.slice(path.length + 1).includes('/')
      )
      .map(([candidate, node]) => ({
        filename: candidate.slice(path.length + 1),
        attrs: stats(node.type, node.size)
      }))
    callback(undefined, entries)
  }

  lstat(path: string, callback: (error: Error | undefined, result: Stats) => void): void {
    const node = this.nodes.get(path)
    if (!node) callback(new Error('ENOENT'), stats('file'))
    else callback(undefined, stats(node.type, node.size))
  }

  stat = this.lstat.bind(this)

  mkdir(path: string, callback: (error?: Error | null) => void): void {
    this.nodes.set(path, { type: 'directory', size: 0 })
    callback()
  }

  rename(source: string, destination: string, callback: (error?: Error | null) => void): void {
    const node = this.nodes.get(source)
    if (node) {
      this.nodes.delete(source)
      this.nodes.set(destination, node)
    }
    callback()
  }

  unlink(path: string, callback: (error?: Error | null) => void): void {
    this.nodes.delete(path)
    callback()
  }

  rmdir(path: string, callback: (error?: Error | null) => void): void {
    this.nodes.delete(path)
    callback()
  }

  end(): void {
    this.emit('close')
  }
}

describe('SftpService integration', () => {
  it('lists directories and removes trees without following remote symlinks', async () => {
    const fake = new FakeSftp()
    const client = {
      sftp: (callback: (error: Error | undefined, sftp: SFTPWrapper) => void) =>
        callback(undefined, fake as unknown as SFTPWrapper)
    }
    const sshManager = { getClient: () => client } as unknown as SshManager
    const service = new SftpService(sshManager)

    const listing = await service.list('~')
    expect(listing.path).toBe('/home/alice')
    expect(listing.entries.map((entry) => entry.name)).toEqual(['folder', 'file.txt'])

    await service.mkdir('/home/alice/new-folder')
    await service.rename('/home/alice/new-folder', '/home/alice/renamed')
    expect(fake.nodes.has('/home/alice/renamed')).toBe(true)

    await service.remove(['/home/alice/folder'])
    expect(fake.nodes.has('/home/alice/folder/nested.txt')).toBe(false)
    expect(fake.nodes.has('/home/alice/folder')).toBe(false)
  })
})
