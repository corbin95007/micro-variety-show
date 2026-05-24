import crypto from 'node:crypto'

import {
  normalizeQueryValue,
  sanitizeAuthNextPath,
  sanitizeInviteCode,
} from './authRedirects.js'

export const AUTH_HANDOFF_TTL_MS = 5 * 60 * 1000
export const AUTH_HANDOFF_VERSION = 1

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64url')
}

function base64UrlDecode(value) {
  return Buffer.from(value, 'base64url').toString('utf8')
}

export function getAuthHandoffSecret(env = process.env) {
  return normalizeQueryValue(env.AUTH_HANDOFF_SECRET).trim()
}

export function hashSessionToken(token = '') {
  if (!token) return ''
  return crypto.createHash('sha256').update(token).digest('base64url')
}

function signPayload(encodedPayload, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(encodedPayload)
    .digest('base64url')
}

function safeEqual(a, b) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && crypto.timingSafeEqual(left, right)
}

export function createSignedAuthHandoff(payload, secret) {
  if (!secret) throw new Error('Missing AUTH_HANDOFF_SECRET')

  const encodedPayload = base64UrlEncode(JSON.stringify(payload))
  const signature = signPayload(encodedPayload, secret)
  return `${encodedPayload}.${signature}`
}

export function buildRecoveryHandoffGrant(session, options = {}) {
  const now = options.now ?? Date.now()
  const secret = options.secret || getAuthHandoffSecret(options.env || process.env)
  const userId = session?.user?.id
  const accessToken = session?.access_token || ''

  if (!userId) throw new Error('Missing recovery handoff user')
  if (!accessToken) throw new Error('Missing recovery handoff session token')

  return createSignedAuthHandoff({
    v: AUTH_HANDOFF_VERSION,
    flow: 'recovery',
    userId,
    exp: now + AUTH_HANDOFF_TTL_MS,
    jti: crypto.randomUUID(),
    next: sanitizeAuthNextPath(options.next, '/reset-password'),
    invite: sanitizeInviteCode(options.invite),
    sessionTokenHash: hashSessionToken(accessToken),
  }, secret)
}

export function verifySignedAuthHandoff(grant, options = {}) {
  const secret = options.secret || getAuthHandoffSecret(options.env || process.env)
  const now = options.now ?? Date.now()

  if (!secret) return { ok: false, error: 'missing_secret' }
  if (typeof grant !== 'string' || !grant.includes('.')) return { ok: false, error: 'invalid_grant' }

  const [encodedPayload, signature, ...extra] = grant.split('.')
  if (!encodedPayload || !signature || extra.length) return { ok: false, error: 'invalid_grant' }

  const expectedSignature = signPayload(encodedPayload, secret)
  if (!safeEqual(signature, expectedSignature)) return { ok: false, error: 'invalid_signature' }

  let payload
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload))
  } catch {
    return { ok: false, error: 'invalid_payload' }
  }

  if (!payload || typeof payload !== 'object') return { ok: false, error: 'invalid_payload' }
  if (payload.v !== AUTH_HANDOFF_VERSION) return { ok: false, error: 'invalid_version' }
  if (payload.flow !== 'recovery') return { ok: false, error: 'invalid_flow' }
  if (typeof payload.userId !== 'string' || !payload.userId) return { ok: false, error: 'invalid_user' }
  if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) return { ok: false, error: 'invalid_expiry' }
  if (payload.exp < now) return { ok: false, error: 'expired_grant' }
  if (typeof payload.sessionTokenHash !== 'string' || !payload.sessionTokenHash) {
    return { ok: false, error: 'invalid_session_binding' }
  }
  if (typeof payload.jti !== 'string' || !payload.jti) return { ok: false, error: 'invalid_nonce' }

  return { ok: true, payload }
}

export function consumeRecoveryHandoffGrant({ grant, currentUserId, bearerToken }, options = {}) {
  const verified = verifySignedAuthHandoff(grant, options)
  if (!verified.ok) return verified

  if (!currentUserId || verified.payload.userId !== currentUserId) {
    return { ok: false, error: 'wrong_user' }
  }

  if (!bearerToken || verified.payload.sessionTokenHash !== hashSessionToken(bearerToken)) {
    return { ok: false, error: 'wrong_session' }
  }

  return {
    ok: true,
    flow: verified.payload.flow,
    userId: verified.payload.userId,
    next: sanitizeAuthNextPath(verified.payload.next, '/reset-password'),
    invite: sanitizeInviteCode(verified.payload.invite),
    expiresAt: verified.payload.exp,
    nonce: verified.payload.jti,
  }
}
