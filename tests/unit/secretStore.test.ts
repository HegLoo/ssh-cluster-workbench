import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { SecretStore, type SecretCipher } from '@main/services/secretStore'

const temporaryDirectories: string[] = []
const cipher: SecretCipher = {
  isAvailable: () => true,
  encrypt: (value) => Buffer.from(`encrypted:${value}`).toString('base64'),
  decrypt: (value) =>
    Buffer.from(value, 'base64')
      .toString('utf8')
      .replace(/^encrypted:/, '')
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe('SecretStore', () => {
  it('encrypts, preserves, removes, and reloads secrets', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'workbench-secrets-'))
    temporaryDirectories.push(directory)
    const store = new SecretStore(cipher)
    await store.open(directory)
    await store.setMany('profile-1', { password: 'top-secret', passphrase: 'key-secret' }, [])
    expect(store.has('profile-1', 'password')).toBe(true)
    expect(store.get('profile-1', 'password')).toBe('top-secret')

    const raw = await readFile(join(directory, 'secrets.json'), 'utf8')
    expect(raw).not.toContain('top-secret')

    await store.setMany('profile-1', { passphrase: 'changed' }, ['password'])
    expect(store.has('profile-1', 'password')).toBe(false)
    expect(store.get('profile-1', 'passphrase')).toBe('changed')

    const reloaded = new SecretStore(cipher)
    await reloaded.open(directory)
    expect(reloaded.get('profile-1', 'passphrase')).toBe('changed')
  })
})
