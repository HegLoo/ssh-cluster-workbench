import { describe, expect, it } from 'vitest'
import { formatMode, modeToType } from '@main/lib/mode'

describe('remote file modes', () => {
  it('maps POSIX file types', () => {
    expect(modeToType(0o100644)).toBe('file')
    expect(modeToType(0o040755)).toBe('directory')
    expect(modeToType(0o120777)).toBe('symlink')
  })

  it('formats permissions', () => {
    expect(formatMode(0o100644)).toBe('-rw-r--r--')
    expect(formatMode(0o040755)).toBe('drwxr-xr-x')
  })
})
