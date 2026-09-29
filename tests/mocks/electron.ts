export const dialog = {
  showMessageBoxSync: (): number => 1
}

export const safeStorage = {
  isEncryptionAvailable: (): boolean => true,
  encryptString: (value: string): Buffer => Buffer.from(value, 'utf8'),
  decryptString: (value: Buffer): string => value.toString('utf8')
}
