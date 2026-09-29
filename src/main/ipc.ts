import { basename } from 'node:path'
import { BrowserWindow, dialog, ipcMain, nativeImage, shell } from 'electron'
import { z } from 'zod'
import { IPC } from '@shared/ipc'
import {
  conflictDecisionSchema,
  profileSaveRequestSchema,
  transferRequestSchema
} from '@shared/validation'
import type { IpcEvent } from '@shared/types'
import { AppError, serializeError } from './lib/errors'
import type { SftpService } from './services/sftpService'
import type { SshManager } from './services/sshManager'
import type { TransferManager } from './services/transferManager'
import type { WorkspaceStore } from './services/workspaceStore'

export interface IpcServices {
  workspaceStore: WorkspaceStore
  sshManager: SshManager
  sftpService: SftpService
  transferManager: TransferManager
}

export function registerIpc(services: IpcServices): void {
  const { workspaceStore, sshManager, sftpService, transferManager } = services

  const handle = <T extends unknown[], R>(
    channel: string,
    handler: (...args: T) => Promise<R> | R
  ): void => {
    ipcMain.handle(channel, async (_event, ...args: T) => {
      try {
        return await handler(...args)
      } catch (error) {
        throw new Error(JSON.stringify(serializeError(error)), { cause: error })
      }
    })
  }

  handle(IPC.workspaceGet, () => workspaceStore.getState())
  handle(IPC.workspaceChoose, async () => {
    const result = await dialog.showOpenDialog({
      title: '选择登录信息工作目录',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return null
    return openWorkspace(services, result.filePaths[0])
  })
  handle(IPC.workspaceUseRecent, async (directory: unknown) => {
    return openWorkspace(services, z.string().min(1).parse(directory))
  })
  handle(IPC.profilesSave, async (request: unknown) => {
    const profile = await workspaceStore.saveProfile(
      profileSaveRequestSchema.parse(request) as Parameters<typeof workspaceStore.saveProfile>[0]
    )
    sendIpcEvent({ type: 'workspace-changed', payload: workspaceStore.getState() })
    return profile
  })
  handle(IPC.profilesRemove, async (profileId: unknown) => {
    const id = z.string().uuid().parse(profileId)
    if (sshManager.getStatus().profileId === id) await disconnectServices(services)
    await workspaceStore.removeProfile(id)
    sendIpcEvent({ type: 'workspace-changed', payload: workspaceStore.getState() })
  })
  handle(IPC.profilesSelect, async (profileId: unknown) => {
    const id = profileId === null ? null : z.string().uuid().parse(profileId)
    const state = await workspaceStore.selectProfile(id)
    sendIpcEvent({ type: 'workspace-changed', payload: state })
    return state
  })
  handle(IPC.sshConnect, async (profileId: unknown) => {
    return sshManager.connect(z.string().uuid().parse(profileId))
  })
  handle(IPC.sshDisconnect, async () => disconnectServices(services))
  handle(IPC.sshStatus, () => sshManager.getStatus())
  handle(IPC.sftpList, async (path: unknown) => sftpService.list(z.string().min(1).parse(path)))
  handle(IPC.sftpHome, () => sftpService.home())
  handle(IPC.sftpMkdir, async (path: unknown) => sftpService.mkdir(z.string().min(1).parse(path)))
  handle(IPC.sftpRename, async (source: unknown, destination: unknown) =>
    sftpService.rename(z.string().min(1).parse(source), z.string().min(1).parse(destination))
  )
  handle(IPC.sftpRemove, async (paths: unknown) =>
    sftpService.remove(z.array(z.string().min(1)).min(1).parse(paths))
  )
  handle(IPC.sftpUpload, async (request: unknown) =>
    transferManager.upload(
      transferRequestSchema.parse(request) as Parameters<typeof transferManager.upload>[0]
    )
  )
  handle(IPC.sftpDownload, async (request: unknown) =>
    transferManager.download(
      transferRequestSchema.parse(request) as Parameters<typeof transferManager.download>[0]
    )
  )
  handle(IPC.sftpPrepareDrag, async (remotePaths: unknown) =>
    transferManager.prepareDrag(z.array(z.string().min(1)).min(1).parse(remotePaths))
  )
  handle(IPC.sftpStartDrag, async (localPaths: unknown) => {
    const paths = z.array(z.string().min(1)).min(1).parse(localPaths)
    const first = paths[0]
    if (!first) throw new AppError('DRAG_FAILED', '没有可拖拽的文件')
    const icon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
    )
    const window = BrowserWindow.getFocusedWindow() ?? eventWindow
    if (!window) throw new AppError('DRAG_FAILED', '无法启动原生拖拽')
    window.webContents.startDrag({ file: first, files: paths, icon })
  })
  handle(IPC.transfersList, () => transferManager.list())
  handle(IPC.transfersCancel, async (taskId: unknown) =>
    transferManager.cancel(z.string().uuid().parse(taskId))
  )
  handle(IPC.transfersRetry, async (taskId: unknown) =>
    transferManager.retry(z.string().uuid().parse(taskId))
  )
  handle(IPC.transfersResolveConflict, async (decision: unknown) =>
    transferManager.resolveConflict(conflictDecisionSchema.parse(decision))
  )
  handle(IPC.dialogChooseDirectory, async (title: unknown) => {
    const result = await dialog.showOpenDialog({
      title: typeof title === 'string' ? title : '选择目录',
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })
  handle(IPC.dialogChoosePrivateKey, async () => {
    const result = await dialog.showOpenDialog({
      title: '选择 SSH 私钥文件',
      properties: ['openFile'],
      filters: [
        { name: 'SSH 私钥', extensions: ['pem', 'key', 'ppk'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })
}

async function openWorkspace(services: IpcServices, directory: string): Promise<unknown> {
  await disconnectServices(services, false)
  const state = await services.workspaceStore.open(directory)
  sendIpcEvent({ type: 'workspace-changed', payload: state })
  return state
}

async function disconnectServices(services: IpcServices, emit = true): Promise<unknown> {
  services.sftpService.clear()
  return services.sshManager.disconnect(emit)
}

let eventWindow: BrowserWindow | null = null

export function setEventWindow(window: BrowserWindow): void {
  eventWindow = window
}

export function sendIpcEvent(event: IpcEvent): void {
  if (!eventWindow || eventWindow.isDestroyed()) return
  eventWindow.webContents.send(IPC.event, event)
}

export function openExternalUrl(url: string): Promise<void> {
  return shell.openExternal(url)
}

export function windowTitleForWorkspace(directory: string | null): string {
  return directory ? `SSH Cluster Workbench - ${basename(directory)}` : 'SSH Cluster Workbench'
}
