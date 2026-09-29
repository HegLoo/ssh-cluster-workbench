import { z } from 'zod'

export const sshAlgorithmOptionsSchema = z.object({
  kex: z.array(z.string().trim().min(1)).max(50),
  cipher: z.array(z.string().trim().min(1)).max(50),
  serverHostKey: z.array(z.string().trim().min(1)).max(50),
  hmac: z.array(z.string().trim().min(1)).max(50)
})

export const advancedSshOptionsSchema = z.object({
  jumpHost: z.string().trim().max(255),
  jumpPort: z.number().int().min(1).max(65_535),
  jumpUsername: z.string().trim().max(255),
  jumpAuthType: z.enum(['password', 'privateKey']),
  jumpPrivateKeyPath: z.string().max(4096),
  connectTimeoutMs: z.number().int().min(1_000).max(300_000),
  keepaliveIntervalMs: z.number().int().min(0).max(300_000),
  keepaliveCountMax: z.number().int().min(0).max(100),
  compress: z.boolean(),
  forceIPv4: z.boolean(),
  forceIPv6: z.boolean(),
  strictHostKey: z.boolean(),
  algorithms: sshAlgorithmOptionsSchema,
  extra: z.record(
    z.string().trim().min(1).max(100),
    z.union([z.string().max(1000), z.number(), z.boolean()])
  )
})

export const connectionProfileDraftSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  host: z.string().trim().min(1).max(255),
  port: z.number().int().min(1).max(65_535),
  username: z.string().trim().min(1).max(255),
  authType: z.enum(['password', 'privateKey']),
  privateKeyPath: z.string().max(4096),
  remoteStartDir: z.string().trim().min(1).max(4096),
  advanced: advancedSshOptionsSchema
})

export const secretPayloadSchema = z.object({
  password: z.string().max(4096).optional(),
  passphrase: z.string().max(4096).optional(),
  jumpPassword: z.string().max(4096).optional(),
  jumpPassphrase: z.string().max(4096).optional()
})

export const secretKeySchema = z.enum(['password', 'passphrase', 'jumpPassword', 'jumpPassphrase'])

export const profileSaveRequestSchema = z.object({
  profile: connectionProfileDraftSchema,
  secrets: secretPayloadSchema,
  removeSecrets: z.array(secretKeySchema).max(4)
})

export const transferRequestSchema = z.object({
  localPaths: z.array(z.string().min(1)).max(10_000).optional(),
  remotePaths: z.array(z.string().min(1)).max(10_000).optional(),
  destination: z.string().min(1).max(4096),
  conflictAction: z.enum(['overwrite', 'skip', 'rename']).optional()
})

export const conflictDecisionSchema = z.object({
  conflictId: z.string().uuid(),
  action: z.enum(['overwrite', 'skip', 'rename']),
  applyToAll: z.boolean()
})
