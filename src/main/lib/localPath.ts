export function sanitizeWindowsName(name: string): string {
  const safeCharacters = [...name]
    .map((character) => (character.charCodeAt(0) < 32 ? '_' : character))
    .join('')
  const cleaned = safeCharacters
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim()
  return cleaned || 'unnamed'
}

export function uniqueDisplayName(name: string, existing: Set<string>): string {
  if (!existing.has(name)) return name
  const lastDot = name.lastIndexOf('.')
  const base = lastDot > 0 ? name.slice(0, lastDot) : name
  const extension = lastDot > 0 ? name.slice(lastDot) : ''
  for (let index = 1; index < 10_000; index += 1) {
    const candidate = `${base} (${index})${extension}`
    if (!existing.has(candidate)) return candidate
  }
  return `${base}-${Date.now()}${extension}`
}
