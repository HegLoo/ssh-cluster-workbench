import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { createDefaultProfileDraft } from '@shared/defaults'
import { SecretStore, type SecretCipher } from '@main/services/secretStore'
import { WorkspaceStore } from '@main/services/workspaceStore'

const temporaryDirectories: string[] = []
const cipher: SecretCipher = {
  isAvailable: () => true,
  encrypt: (value) => Buffer.from(value).toString('base64'),
  decrypt: (value) => Buffer.from(value, 'base64').toString('utf8')
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe('WorkspaceStore', () => {
  it('persists, selects, and removes profiles', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workbench-workspace-'))
    temporaryDirectories.push(root)
    const workspaceDirectory = join(root, 'workspace')
    const secretStore = new SecretStore(cipher)
    const store = new WorkspaceStore(join(root, 'settings.json'), secretStore)
    await store.initialize()
    await store.open(workspaceDirectory)

    const draft = createDefaultProfileDraft()
    draft.name = '测试集群'
    draft.host = 'cluster.example.edu'
    draft.username = 'alice'
    const profile = await store.saveProfile({
      profile: draft,
      secrets: { password: 'secret' },
      removeSecrets: []
    })
    expect(profile.hasPassword).toBe(true)
    expect(store.getConfig().selectedProfileId).toBe(profile.id)

    await store.selectProfile(null)
    expect(store.getConfig().selectedProfileId).toBeNull()
    await store.removeProfile(profile.id)
    expect(store.getConfig().profiles).toHaveLength(0)
  })
})
