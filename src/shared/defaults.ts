import type { AdvancedSshOptions, ConnectionProfileDraft, WorkspaceConfig } from './types'

export const EMPTY_WORKSPACE_CONFIG: WorkspaceConfig = {
  schemaVersion: 1,
  selectedProfileId: null,
  profiles: []
}

export const DEFAULT_ADVANCED_SSH_OPTIONS: AdvancedSshOptions = {
  jumpHost: '',
  jumpPort: 22,
  jumpUsername: '',
  jumpAuthType: 'password',
  jumpPrivateKeyPath: '',
  connectTimeoutMs: 20_000,
  keepaliveIntervalMs: 30_000,
  keepaliveCountMax: 3,
  compress: true,
  forceIPv4: false,
  forceIPv6: false,
  strictHostKey: true,
  algorithms: {
    kex: [],
    cipher: [],
    serverHostKey: [],
    hmac: []
  },
  extra: {}
}

export function createDefaultProfileDraft(): ConnectionProfileDraft {
  return {
    name: '新预设',
    host: '',
    port: 22,
    username: '',
    authType: 'password',
    privateKeyPath: '',
    remoteStartDir: '~',
    advanced: structuredClone(DEFAULT_ADVANCED_SSH_OPTIONS)
  }
}
