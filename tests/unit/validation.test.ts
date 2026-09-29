import { describe, expect, it } from 'vitest'
import { createDefaultProfileDraft } from '@shared/defaults'
import { conflictDecisionSchema, profileSaveRequestSchema } from '@shared/validation'

describe('IPC validation', () => {
  it('accepts a valid profile save request', () => {
    const draft = createDefaultProfileDraft()
    draft.name = 'cluster'
    draft.host = 'cluster.example.edu'
    draft.username = 'alice'
    const parsed = profileSaveRequestSchema.parse({
      profile: draft,
      secrets: { password: 'secret' },
      removeSecrets: []
    })
    expect(parsed.profile.name).toBe('cluster')
  })

  it('rejects invalid port and conflict action', () => {
    const draft = createDefaultProfileDraft()
    draft.name = 'cluster'
    draft.host = 'cluster.example.edu'
    draft.username = 'alice'
    draft.port = 70_000
    expect(() =>
      profileSaveRequestSchema.parse({ profile: draft, secrets: {}, removeSecrets: [] })
    ).toThrow()
    expect(() =>
      conflictDecisionSchema.parse({ conflictId: 'not-a-uuid', action: 'merge', applyToAll: false })
    ).toThrow()
  })
})
