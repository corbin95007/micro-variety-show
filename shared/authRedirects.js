const SAFE_AUTH_BASE = 'https://app.local'
const BLOCKED_AUTH_PATHS = new Set([
  '/auth/callback',
  '/auth/session',
  '/login',
])

export function normalizeQueryValue(value) {
  if (Array.isArray(value)) return value[0] || ''
  return typeof value === 'string' ? value : ''
}

export function sanitizeInviteCode(value) {
  return normalizeQueryValue(value).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 64)
}

export function isBlockedAuthPath(pathname) {
  return [...BLOCKED_AUTH_PATHS].some((path) => pathname === path || pathname.startsWith(`${path}/`))
}

export function sanitizeAuthNextPath(value, fallback = '/') {
  const next = normalizeQueryValue(value).trim()
  if (!next || !next.startsWith('/') || next.startsWith('//')) return fallback

  try {
    const target = new URL(next, SAFE_AUTH_BASE)
    if (target.origin !== SAFE_AUTH_BASE) return fallback
    if (isBlockedAuthPath(target.pathname)) return fallback
    return `${target.pathname}${target.search}${target.hash}`
  } catch {
    return fallback
  }
}

export function getSafeAuthNextPath(query = {}, fallback = '/') {
  return sanitizeAuthNextPath(query.next, fallback)
}

export function getSafeLoginRedirectPath(query = {}, fallback = '/') {
  return sanitizeAuthNextPath(query.redirect, fallback)
}

export function buildSafeAuthQuery({ flow = '', next = '/', invite = '' } = {}) {
  const query = new URLSearchParams()
  const safeNext = sanitizeAuthNextPath(next, '/')
  const safeInvite = sanitizeInviteCode(invite)

  if (flow) query.set('flow', flow)
  if (safeNext !== '/') query.set('next', safeNext)
  if (safeInvite) query.set('invite', safeInvite)
  return query
}
