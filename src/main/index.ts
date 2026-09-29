import { join } from 'node:path'
import { app, BrowserWindow, Menu, session, shell } from 'electron'
import { registerIpc, sendIpcEvent, setEventWindow, windowTitleForWorkspace } from './ipc'
import { HostKeyStoreService } from './services/hostKeyStore'
import { safeStorageCipher } from './services/safeStorageCipher'
import { SecretStore } from './services/secretStore'
import { SftpService } from './services/sftpService'
import { SshManager } from './services/sshManager'
import { TransferManager } from './services/transferManager'
import { WorkspaceStore } from './services/workspaceStore'

if (process.env.WORKBENCH_USER_DATA) {
  app.setPath('userData', process.env.WORKBENCH_USER_DATA)
}

let mainWindow: BrowserWindow | null = null
let transferManager: TransferManager | null = null

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#f4f5f7',
    title: 'SSH Cluster Workbench',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault())

  if (process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

async function bootstrap(): Promise<void> {
  const secretStore = new SecretStore(safeStorageCipher)
  const workspaceStore = new WorkspaceStore(
    join(app.getPath('userData'), 'settings.json'),
    secretStore
  )
  const hostKeyStore = new HostKeyStoreService()

  const sshManager = new SshManager(workspaceStore, secretStore, hostKeyStore, (status) => {
    setImmediate(() => sendIpcEvent({ type: 'connection-status', payload: status }))
  })
  const sftpService = new SftpService(sshManager)
  transferManager = new TransferManager(
    sftpService,
    {
      emitTask: (task) => sendIpcEvent({ type: 'transfer-updated', payload: task }),
      emitConflict: (conflict) => sendIpcEvent({ type: 'transfer-conflict', payload: conflict })
    },
    join(app.getPath('temp'), 'ssh-cluster-workbench')
  )

  const state = await workspaceStore.initialize()
  if (state.directory) await hostKeyStore.open(state.directory)

  registerIpc({ workspaceStore, sshManager, sftpService, transferManager })
  await createWindow()
  if (mainWindow) {
    setEventWindow(mainWindow)
    mainWindow.setTitle(windowTitleForWorkspace(state.directory))
    mainWindow.on('close', () => {
      void sshManager.disconnect(false)
    })
  }
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null)
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' ws://127.0.0.1:*;"
        ]
      }
    })
  })

  await bootstrap()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  transferManager?.cleanupTemporaryFiles().catch(() => undefined)
})
