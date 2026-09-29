function collapseSlashes(value: string): string {
  return value.replace(/\/+/g, '/')
}

export function normalizeRemotePath(input: string, cwd = '/'): string {
  const source = input.trim().replace(/\\/g, '/')
  if (!source) return normalizeRemotePath(cwd, '/')
  if (source === '~' || source.startsWith('~/')) return source

  const combined = source.startsWith('/') ? source : `${cwd.replace(/\\/g, '/')}/${source}`
  const parts: string[] = []

  for (const part of collapseSlashes(combined).split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      parts.pop()
    } else {
      parts.push(part)
    }
  }

  return `/${parts.join('/')}`
}

export function joinRemotePath(...parts: string[]): string {
  const filtered = parts.filter(Boolean)
  if (filtered.length === 0) return '/'
  return normalizeRemotePath(filtered.join('/'))
}

export function dirnameRemote(path: string): string {
  const normalized = normalizeRemotePath(path)
  if (normalized === '/') return '/'
  const index = normalized.lastIndexOf('/')
  return index <= 0 ? '/' : normalized.slice(0, index)
}

export function basenameRemote(path: string): string {
  const normalized = normalizeRemotePath(path)
  if (normalized === '/') return '/'
  return normalized.slice(normalized.lastIndexOf('/') + 1)
}

export function expandRemoteHome(path: string, home: string): string {
  if (path === '~') return normalizeRemotePath(home)
  if (path.startsWith('~/')) return joinRemotePath(home, path.slice(2))
  return normalizeRemotePath(path)
}
