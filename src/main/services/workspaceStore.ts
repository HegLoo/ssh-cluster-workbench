import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import type {
  ConnectionProfile,
  ProfileSaveRequest,
  WorkspaceConfig,
  WorkspaceState
} from '@shared/types'
import { EMPTY_WORKSPACE_CONFIG } from '@shared/defaults'
import { AppError } from '@main/lib/errors'
import { readJsonFile, writeJsonFileAtomic } from '@main/lib/jsonFile'
import type { SecretStore } from './secretStore'

interface AppSettings {
  schemaVersion: 1
  lastWorkspace: string | null
  recentWorkspaces: string[]
}

export class WorkspaceStore {
  private settings: AppSettings = {
    schemaVersion: 1,
    lastWorkspace: null,
    recentWorkspaces: []
  }

  private config: WorkspaceConfig = structuredClone(EMPTY_WORKSPACE_CONFIG)
  private directory: string | null = null

  constructor(
    private readonly settingsPath: string,
    private readonly secretStore: SecretStore
  ) {}

  async initialize(): Promise<WorkspaceState> {
    this.settings = await readJsonFile<AppSettings>(this.settingsPath, this.settings)
    if (this.settings.lastWorkspace) {
      try {
        await this.open(this.settings.lastWorkspace)
      } catch {
        this.settings.lastWorkspace = null
        await this.persistSettings()
      }
    }
    return this.getState()
  }

  getState(): WorkspaceState {
    return {
      directory: this.directory,
      config: structuredClone(this.config),
      recentDirectories: [...this.settings.recentWorkspaces]
    }
  }

  getDirectory(): string | null {
    return this.directory
  }

  getConfig(): WorkspaceConfig {
    return this.config
  }

  getProfile(profileId: string): ConnectionProfile {
    const profile = this.config.profiles.find((candidate) => candidate.id === profileId)
    if (!profile) throw new AppError('PROFILE_NOT_FOUND', '找不到指定的账号预设')
    return profile
  }

  async open(directory: string): Promise<WorkspaceState> {
    const internalDirectory = join(directory, '.ssh-cluster-workbench')
    await mkdir(internalDirectory, { recursive: true })
    await this.secretStore.open(internalDirectory)

    const loaded = await readJsonFile<WorkspaceConfig>(
      join(internalDirectory, 'workspace.json'),
      structuredClone(EMPTY_WORKSPACE_CONFIG)
    )
    this.config = this.migrateConfig(loaded)
    this.directory = directory
    this.settings.lastWorkspace = directory
    this.settings.recentWorkspaces = [
      directory,
      ...this.settings.recentWorkspaces.filter((item) => item !== directory)
    ].slice(0, 8)
    await Promise.all([this.persistConfig(), this.persistSettings()])
    return this.getState()
  }

  async saveProfile(request: ProfileSaveRequest): Promise<ConnectionProfile> {
    this.requireWorkspace()
    const now = new Date().toISOString()
    const existingIndex = request.profile.id
      ? this.config.profiles.findIndex((profile) => profile.id === request.profile.id)
      : -1
    const existing = existingIndex >= 0 ? this.config.profiles[existingIndex] : undefined
    const id = existing?.id ?? request.profile.id ?? randomUUID()

    await this.secretStore.setMany(id, request.secrets, request.removeSecrets)

    const profile: ConnectionProfile = {
      ...structuredClone(request.profile),
      id,
      hasPassword: this.secretStore.has(id, 'password'),
      hasPassphrase: this.secretStore.has(id, 'passphrase'),
      hasJumpPassword: this.secretStore.has(id, 'jumpPassword'),
      hasJumpPassphrase: this.secretStore.has(id, 'jumpPassphrase'),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    }

    if (existingIndex >= 0) {
      this.config.profiles[existingIndex] = profile
    } else {
      this.config.profiles.push(profile)
    }
    this.config.selectedProfileId = id
    await this.persistConfig()
    return structuredClone(profile)
  }

  async removeProfile(profileId: string): Promise<void> {
    this.requireWorkspace()
    this.config.profiles = this.config.profiles.filter((profile) => profile.id !== profileId)
    if (this.config.selectedProfileId === profileId) this.config.selectedProfileId = null
    await Promise.all([this.persistConfig(), this.secretStore.removeProfile(profileId)])
  }

  async selectProfile(profileId: string | null): Promise<WorkspaceState> {
    this.requireWorkspace()
    if (profileId) this.getProfile(profileId)
    this.config.selectedProfileId = profileId
    await this.persistConfig()
    return this.getState()
  }

  private migrateConfig(config: WorkspaceConfig): WorkspaceConfig {
    if (config.schemaVersion !== 1 || !Array.isArray(config.profiles)) {
      throw new AppError('INVALID_WORKSPACE', '工作目录中的账号配置格式不受支持')
    }
    return {
      schemaVersion: 1,
      selectedProfileId: config.selectedProfileId ?? null,
      profiles: config.profiles.map((profile) => ({ ...profile }))
    }
  }

  private async persistConfig(): Promise<void> {
    const directory = this.requireWorkspace()
    await writeJsonFileAtomic(
      join(directory, '.ssh-cluster-workbench', 'workspace.json'),
      this.config
    )
  }

  private async persistSettings(): Promise<void> {
    await mkdir(dirname(this.settingsPath), { recursive: true })
    await writeJsonFileAtomic(this.settingsPath, this.settings)
  }

  private requireWorkspace(): string {
    if (!this.directory) throw new AppError('NO_WORKSPACE', '请先选择工作目录')
    return this.directory
  }
}

export function workspaceDisplayName(directory: string): string {
  return basename(directory) || directory
}
