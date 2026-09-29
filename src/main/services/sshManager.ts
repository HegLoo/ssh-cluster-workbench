import { readFile } from 'node:fs/promises'
import { dialog } from 'electron'
import { Client, utils, type ConnectConfig } from 'ssh2'
import type {
  AdvancedSshOptions,
  ConnectionProfile,
  ConnectionStatus,
  SecretKey
} from '@shared/types'
import { AppError, errorMessage } from '@main/lib/errors'
import type { HostKeyStoreService } from './hostKeyStore'
import type { SecretStore } from './secretStore'
import type { WorkspaceStore } from './workspaceStore'

type StatusListener = (status: ConnectionStatus) => void

const EXTRA_OPTION_ALLOWLIST = new Set([
  'readyTimeout',
  'keepaliveInterval',
  'keepaliveCountMax',
  'forceIPv4',
  'forceIPv6'
])

export class SshManager {
  private client: Client | null = null
  private jumpClient: Client | null = null
  private activeProfile: ConnectionProfile | null = null
  private status: ConnectionStatus = {
    state: 'disconnected',
    profileId: null,
    profileName: null,
    host: null,
    message: null
  }

  constructor(
    private readonly workspaceStore: WorkspaceStore,
    private readonly secretStore: SecretStore,
    private readonly hostKeyStore: HostKeyStoreService,
    private readonly onStatus: StatusListener
  ) {}

  getStatus(): ConnectionStatus {
    return { ...this.status }
  }

  getClient(): Client {
    if (!this.client || this.status.state !== 'connected') {
      throw new AppError('NOT_CONNECTED', '尚未连接到 SSH 集群')
    }
    return this.client
  }

  getActiveProfile(): ConnectionProfile {
    if (!this.activeProfile) throw new AppError('NOT_CONNECTED', '尚未选择账号预设')
    return this.activeProfile
  }

  async connect(profileId: string): Promise<ConnectionStatus> {
    await this.disconnect(false)
    const profile = this.workspaceStore.getProfile(profileId)
    this.activeProfile = profile
    this.setState('connecting', profile, '正在建立 SSH 连接')

    try {
      this.jumpClient = await this.openClient(
        {
          host: profile.advanced.jumpHost,
          port: profile.advanced.jumpPort,
          username: profile.advanced.jumpUsername,
          authType: profile.advanced.jumpAuthType,
          privateKeyPath: profile.advanced.jumpPrivateKeyPath
        },
        profile,
        'jump'
      )

      let sock: ConnectConfig['sock']
      if (this.jumpClient) {
        const forwarded = await new Promise<NodeJS.ReadableStream>((resolve, reject) => {
          this.jumpClient?.forwardOut(
            '127.0.0.1',
            0,
            profile.host,
            profile.port,
            (error, stream) => {
              if (error) reject(error)
              else resolve(stream)
            }
          )
        })
        sock = forwarded as unknown as ConnectConfig['sock']
      }

      const targetClient = await this.openClient(
        {
          host: profile.host,
          port: profile.port,
          username: profile.username,
          authType: profile.authType,
          privateKeyPath: profile.privateKeyPath
        },
        profile,
        'target',
        sock
      )
      if (!targetClient) throw new AppError('CONNECTION_FAILED', '无法建立目标主机连接')
      this.client = targetClient
      this.attachLifecycle(targetClient)
      this.setState('connected', profile, null)
      return this.getStatus()
    } catch (error) {
      await this.disconnect(false)
      this.setState('error', profile, errorMessage(error))
      throw error
    }
  }

  async disconnect(emit = true): Promise<ConnectionStatus> {
    const target = this.client
    const jump = this.jumpClient
    this.client = null
    this.jumpClient = null
    this.activeProfile = null
    target?.end()
    jump?.end()
    if (emit) this.setStatus('disconnected', null, null, null)
    return this.getStatus()
  }

  private async openClient(
    connection: {
      host: string
      port: number
      username: string
      authType: 'password' | 'privateKey'
      privateKeyPath: string
    },
    profile: ConnectionProfile,
    role: 'jump' | 'target',
    sock?: ConnectConfig['sock']
  ): Promise<Client | null> {
    if (!connection.host) return null

    const advanced = profile.advanced
    const client = new Client()
    const auth = await this.buildAuthentication(profile.id, connection, role)
    const config: ConnectConfig = {
      host: connection.host,
      port: connection.port,
      username: connection.username,
      readyTimeout: advanced.connectTimeoutMs,
      keepaliveInterval: advanced.keepaliveIntervalMs,
      keepaliveCountMax: advanced.keepaliveCountMax,
      forceIPv4: advanced.forceIPv4,
      forceIPv6: advanced.forceIPv6,
      ...auth,
      ...(sock ? { sock } : {})
    }

    this.applyAdvancedOptions(config, advanced)
    if (advanced.strictHostKey) {
      config.hostVerifier = (key: Buffer) =>
        this.verifyHostKey(connection.host, connection.port, key)
    }

    await new Promise<void>((resolve, reject) => {
      const onReady = (): void => {
        cleanup()
        resolve()
      }
      const onError = (error: Error): void => {
        cleanup()
        client.end()
        reject(error)
      }
      const cleanup = (): void => {
        client.off('ready', onReady)
        client.off('error', onError)
      }
      client.once('ready', onReady)
      client.once('error', onError)
      client.connect(config)
    })

    return client
  }

  private async buildAuthentication(
    profileId: string,
    connection: {
      username: string
      authType: 'password' | 'privateKey'
      privateKeyPath: string
    },
    role: 'jump' | 'target'
  ): Promise<ConnectConfig> {
    if (!connection.username) {
      throw new AppError(
        'INVALID_PROFILE',
        `${role === 'jump' ? '跳板机' : '目标主机'}用户名不能为空`
      )
    }

    if (connection.authType === 'password') {
      const key: SecretKey = role === 'jump' ? 'jumpPassword' : 'password'
      const password = this.secretStore.get(profileId, key)
      if (!password) {
        throw new AppError(
          'MISSING_PASSWORD',
          `请为${role === 'jump' ? '跳板机' : '目标主机'}输入密码并保存`
        )
      }
      return { password }
    }

    if (!connection.privateKeyPath) {
      throw new AppError('MISSING_PRIVATE_KEY', '请选择私钥文件')
    }

    let privateKey: Buffer
    try {
      privateKey = await readFile(connection.privateKeyPath)
    } catch (error) {
      throw new AppError('PRIVATE_KEY_UNREADABLE', '无法读取私钥文件', errorMessage(error))
    }

    const passphraseKey: SecretKey = role === 'jump' ? 'jumpPassphrase' : 'passphrase'
    const passphrase = this.secretStore.get(profileId, passphraseKey)
    return {
      privateKey,
      ...(passphrase ? { passphrase } : {})
    }
  }

  private applyAdvancedOptions(config: ConnectConfig, advanced: AdvancedSshOptions): void {
    const algorithms = config.algorithms ?? {}
    if (advanced.algorithms.kex.length > 0) algorithms.kex = advanced.algorithms.kex as never
    if (advanced.algorithms.cipher.length > 0)
      algorithms.cipher = advanced.algorithms.cipher as never
    if (advanced.algorithms.serverHostKey.length > 0) {
      algorithms.serverHostKey = advanced.algorithms.serverHostKey as never
    }
    if (advanced.algorithms.hmac.length > 0) algorithms.hmac = advanced.algorithms.hmac as never
    if (advanced.compress) algorithms.compress = ['zlib@openssh.com', 'zlib'] as never
    config.algorithms = algorithms

    for (const [key, value] of Object.entries(advanced.extra)) {
      if (!EXTRA_OPTION_ALLOWLIST.has(key)) continue
      ;(config as unknown as Record<string, unknown>)[key] = value
    }
  }

  private verifyHostKey(host: string, port: number, key: Buffer): boolean {
    const fingerprint = this.hostKeyStore.fingerprint(key)
    if (this.hostKeyStore.find(host, port, fingerprint)) return true

    if (this.hostKeyStore.hasOtherFingerprint(host, port, fingerprint)) {
      dialog.showMessageBoxSync({
        type: 'error',
        title: 'SSH 主机指纹已变化',
        message: `${host}:${port} 的主机指纹与已保存记录不一致`,
        detail: `当前指纹：${fingerprint}\n\n连接已被阻断。请在确认服务器变更后手动清理旧记录。`,
        buttons: ['取消连接']
      })
      return false
    }

    const parsed = utils.parseKey(key)
    const algorithm = Array.isArray(parsed) || parsed instanceof Error ? 'unknown' : parsed.type
    const result = dialog.showMessageBoxSync({
      type: 'question',
      title: '确认 SSH 主机指纹',
      message: `首次连接 ${host}:${port}`,
      detail: `算法：${algorithm}\n指纹：${fingerprint}\n\n只有在你确认该指纹属于目标集群时才应继续。`,
      buttons: ['信任并连接', '取消'],
      defaultId: 1,
      cancelId: 1,
      noLink: true
    })

    if (result !== 0) return false
    void this.hostKeyStore.trust(host, port, algorithm, fingerprint, key)
    return true
  }

  private attachLifecycle(client: Client): void {
    client.once('close', () => {
      if (this.client === client) {
        this.client = null
        this.jumpClient?.end()
        this.jumpClient = null
        this.activeProfile = null
        this.setStatus('disconnected', null, null, 'SSH 连接已断开')
      }
    })
    client.on('error', (error) => {
      if (this.client === client) {
        this.setStatus(
          'error',
          this.activeProfile?.id ?? null,
          this.activeProfile?.name ?? null,
          error.message,
          this.activeProfile?.host ?? null
        )
      }
    })
  }

  private setState(
    state: ConnectionStatus['state'],
    profile: ConnectionProfile | null,
    message: string | null
  ): void {
    this.setStatus(
      state,
      profile?.id ?? null,
      profile?.name ?? null,
      message,
      profile?.host ?? null
    )
  }

  private setStatus(
    state: ConnectionStatus['state'],
    profileId: string | null,
    profileName: string | null,
    message: string | null,
    host: string | null = this.status.host
  ): void {
    this.status = { state, profileId, profileName, host, message }
    this.onStatus(this.getStatus())
  }
}
