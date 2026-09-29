import { readJsonFile, writeJsonFileAtomic } from '@main/lib/jsonFile'
import { AppError } from '@main/lib/errors'
import type { SecretKey } from '@shared/types'

interface EncryptedValue {
  value: string
}

type EncryptedSecrets = Partial<Record<SecretKey, EncryptedValue>>

interface SecretsFile {
  schemaVersion: 1
  profiles: Record<string, EncryptedSecrets>
}

export interface SecretCipher {
  isAvailable(): boolean
  encrypt(value: string): string
  decrypt(value: string): string
}

export class SecretStore {
  private filePath: string | null = null
  private cache: SecretsFile = { schemaVersion: 1, profiles: {} }

  constructor(private readonly cipher: SecretCipher) {}

  async open(directory: string): Promise<void> {
    this.filePath = `${directory}/secrets.json`
    this.cache = await readJsonFile<SecretsFile>(this.filePath, {
      schemaVersion: 1,
      profiles: {}
    })
    if (this.cache.schemaVersion !== 1 || typeof this.cache.profiles !== 'object') {
      throw new AppError('INVALID_SECRETS', '登录凭据文件格式无效')
    }
  }

  has(profileId: string, key: SecretKey): boolean {
    return Boolean(this.getEncrypted(profileId, key))
  }

  async setMany(
    profileId: string,
    values: Partial<Record<SecretKey, string>>,
    remove: SecretKey[]
  ): Promise<void> {
    if (Object.keys(values).length > 0 && !this.cipher.isAvailable()) {
      throw new AppError('ENCRYPTION_UNAVAILABLE', '当前 Windows 环境无法安全加密登录凭据')
    }

    const profileSecrets = this.cache.profiles[profileId] ?? {}
    for (const key of remove) delete profileSecrets[key]

    for (const [key, value] of Object.entries(values) as Array<[SecretKey, string]>) {
      if (value === '') {
        delete profileSecrets[key]
        continue
      }
      profileSecrets[key] = { value: this.cipher.encrypt(value) }
    }

    if (Object.keys(profileSecrets).length === 0) {
      delete this.cache.profiles[profileId]
    } else {
      this.cache.profiles[profileId] = profileSecrets
    }
    await this.persist()
  }

  get(profileId: string, key: SecretKey): string | null {
    const encrypted = this.getEncrypted(profileId, key)
    if (!encrypted) return null
    try {
      return this.cipher.decrypt(encrypted.value)
    } catch (error) {
      throw new AppError(
        'DECRYPTION_FAILED',
        '无法解密已保存凭据，请重新编辑该预设并输入密码',
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  async removeProfile(profileId: string): Promise<void> {
    delete this.cache.profiles[profileId]
    await this.persist()
  }

  private getEncrypted(profileId: string, key: SecretKey): EncryptedValue | undefined {
    return this.cache.profiles[profileId]?.[key]
  }

  private async persist(): Promise<void> {
    if (!this.filePath) throw new AppError('NO_WORKSPACE', '尚未选择工作目录')
    await writeJsonFileAtomic(this.filePath, this.cache)
  }
}
