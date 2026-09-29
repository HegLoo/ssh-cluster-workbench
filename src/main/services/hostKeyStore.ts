import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { readJsonFile, writeJsonFileAtomic } from '@main/lib/jsonFile'
import type { HostKeyRecord, HostKeyStore as HostKeyFile } from '@shared/types'

export class HostKeyStoreService {
  private directory: string | null = null
  private store: HostKeyFile = { schemaVersion: 1, entries: [] }

  async open(workspaceDirectory: string): Promise<void> {
    this.directory = join(workspaceDirectory, '.ssh-cluster-workbench')
    this.store = await readJsonFile<HostKeyFile>(join(this.directory, 'known_hosts.json'), {
      schemaVersion: 1,
      entries: []
    })
  }

  find(host: string, port: number, fingerprint: string): HostKeyRecord | undefined {
    return this.store.entries.find(
      (entry) => entry.host === host && entry.port === port && entry.fingerprint === fingerprint
    )
  }

  hasOtherFingerprint(host: string, port: number, fingerprint: string): boolean {
    return this.store.entries.some(
      (entry) => entry.host === host && entry.port === port && entry.fingerprint !== fingerprint
    )
  }

  async trust(
    host: string,
    port: number,
    algorithm: string,
    fingerprint: string,
    key: Buffer
  ): Promise<void> {
    if (this.find(host, port, fingerprint)) return
    this.store.entries.push({
      host,
      port,
      algorithm,
      fingerprint,
      keyBase64: key.toString('base64'),
      firstSeenAt: new Date().toISOString()
    })
    await this.persist()
  }

  async remove(host: string, port: number): Promise<void> {
    this.store.entries = this.store.entries.filter(
      (entry) => !(entry.host === host && entry.port === port)
    )
    await this.persist()
  }

  fingerprint(key: Buffer): string {
    return `SHA256:${createHash('sha256').update(key).digest('base64').replace(/=+$/, '')}`
  }

  private async persist(): Promise<void> {
    if (!this.directory) return
    await writeJsonFileAtomic(join(this.directory, 'known_hosts.json'), this.store)
  }
}
