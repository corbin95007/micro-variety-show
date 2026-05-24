export function normalizeQueryValue(value) {
  if (Array.isArray(value)) return value[0] || ''
  return typeof value === 'string' ? value : ''
}

export function getSafeAuthNextPath(query = {}) {
  const next = normalizeQueryValue(query.next).trim()
  if (!next.startsWith('/')) return '/'

  try {
    const target = new URL(next, 'https://app.local')
    if (target.origin !== 'https://app.local') return '/'
    if (target.pathname === '/auth/callback' || target.pathname.startsWith('/auth/callback/')) return '/'
    return `${target.pathname}${target.search}${target.hash}`
  } catch {
    return '/'
  }
}

export function buildPasswordResetRedirect(origin) {
  const callbackUrl = new URL('/auth/callback', origin)
  callbackUrl.searchParams.set('next', '/reset-password')
  return callbackUrl.toString()
}
