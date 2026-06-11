export function getPublicAppOrigin(env = process.env) {
  const raw = env.APP_BASE_URL || env.PUBLIC_APP_BASE_URL || ''
  if (!raw) return null

  try {
    const url = new URL(raw)
    const isLocalDevHost = ['localhost', '127.0.0.1'].includes(url.hostname)
    if (url.protocol === 'http:' && !(env.NODE_ENV !== 'production' && isLocalDevHost)) return null
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    url.pathname = ''
    url.search = ''
    url.hash = ''
    return url.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

export function buildRecoveryCallbackRedirectTo(origin) {
  const url = new URL('/api/auth/callback', origin)
  url.searchParams.set('type', 'recovery')
  return url.toString()
}
