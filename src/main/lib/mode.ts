import type { RemoteEntryType } from '@shared/types'

const TYPE_MASK = 0o170000
const DIRECTORY = 0o040000
const SYMLINK = 0o120000
const REGULAR_FILE = 0o100000

export function modeToType(mode: number): RemoteEntryType {
  const type = mode & TYPE_MASK
  if (type === DIRECTORY) return 'directory'
  if (type === SYMLINK) return 'symlink'
  if (type === REGULAR_FILE) return 'file'
  return 'other'
}

export function formatMode(mode: number): string {
  const type = modeToType(mode)
  const prefix = type === 'directory' ? 'd' : type === 'symlink' ? 'l' : '-'
  const bits = [0o400, 0o200, 0o100, 0o040, 0o020, 0o010, 0o004, 0o002, 0o001]
  const symbols = ['r', 'w', 'x', 'r', 'w', 'x', 'r', 'w', 'x']
  return `${prefix}${bits.map((bit, index) => ((mode & bit) !== 0 ? symbols[index] : '-')).join('')}`
}
