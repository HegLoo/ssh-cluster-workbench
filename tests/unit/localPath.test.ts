import { describe, expect, it } from 'vitest'
import { sanitizeWindowsName, uniqueDisplayName } from '@main/lib/localPath'

describe('local path helpers', () => {
  it('sanitizes characters that Windows does not allow', () => {
    expect(sanitizeWindowsName('a<b>c:d"e/f\\g|h?i*')).toBe('a_b_c_d_e_f_g_h_i_')
    expect(sanitizeWindowsName('report... ')).toBe('report')
  })

  it('creates deterministic unique names', () => {
    expect(uniqueDisplayName('file.txt', new Set(['file.txt', 'file (1).txt']))).toBe(
      'file (2).txt'
    )
  })
})
