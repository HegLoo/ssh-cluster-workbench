import { describe, expect, it } from 'vitest'
import {
  basenameRemote,
  dirnameRemote,
  expandRemoteHome,
  joinRemotePath,
  normalizeRemotePath
} from '@main/lib/remotePath'

describe('remote path helpers', () => {
  it('normalizes relative and repeated path separators', () => {
    expect(normalizeRemotePath('a//b/../c', '/home/user')).toBe('/home/user/a/c')
    expect(normalizeRemotePath('/a/./b/')).toBe('/a/b')
  })

  it('joins and splits POSIX paths', () => {
    expect(joinRemotePath('/a', 'b', 'c')).toBe('/a/b/c')
    expect(dirnameRemote('/a/b.txt')).toBe('/a')
    expect(basenameRemote('/a/b.txt')).toBe('b.txt')
  })

  it('expands home shortcuts', () => {
    expect(expandRemoteHome('~', '/home/alice')).toBe('/home/alice')
    expect(expandRemoteHome('~/data', '/home/alice')).toBe('/home/alice/data')
  })
})
