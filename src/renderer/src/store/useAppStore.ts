import { create } from 'zustand'
import { createDefaultProfileDraft } from '@shared/defaults'
import type {
  ConnectionProfileDraft,
  ConnectionStatus,
  IpcEvent,
  ProfileSaveRequest,
  RemoteDirectory,
  TransferConflict,
  TransferConflictDecision,
  TransferTask,
  WorkspaceState
} from '@shared/types'

interface Notice {
  type: 'error' | 'success' | 'info'
  message: string
}

interface ProfileDialogState {
  open: boolean
  draft: ConnectionProfileDraft
  hasPassword: boolean
  hasPassphrase: boolean
  hasJumpPassword: boolean
  hasJumpPassphrase: boolean
}

interface AppState {
  initialized: boolean
  workspace: WorkspaceState | null
  connection: ConnectionStatus
  directory: RemoteDirectory | null
  currentPath: string
  history: string[]
  historyIndex: number
  tasks: TransferTask[]
  conflict: TransferConflict | null
  profileDialog: ProfileDialogState
  notice: Notice | null
  busy: boolean
  initialize(): Promise<void>
  chooseWorkspace(): Promise<void>
  openRecentWorkspace(directory: string): Promise<void>
  selectProfile(profileId: string | null): Promise<void>
  openNewProfile(): void
  openProfileEditor(profileId: string): void
  closeProfileDialog(): void
  saveProfile(request: ProfileSaveRequest): Promise<void>
  removeProfile(profileId: string): Promise<void>
  connect(): Promise<void>
  disconnect(): Promise<void>
  navigate(path: string, pushHistory?: boolean): Promise<void>
  goBack(): void
  goForward(): void
  goUp(): void
  refresh(): Promise<void>
  createFolder(name: string): Promise<void>
  rename(source: string, destination: string): Promise<void>
  removePaths(paths: string[]): Promise<void>
  upload(localPaths: string[]): Promise<void>
  download(remotePaths: string[]): Promise<void>
  cancelTransfer(taskId: string): Promise<void>
  retryTransfer(taskId: string): Promise<void>
  resolveConflict(decision: TransferConflictDecision): Promise<void>
  showNotice(notice: Notice): void
  clearNotice(): void
}

const DISCONNECTED: ConnectionStatus = {
  state: 'disconnected',
  profileId: null,
  profileName: null,
  host: null,
  message: null
}

const CLOSED_PROFILE_DIALOG: ProfileDialogState = {
  open: false,
  draft: createDefaultProfileDraft(),
  hasPassword: false,
  hasPassphrase: false,
  hasJumpPassword: false,
  hasJumpPassphrase: false
}

let initializedSubscription = false

export const useAppStore = create<AppState>((set, get) => ({
  initialized: false,
  workspace: null,
  connection: DISCONNECTED,
  directory: null,
  currentPath: '~',
  history: [],
  historyIndex: -1,
  tasks: [],
  conflict: null,
  profileDialog: CLOSED_PROFILE_DIALOG,
  notice: null,
  busy: false,

  initialize: async () => {
    if (!initializedSubscription) {
      initializedSubscription = true
      window.desktop.events.subscribe((event) => handleEvent(event, set, get))
    }
    try {
      const [workspace, connection, tasks] = await Promise.all([
        window.desktop.workspace.get(),
        window.desktop.ssh.status(),
        window.desktop.transfers.list()
      ])
      set({ workspace, connection, tasks, initialized: true })
    } catch (error) {
      set({ initialized: true, notice: { type: 'error', message: errorMessage(error) } })
    }
  },

  chooseWorkspace: async () => {
    try {
      const workspace = await window.desktop.workspace.choose()
      if (workspace) {
        set({ workspace, directory: null, currentPath: '~' })
        await get().selectProfile(workspace.config.selectedProfileId)
      }
    } catch (error) {
      get().showNotice({ type: 'error', message: errorMessage(error) })
    }
  },

  openRecentWorkspace: async (directoryPath) => {
    try {
      const workspace = await window.desktop.workspace.useRecent(directoryPath)
      set({ workspace, directory: null, currentPath: '~' })
      await get().selectProfile(workspace.config.selectedProfileId)
    } catch (error) {
      get().showNotice({ type: 'error', message: errorMessage(error) })
    }
  },

  selectProfile: async (profileId) => {
    try {
      const workspace = await window.desktop.profiles.select(profileId)
      set({ workspace })
    } catch (error) {
      get().showNotice({ type: 'error', message: errorMessage(error) })
    }
  },

  openNewProfile: () =>
    set({
      profileDialog: { ...CLOSED_PROFILE_DIALOG, open: true, draft: createDefaultProfileDraft() }
    }),

  openProfileEditor: (profileId) => {
    const profile = get().workspace?.config.profiles.find((candidate) => candidate.id === profileId)
    if (!profile) return
    set({
      profileDialog: {
        open: true,
        draft: structuredClone(profile),
        hasPassword: profile.hasPassword,
        hasPassphrase: profile.hasPassphrase,
        hasJumpPassword: profile.hasJumpPassword,
        hasJumpPassphrase: profile.hasJumpPassphrase
      }
    })
  },

  closeProfileDialog: () => set({ profileDialog: CLOSED_PROFILE_DIALOG }),

  saveProfile: async (request) => {
    try {
      await window.desktop.profiles.save(request)
      const workspace = await window.desktop.workspace.get()
      set({ workspace, profileDialog: CLOSED_PROFILE_DIALOG })
      get().showNotice({ type: 'success', message: '账号预设已保存' })
    } catch (error) {
      get().showNotice({ type: 'error', message: errorMessage(error) })
    }
  },

  removeProfile: async (profileId) => {
    try {
      await window.desktop.profiles.remove(profileId)
      const workspace = await window.desktop.workspace.get()
      set({ workspace, directory: null, currentPath: '~' })
    } catch (error) {
      get().showNotice({ type: 'error', message: errorMessage(error) })
    }
  },

  connect: async () => {
    const profileId = get().workspace?.config.selectedProfileId
    if (!profileId) {
      get().showNotice({ type: 'error', message: '请先选择或创建一个账号预设' })
      return
    }
    try {
      set({ busy: true })
      const status = await window.desktop.ssh.connect(profileId)
      set({ connection: status })
      const startPath =
        get().workspace?.config.profiles.find((profile) => profile.id === profileId)
          ?.remoteStartDir ?? '~'
      await get().navigate(startPath, true)
    } catch (error) {
      get().showNotice({ type: 'error', message: errorMessage(error) })
    } finally {
      set({ busy: false })
    }
  },

  disconnect: async () => {
    try {
      const status = await window.desktop.ssh.disconnect()
      set({ connection: status, directory: null, currentPath: '~', history: [], historyIndex: -1 })
    } catch (error) {
      get().showNotice({ type: 'error', message: errorMessage(error) })
    }
  },

  navigate: async (path, pushHistory = true) => {
    try {
      set({ busy: true })
      const directory = await window.desktop.sftp.list(path)
      set((state) => {
        if (!pushHistory) return { directory, currentPath: directory.path }
        const nextHistory = [...state.history.slice(0, state.historyIndex + 1), directory.path]
        return {
          directory,
          currentPath: directory.path,
          history: nextHistory,
          historyIndex: nextHistory.length - 1
        }
      })
    } catch (error) {
      get().showNotice({ type: 'error', message: errorMessage(error) })
    } finally {
      set({ busy: false })
    }
  },

  goBack: () => {
    const state = get()
    if (state.historyIndex <= 0) return
    const index = state.historyIndex - 1
    const path = state.history[index]
    if (path) void state.navigate(path, false).then(() => set({ historyIndex: index }))
  },

  goForward: () => {
    const state = get()
    if (state.historyIndex >= state.history.length - 1) return
    const index = state.historyIndex + 1
    const path = state.history[index]
    if (path) void state.navigate(path, false).then(() => set({ historyIndex: index }))
  },

  goUp: () => {
    const path = get().directory?.path
    if (!path || path === '/') return
    const parent = path.slice(0, path.lastIndexOf('/')) || '/'
    void get().navigate(parent)
  },

  refresh: async () => {
    const path = get().directory?.path ?? get().currentPath
    if (path) await get().navigate(path, false)
  },

  createFolder: async (name) => {
    const path = get().directory?.path
    if (!path) return
    try {
      await window.desktop.sftp.mkdir(`${path.replace(/\/$/, '')}/${name}`)
      await get().refresh()
    } catch (error) {
      get().showNotice({ type: 'error', message: errorMessage(error) })
    }
  },

  rename: async (source, destination) => {
    try {
      await window.desktop.sftp.rename(source, destination)
      await get().refresh()
    } catch (error) {
      get().showNotice({ type: 'error', message: errorMessage(error) })
    }
  },

  removePaths: async (paths) => {
    try {
      await window.desktop.sftp.remove(paths)
      await get().refresh()
    } catch (error) {
      get().showNotice({ type: 'error', message: errorMessage(error) })
    }
  },

  upload: async (localPaths) => {
    const destination = get().directory?.path
    if (!destination || localPaths.length === 0) return
    try {
      await window.desktop.sftp.upload({ localPaths, destination })
    } catch (error) {
      get().showNotice({ type: 'error', message: errorMessage(error) })
    }
  },

  download: async (remotePaths) => {
    if (remotePaths.length === 0) return
    try {
      const destination = await window.desktop.dialog.chooseDirectory('选择下载位置')
      if (!destination) return
      await window.desktop.sftp.download({ remotePaths, destination })
    } catch (error) {
      get().showNotice({ type: 'error', message: errorMessage(error) })
    }
  },

  cancelTransfer: async (taskId) => {
    await window.desktop.transfers.cancel(taskId)
  },

  retryTransfer: async (taskId) => {
    try {
      await window.desktop.transfers.retry(taskId)
    } catch (error) {
      get().showNotice({ type: 'error', message: errorMessage(error) })
    }
  },

  resolveConflict: async (decision) => {
    await window.desktop.transfers.resolveConflict(decision)
    set({ conflict: null })
  },

  showNotice: (notice) => set({ notice }),
  clearNotice: () => set({ notice: null })
}))

function handleEvent(
  event: IpcEvent,
  set: (partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void,
  get: () => AppState
): void {
  switch (event.type) {
    case 'workspace-changed':
      set({ workspace: event.payload })
      break
    case 'connection-status':
      set({ connection: event.payload })
      if (event.payload.state === 'disconnected') {
        set({ directory: null, currentPath: '~', history: [], historyIndex: -1 })
      }
      if (event.payload.state === 'error' && event.payload.message) {
        get().showNotice({ type: 'error', message: event.payload.message })
      }
      break
    case 'transfer-updated':
      set((state) => {
        const existing = state.tasks.findIndex((task) => task.id === event.payload.id)
        const tasks = [...state.tasks]
        if (existing >= 0) tasks[existing] = event.payload
        else tasks.unshift(event.payload)
        return { tasks }
      })
      break
    case 'transfer-conflict':
      set({ conflict: event.payload })
      break
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
