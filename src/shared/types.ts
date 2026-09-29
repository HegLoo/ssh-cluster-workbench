export type AuthType = 'password' | 'privateKey'

export type SecretKey = 'password' | 'passphrase' | 'jumpPassword' | 'jumpPassphrase'

export interface SshAlgorithmOptions {
  kex: string[]
  cipher: string[]
  serverHostKey: string[]
  hmac: string[]
}

export interface AdvancedSshOptions {
  jumpHost: string
  jumpPort: number
  jumpUsername: string
  jumpAuthType: AuthType
  jumpPrivateKeyPath: string
  connectTimeoutMs: number
  keepaliveIntervalMs: number
  keepaliveCountMax: number
  compress: boolean
  forceIPv4: boolean
  forceIPv6: boolean
  strictHostKey: boolean
  algorithms: SshAlgorithmOptions
  extra: Record<string, string | number | boolean>
}

export interface ConnectionProfileDraft {
  id?: string
  name: string
  host: string
  port: number
  username: string
  authType: AuthType
  privateKeyPath: string
  remoteStartDir: string
  advanced: AdvancedSshOptions
}

export interface ConnectionProfile extends ConnectionProfileDraft {
  id: string
  hasPassword: boolean
  hasPassphrase: boolean
  hasJumpPassword: boolean
  hasJumpPassphrase: boolean
  createdAt: string
  updatedAt: string
}

export interface SecretPayload {
  password?: string
  passphrase?: string
  jumpPassword?: string
  jumpPassphrase?: string
}

export interface ProfileSaveRequest {
  profile: ConnectionProfileDraft
  secrets: SecretPayload
  removeSecrets: SecretKey[]
}

export interface WorkspaceConfig {
  schemaVersion: 1
  selectedProfileId: string | null
  profiles: ConnectionProfile[]
}

export interface WorkspaceState {
  directory: string | null
  config: WorkspaceConfig
  recentDirectories: string[]
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface ConnectionStatus {
  state: ConnectionState
  profileId: string | null
  profileName: string | null
  host: string | null
  message: string | null
}

export type RemoteEntryType = 'file' | 'directory' | 'symlink' | 'other'

export interface RemoteEntry {
  name: string
  path: string
  type: RemoteEntryType
  size: number
  modifiedAt: number | null
  permissions: string
  uid: number
  gid: number
}

export interface RemoteDirectory {
  path: string
  homePath: string
  entries: RemoteEntry[]
}

export type TransferDirection = 'upload' | 'download'

export type TransferState = 'queued' | 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled'

export interface TransferTask {
  id: string
  direction: TransferDirection
  sourceLabel: string
  destinationLabel: string
  state: TransferState
  bytesTransferred: number
  totalBytes: number
  filesTransferred: number
  totalFiles: number
  speedBytesPerSecond: number
  error: string | null
  createdAt: string
  updatedAt: string
}

export type ConflictAction = 'overwrite' | 'skip' | 'rename'

export interface TransferConflict {
  id: string
  taskId: string
  direction: TransferDirection
  sourcePath: string
  destinationPath: string
}

export interface TransferConflictDecision {
  conflictId: string
  action: ConflictAction
  applyToAll: boolean
}

export interface TransferRequest {
  localPaths?: string[]
  remotePaths?: string[]
  destination: string
  conflictAction?: ConflictAction
}

export interface PreparedDragPayload {
  localPaths: string[]
  taskId: string
}

export interface HostKeyRecord {
  host: string
  port: number
  algorithm: string
  fingerprint: string
  keyBase64: string
  firstSeenAt: string
}

export interface HostKeyStore {
  schemaVersion: 1
  entries: HostKeyRecord[]
}

export interface AppError {
  code: string
  message: string
  details?: string
}

export type IpcEvent =
  | { type: 'connection-status'; payload: ConnectionStatus }
  | { type: 'transfer-updated'; payload: TransferTask }
  | { type: 'transfer-conflict'; payload: TransferConflict }
  | { type: 'workspace-changed'; payload: WorkspaceState }

export interface DesktopApi {
  workspace: {
    get(): Promise<WorkspaceState>
    choose(): Promise<WorkspaceState | null>
    useRecent(directory: string): Promise<WorkspaceState>
  }
  profiles: {
    save(request: ProfileSaveRequest): Promise<ConnectionProfile>
    remove(profileId: string): Promise<void>
    select(profileId: string | null): Promise<WorkspaceState>
  }
  ssh: {
    connect(profileId: string): Promise<ConnectionStatus>
    disconnect(): Promise<ConnectionStatus>
    status(): Promise<ConnectionStatus>
  }
  sftp: {
    list(path: string): Promise<RemoteDirectory>
    home(): Promise<string>
    mkdir(path: string): Promise<void>
    rename(source: string, destination: string): Promise<void>
    remove(paths: string[]): Promise<void>
    upload(request: TransferRequest): Promise<TransferTask>
    download(request: TransferRequest): Promise<TransferTask>
    prepareDrag(remotePaths: string[]): Promise<PreparedDragPayload>
    startDrag(localPaths: string[]): Promise<void>
  }
  transfers: {
    list(): Promise<TransferTask[]>
    cancel(taskId: string): Promise<void>
    retry(taskId: string): Promise<TransferTask>
    resolveConflict(decision: TransferConflictDecision): Promise<void>
  }
  dialog: {
    chooseDirectory(title?: string): Promise<string | null>
    choosePrivateKey(): Promise<string | null>
  }
  files: {
    pathFor(file: unknown): string
  }
  events: {
    subscribe(listener: (event: IpcEvent) => void): () => void
  }
}
