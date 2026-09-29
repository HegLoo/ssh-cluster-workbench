import { randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { access, lstat, mkdir, readdir, rm, stat } from 'node:fs/promises'
import { basename, dirname, join, posix } from 'node:path'
import type { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { SFTPWrapper } from 'ssh2'
import type {
  ConflictAction,
  PreparedDragPayload,
  TransferConflict,
  TransferConflictDecision,
  TransferRequest,
  TransferTask
} from '@shared/types'
import { AppError, errorMessage } from '@main/lib/errors'
import { sanitizeWindowsName, uniqueDisplayName } from '@main/lib/localPath'
import { basenameRemote, joinRemotePath } from '@main/lib/remotePath'
import type { SftpService } from './sftpService'

interface FileOperation {
  source: string
  destination: string
  size: number
}

interface DirectoryOperation {
  path: string
}

export interface TransferBackground {
  emitTask(task: TransferTask): void
  emitConflict(conflict: TransferConflict): void
}

export class TransferManager {
  private readonly tasks = new Map<string, TransferTask>()
  private readonly requests = new Map<string, TransferRequest>()
  private readonly contexts = new Map<string, TaskContext>()
  private activeTaskId: string | null = null

  constructor(
    private readonly sftpService: SftpService,
    private readonly background: TransferBackground,
    private readonly downloadRoot: string
  ) {}

  list(): TransferTask[] {
    return [...this.tasks.values()].sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt)
    )
  }

  upload(request: TransferRequest): TransferTask {
    if (!request.localPaths?.length) throw new AppError('NO_LOCAL_FILES', '没有可上传的本机文件')
    const task = this.createTask('upload', request)
    void this.processQueue()
    return { ...task }
  }

  download(request: TransferRequest): TransferTask {
    if (!request.remotePaths?.length) throw new AppError('NO_REMOTE_FILES', '没有可下载的远端文件')
    const task = this.createTask('download', request)
    void this.processQueue()
    return { ...task }
  }

  cancel(taskId: string): void {
    const context = this.contexts.get(taskId)
    if (!context) return
    context.cancelled = true
    context.currentStream?.destroy(new AppError('TRANSFER_CANCELLED', '传输已取消'))
    context.sftp?.end()
    this.updateTask(context, 'cancelled', '传输已取消')
  }

  retry(taskId: string): TransferTask {
    const original = this.tasks.get(taskId)
    const request = this.requests.get(taskId)
    if (!original || !request) throw new AppError('TRANSFER_NOT_FOUND', '找不到可重试的传输任务')
    return original.direction === 'upload' ? this.upload(request) : this.download(request)
  }

  resolveConflict(decision: TransferConflictDecision): void {
    const context = [...this.contexts.values()].find((candidate) =>
      candidate.conflicts.has(decision.conflictId)
    )
    if (!context) return
    if (decision.applyToAll) context.batchDecision = decision.action
    const pending = context.conflicts.get(decision.conflictId)
    if (!pending) return
    context.conflicts.delete(decision.conflictId)
    pending.resolve(decision.action)
  }

  async waitForTask(taskId: string): Promise<TransferTask> {
    const context = this.contexts.get(taskId)
    if (!context) throw new AppError('TRANSFER_NOT_FOUND', '找不到传输任务')
    await context.completion
    return { ...(this.tasks.get(taskId) as TransferTask) }
  }

  async prepareDrag(remotePaths: string[]): Promise<PreparedDragPayload> {
    const directory = join(this.downloadRoot, `drag-${randomUUID()}`)
    await mkdir(directory, { recursive: true })
    const task = this.download({
      remotePaths,
      destination: directory,
      conflictAction: 'rename'
    })
    const completed = await this.waitForTask(task.id)
    if (completed.state !== 'completed') {
      throw new AppError('DRAG_PREPARE_FAILED', completed.error ?? '拖拽文件准备失败')
    }

    const localPaths: string[] = []
    for (const remotePath of remotePaths) {
      const name = sanitizeWindowsName(basenameRemote(remotePath))
      localPaths.push(join(directory, name))
    }
    return { localPaths, taskId: task.id }
  }

  async cleanupTemporaryFiles(): Promise<void> {
    await rm(this.downloadRoot, { recursive: true, force: true })
  }

  private createTask(direction: TransferTask['direction'], request: TransferRequest): TransferTask {
    const id = randomUUID()
    const now = new Date().toISOString()
    const task: TransferTask = {
      id,
      direction,
      sourceLabel:
        direction === 'upload'
          ? `${request.localPaths?.length ?? 0} 个本机项目`
          : `${request.remotePaths?.length ?? 0} 个远端项目`,
      destinationLabel: request.destination,
      state: 'queued',
      bytesTransferred: 0,
      totalBytes: 0,
      filesTransferred: 0,
      totalFiles: 0,
      speedBytesPerSecond: 0,
      error: null,
      createdAt: now,
      updatedAt: now
    }
    const context: TaskContext = {
      task,
      request: structuredClone(request),
      conflicts: new Map(),
      batchDecision: request.conflictAction ?? null,
      cancelled: false,
      sftp: null,
      currentStream: null,
      completion: Promise.resolve(),
      startedAt: 0,
      lastProgressAt: Date.now(),
      lastProgressBytes: 0
    }
    context.completion = new Promise<void>((resolve) => {
      context.resolveCompletion = resolve
    })
    this.tasks.set(id, task)
    this.requests.set(id, structuredClone(request))
    this.contexts.set(id, context)
    this.emitTask(context)
    return task
  }

  private async processQueue(): Promise<void> {
    if (this.activeTaskId) return
    const next = [...this.contexts.values()].find((context) => context.task.state === 'queued')
    if (!next) return
    this.activeTaskId = next.task.id
    try {
      await this.runTask(next)
    } finally {
      this.activeTaskId = null
      void this.processQueue()
    }
  }

  private async runTask(context: TaskContext): Promise<void> {
    if (context.cancelled) return
    this.updateTask(context, 'running', null)
    context.startedAt = Date.now()
    context.lastProgressAt = Date.now()
    context.lastProgressBytes = 0

    try {
      context.sftp = await this.sftpService.openSession()
      if (context.task.direction === 'upload') await this.runUpload(context, context.sftp)
      else await this.runDownload(context, context.sftp)
      context.sftp.end()
      context.sftp = null
      if (!context.cancelled) this.updateTask(context, 'completed', null)
    } catch (error) {
      context.sftp?.end()
      context.sftp = null
      if (context.cancelled) {
        this.updateTask(context, 'cancelled', '传输已取消')
      } else {
        this.updateTask(context, 'failed', errorMessage(error))
      }
    } finally {
      for (const pending of context.conflicts.values()) pending.resolve('skip')
      context.conflicts.clear()
      context.resolveCompletion?.()
    }
  }

  private async runUpload(context: TaskContext, sftp: SFTPWrapper): Promise<void> {
    const destination = await this.sftpService.resolve(context.request.destination)
    const directories: DirectoryOperation[] = []
    const files: FileOperation[] = []

    for (const localPath of context.request.localPaths ?? []) {
      await this.collectLocal(localPath, destination, directories, files)
    }
    this.setTotals(context, files)
    await this.createDirectories(context, sftp, directories)
    for (const operation of files) {
      this.throwIfCancelled(context)
      const finalDestination = await this.resolveRemoteConflict(context, sftp, operation)
      if (!finalDestination) continue
      await this.ensureRemoteParent(sftp, finalDestination)
      const sourceStream = createReadStream(operation.source)
      const destinationStream = sftp.createWriteStream(finalDestination, { flags: 'w' })
      context.currentStream = sourceStream
      const progressStream = sourceStream.on('data', (chunk: Buffer) => {
        this.advance(context, chunk.length)
      })
      await pipeline(progressStream, destinationStream)
      context.currentStream = null
      context.task.filesTransferred += 1
      this.emitTask(context)
    }
  }

  private async runDownload(context: TaskContext, sftp: SFTPWrapper): Promise<void> {
    const destination = context.request.destination
    await mkdir(destination, { recursive: true })
    const directories: DirectoryOperation[] = []
    const files: FileOperation[] = []

    for (const remotePath of context.request.remotePaths ?? []) {
      const resolved = await this.sftpService.resolve(remotePath)
      await this.collectRemote(sftp, resolved, destination, directories, files)
    }
    this.setTotals(context, files)
    for (const directory of directories) {
      this.throwIfCancelled(context)
      await mkdir(directory.path, { recursive: true })
    }
    for (const operation of files) {
      this.throwIfCancelled(context)
      const finalDestination = await this.resolveLocalConflict(context, operation)
      if (!finalDestination) continue
      await mkdir(dirname(finalDestination), { recursive: true })
      const sourceStream = sftp.createReadStream(operation.source)
      const destinationStream = createWriteStream(finalDestination)
      context.currentStream = sourceStream
      const progressStream = sourceStream.on('data', (chunk: Buffer) => {
        this.advance(context, chunk.length)
      })
      await pipeline(progressStream, destinationStream)
      context.currentStream = null
      context.task.filesTransferred += 1
      this.emitTask(context)
    }
  }

  private async collectLocal(
    localPath: string,
    remoteDestination: string,
    directories: DirectoryOperation[],
    files: FileOperation[]
  ): Promise<void> {
    const stats = await lstat(localPath)
    if (stats.isSymbolicLink()) return
    const name = basename(localPath)
    const remotePath = joinRemotePath(remoteDestination, name)
    if (stats.isDirectory()) {
      directories.push({ path: remotePath })
      const children = await readdir(localPath, { withFileTypes: true })
      for (const child of children) {
        await this.collectLocal(join(localPath, child.name), remotePath, directories, files)
      }
      return
    }
    if (stats.isFile()) files.push({ source: localPath, destination: remotePath, size: stats.size })
  }

  private async collectRemote(
    sftp: SFTPWrapper,
    remotePath: string,
    localDestination: string,
    directories: DirectoryOperation[],
    files: FileOperation[]
  ): Promise<void> {
    const stats = await this.sftpService.lstat(sftp, remotePath)
    if (stats.isSymbolicLink()) return
    const rawName = posix.basename(remotePath)
    const name = sanitizeWindowsName(rawName)
    const localPath = join(localDestination, name)
    if (stats.isDirectory()) {
      directories.push({ path: localPath })
      const children = await this.sftpService.readdir(sftp, remotePath)
      for (const child of children) {
        if (child.filename === '.' || child.filename === '..') continue
        await this.collectRemote(
          sftp,
          joinRemotePath(remotePath, child.filename),
          localPath,
          directories,
          files
        )
      }
      return
    }
    if (stats.isFile()) files.push({ source: remotePath, destination: localPath, size: stats.size })
  }

  private setTotals(context: TaskContext, files: FileOperation[]): void {
    context.task.totalFiles = files.length
    context.task.totalBytes = files.reduce((sum, operation) => sum + operation.size, 0)
    this.emitTask(context)
  }

  private async createDirectories(
    context: TaskContext,
    sftp: SFTPWrapper,
    directories: DirectoryOperation[]
  ): Promise<void> {
    directories.sort((left, right) => left.path.length - right.path.length)
    for (const directory of directories) {
      this.throwIfCancelled(context)
      await this.sftpService.ensureRemoteDirectory(sftp, directory.path)
    }
  }

  private async resolveRemoteConflict(
    context: TaskContext,
    sftp: SFTPWrapper,
    operation: FileOperation
  ): Promise<string | null> {
    if (!(await this.sftpService.exists(sftp, operation.destination))) return operation.destination
    const action = await this.getConflictAction(context, operation.source, operation.destination)
    if (action === 'skip') return null
    if (action === 'rename') {
      return this.sftpService.uniqueRemotePath(sftp, operation.destination)
    }

    const existing = await this.sftpService.lstat(sftp, operation.destination)
    if (existing.isDirectory()) {
      throw new AppError('TYPE_CONFLICT', '远端已存在同名目录，无法用文件覆盖')
    }
    return operation.destination
  }

  private async resolveLocalConflict(
    context: TaskContext,
    operation: FileOperation
  ): Promise<string | null> {
    let existing: Awaited<ReturnType<typeof lstat>> | null
    try {
      existing = await lstat(operation.destination)
    } catch {
      existing = null
    }
    if (!existing) return operation.destination
    const action = await this.getConflictAction(context, operation.source, operation.destination)
    if (action === 'skip') return null
    if (action === 'rename') {
      const directory = dirname(operation.destination)
      const name = basename(operation.destination)
      const existingNames = new Set(await readdir(directory).catch(() => []))
      return join(directory, uniqueDisplayName(name, existingNames))
    }
    if (existing.isDirectory()) {
      throw new AppError('TYPE_CONFLICT', '本机已存在同名目录，无法用文件覆盖')
    }
    return operation.destination
  }

  private async getConflictAction(
    context: TaskContext,
    sourcePath: string,
    destinationPath: string
  ): Promise<ConflictAction> {
    if (context.batchDecision) return context.batchDecision
    const conflictId = randomUUID()
    const conflict: TransferConflict = {
      id: conflictId,
      taskId: context.task.id,
      direction: context.task.direction,
      sourcePath,
      destinationPath
    }
    const action = await new Promise<ConflictAction>((resolve) => {
      context.conflicts.set(conflictId, { resolve })
      this.background.emitConflict(conflict)
    })
    return action
  }

  private async ensureRemoteParent(sftp: SFTPWrapper, path: string): Promise<void> {
    const parent = posix.dirname(path)
    if (parent && parent !== '/') await this.sftpService.ensureRemoteDirectory(sftp, parent)
  }

  private advance(context: TaskContext, bytes: number): void {
    context.task.bytesTransferred += bytes
    const now = Date.now()
    const elapsed = now - context.lastProgressAt
    if (elapsed >= 250) {
      const instantSpeed =
        ((context.task.bytesTransferred - context.lastProgressBytes) * 1000) / elapsed
      context.task.speedBytesPerSecond = Math.max(0, instantSpeed)
      context.lastProgressAt = now
      context.lastProgressBytes = context.task.bytesTransferred
      this.emitTask(context)
    }
  }

  private throwIfCancelled(context: TaskContext): void {
    if (context.cancelled) throw new AppError('TRANSFER_CANCELLED', '传输已取消')
  }

  private updateTask(
    context: TaskContext,
    state: TransferTask['state'],
    error: string | null
  ): void {
    context.task.state = state
    context.task.error = error
    if (state === 'completed') {
      context.task.bytesTransferred = context.task.totalBytes
      context.task.filesTransferred = context.task.totalFiles
      context.task.speedBytesPerSecond = 0
    }
    this.emitTask(context)
  }

  private emitTask(context: TaskContext): void {
    context.task.updatedAt = new Date().toISOString()
    this.background.emitTask({ ...context.task })
  }
}

interface PendingConflict {
  resolve(action: ConflictAction): void
}

interface TaskContext {
  task: TransferTask
  request: TransferRequest
  conflicts: Map<string, PendingConflict>
  batchDecision: ConflictAction | null
  cancelled: boolean
  sftp: SFTPWrapper | null
  currentStream: Readable | null
  completion: Promise<void>
  resolveCompletion?: () => void
  startedAt: number
  lastProgressAt: number
  lastProgressBytes: number
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export async function localFileSize(path: string): Promise<number> {
  return (await stat(path)).size
}
