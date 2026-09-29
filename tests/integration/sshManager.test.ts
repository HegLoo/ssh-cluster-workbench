import { AddressInfo } from 'node:net'
import { once } from 'node:events'
import { afterEach, describe, expect, it } from 'vitest'
import { Server, type Connection, utils } from 'ssh2'
import { createDefaultProfileDraft } from '@shared/defaults'
import { SshManager } from '@main/services/sshManager'
import type { ConnectionProfile } from '@shared/types'
import type { HostKeyStoreService } from '@main/services/hostKeyStore'
import type { SecretStore } from '@main/services/secretStore'
import type { WorkspaceStore } from '@main/services/workspaceStore'

const servers: Server[] = []

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve())))
  )
})

describe('SshManager integration', () => {
  it('authenticates with a password against an in-process SSH server', async () => {
    const hostKey = utils.generateKeyPairSync('ed25519').private
    const server = new Server({ hostKeys: [hostKey] }, (connection: Connection) => {
      connection.on('authentication', (context) => {
        if (
          context.method === 'password' &&
          context.username === 'alice' &&
          context.password === 'secret'
        )
          context.accept()
        else context.reject()
      })
    })
    servers.push(server)
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const port = (server.address() as AddressInfo).port

    const draft = createDefaultProfileDraft()
    draft.name = 'local-test'
    draft.host = '127.0.0.1'
    draft.port = port
    draft.username = 'alice'
    draft.advanced.strictHostKey = false
    const profile: ConnectionProfile = {
      ...draft,
      id: '50fa0651-725d-4c77-866b-d560c28586d7',
      hasPassword: true,
      hasPassphrase: false,
      hasJumpPassword: false,
      hasJumpPassphrase: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    const workspaceStore = { getProfile: () => profile } as unknown as WorkspaceStore
    const secretStore = { get: () => 'secret' } as unknown as SecretStore
    const hostKeyStore = {
      fingerprint: () => 'SHA256:test',
      find: () => ({ fingerprint: 'SHA256:test' })
    } as unknown as HostKeyStoreService
    const statuses: string[] = []
    const manager = new SshManager(workspaceStore, secretStore, hostKeyStore, (status) =>
      statuses.push(status.state)
    )

    const status = await manager.connect(profile.id)
    expect(status.state).toBe('connected')
    expect(status.host).toBe('127.0.0.1')
    expect(manager.getClient()).toBeDefined()
    await manager.disconnect()
    expect(manager.getStatus().state).toBe('disconnected')
    expect(statuses).toContain('connecting')
    expect(statuses).toContain('connected')
  })
})
