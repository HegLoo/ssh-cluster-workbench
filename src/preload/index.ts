import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC } from '@shared/ipc'
import type { AppError, DesktopApi, IpcEvent } from '@shared/types'

function parseError(error: unknown): Error {
  if (!(error instanceof Error)) return new Error(String(error))
  try {
    const parsed = JSON.parse(error.message) as AppError
    if (parsed && typeof parsed.message === 'string') {
      const wrapped = new Error(parsed.message)
      wrapped.name = parsed.code
      return wrapped
    }
  } catch {
    // Electron's transport may only preserve the original message.
  }
  return error
}

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  try {
    return (await ipcRenderer.invoke(channel, ...args)) as T
  } catch (error) {
    throw parseError(error)
  }
}

const api: DesktopApi = {
  workspace: {
    get: () => invoke(IPC.workspaceGet),
    choose: () => invoke(IPC.workspaceChoose),
    useRecent: (directory) => invoke(IPC.workspaceUseRecent, directory)
  },
  profiles: {
    save: (request) => invoke(IPC.profilesSave, request),
    remove: (profileId) => invoke(IPC.profilesRemove, profileId),
    select: (profileId) => invoke(IPC.profilesSelect, profileId)
  },
  ssh: {
    connect: (profileId) => invoke(IPC.sshConnect, profileId),
    disconnect: () => invoke(IPC.sshDisconnect),
    status: () => invoke(IPC.sshStatus)
  },
  sftp: {
    list: (path) => invoke(IPC.sftpList, path),
    home: () => invoke(IPC.sftpHome),
    mkdir: (path) => invoke(IPC.sftpMkdir, path),
    rename: (source, destination) => invoke(IPC.sftpRename, source, destination),
    remove: (paths) => invoke(IPC.sftpRemove, paths),
    upload: (request) => invoke(IPC.sftpUpload, request),
    download: (request) => invoke(IPC.sftpDownload, request),
    prepareDrag: (remotePaths) => invoke(IPC.sftpPrepareDrag, remotePaths),
    startDrag: (localPaths) => invoke(IPC.sftpStartDrag, localPaths)
  },
  transfers: {
    list: () => invoke(IPC.transfersList),
    cancel: (taskId) => invoke(IPC.transfersCancel, taskId),
    retry: (taskId) => invoke(IPC.transfersRetry, taskId),
    resolveConflict: (decision) => invoke(IPC.transfersResolveConflict, decision)
  },
  dialog: {
    chooseDirectory: (title) => invoke(IPC.dialogChooseDirectory, title),
    choosePrivateKey: () => invoke(IPC.dialogChoosePrivateKey)
  },
  files: {
    pathFor: (file) => webUtils.getPathForFile(file as File)
  },
  events: {
    subscribe(listener) {
      const handler = (_event: Electron.IpcRendererEvent, payload: IpcEvent): void =>
        listener(payload)
      ipcRenderer.on(IPC.event, handler)
      return () => ipcRenderer.removeListener(IPC.event, handler)
    }
  }
}

contextBridge.exposeInMainWorld('desktop', api)
