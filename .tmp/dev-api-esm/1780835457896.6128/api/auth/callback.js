import { createSupabaseAuthClient } from '../_lib/supabase.js'
import { getPublicAppOrigin } from '../_lib/auth-url.js'
import {
  buildSafeAuthQuery,
  normalizeQueryValue,
  sanitizeAuthNextPath,
  sanitizeInviteCode,
} from '../../shared/authRedirects.js'
import { buildRecoveryHandoffGrant, getAuthHandoffSecret } from '../../shared/authHandoff.js'

const ALLOWED_TYPES = new Set(['signup', 'recovery', 'magiclink'])
const SENSITIVE_LOG_KEYS = [
  'token_hash',
  'access_token',
  'refresh_token',
  'recovery_grant',
]

function getSupabaseUrlHost(env = process.env) {
  const raw = env.SUPABASE_URL || env.VITE_SUPABASE_URL || ''
  if (!raw) return ''

  try {
    return new URL(raw).host
  } catch {
    return 'invalid_supabase_url'
  }
}

function redactLogValue(value, sensitiveValues = []) {
  if (value == null) return null

  let output = String(value)
  output = output.replace(/https?:\/\/[^\s"'<>]+/gi, (match) => {
    try {
      const url = new URL(match)
      if (url.search) url.search = '?[REDACTED]'
      if (url.hash) url.hash = '#[REDACTED]'
      return url.toString()
    } catch {
      return match
    }
  })
  for (const sensitiveValue of sensitiveValues) {
    if (sensitiveValue) output = output.split(sensitiveValue).join('[REDACTED]')
  }
  for (const key of SENSITIVE_LOG_KEYS) {
    output = output.replace(new RegExp(`${key}=([^\\s&#]+)`, 'gi'), `${key}=[REDACTED]`)
    output = output.replace(new RegExp(`"${key}"\\s*:\\s*"[^"]*"`, 'gi'), `"${key}":"[REDACTED]"`)
  }
  return output
}

function getErrorField(error, key, sensitiveValues = []) {
  const value = error?.[key]
  if (value == null) return null
  return redactLogValue(value, sensitiveValues)
}

function buildVerificationFailureLog({ parsed, env, error, reason }) {
  const sensitiveValues = [parsed.tokenHash]
  return {
    type: parsed.type,
    hasTokenHash: Boolean(parsed.tokenHash),
    supabaseUrlHost: getSupabaseUrlHost(env),
    reason,
    errorName: getErrorField(error, 'name', sensitiveValues),
    errorMessage: getErrorField(error, 'message', sensitiveValues),
    errorStatus: getErrorField(error, 'status', sensitiveValues),
    errorCode: getErrorField(error, 'code', sensitiveValues),
  }
}

function buildFrontendUrl(origin, path, query = null, hash = null) {
  const url = new URL(path, origin)
  if (query) {
    for (const [key, value] of query.entries()) {
      url.searchParams.set(key, value)
    }
  }
  if (hash) url.hash = hash.toString()
  return url.toString()
}

function buildFailureRedirect(origin, code = 'auth_failed') {
  return buildFrontendUrl(origin, '/login', new URLSearchParams({ auth_error: code }))
}

export function buildSessionRedirectUrl(origin, session, options = {}) {
  const query = buildSafeAuthQuery(options)
  const hash = new URLSearchParams()
  hash.set('access_token', session.access_token)
  hash.set('refresh_token', session.refresh_token)
  hash.set('token_type', session.token_type || 'bearer')
  if (session.expires_in) hash.set('expires_in', String(session.expires_in))
  if (options.recoveryGrant) hash.set('recovery_grant', options.recoveryGrant)

  return buildFrontendUrl(origin, '/auth/session', query, hash)
}

export function validateCallbackQuery(query = {}) {
  const tokenHash = normalizeQueryValue(query.token_hash).trim()
  const type = normalizeQueryValue(query.type).trim()

  if (!tokenHash) return { error: 'missing_token_hash' }
  if (!ALLOWED_TYPES.has(type)) return { error: 'invalid_type' }

  return {
    tokenHash,
    type,
    next: type === 'recovery' ? '/reset-password' : sanitizeAuthNextPath(query.next, '/'),
    invite: sanitizeInviteCode(query.invite),
  }
}

export async function handleAuthCallback(req, res, options = {}) {
  if (req.method !== 'GET') {
    res.setHeader?.('Allow', 'GET')
    return res.status(405).end()
  }

  const origin = getPublicAppOrigin(options.env || process.env)
  if (!origin) {
    console.error('Auth callback missing or unsafe APP_BASE_URL')
    return res.status(500).json({ error: 'auth_callback_not_configured' })
  }

  const parsed = validateCallbackQuery(req.query || {})
  if (parsed.error) {
    return res.redirect(302, buildFailureRedirect(origin, parsed.error))
  }

  try {
    const env = options.env || process.env
    const authClient = options.authClient || createSupabaseAuthClient()
    const { data, error } = await authClient.auth.verifyOtp({
      token_hash: parsed.tokenHash,
      type: parsed.type,
    })

    if (error || !data?.session?.access_token || !data?.session?.refresh_token) {
      console.warn('Auth callback verification failed:', buildVerificationFailureLog({
        parsed,
        env,
        error,
        reason: error ? 'verifyOtp_error' : 'missing_session',
      }))
      return res.redirect(302, buildFailureRedirect(origin, 'verification_failed'))
    }

    const metadata = data.session.user?.user_metadata || {}
    const next = parsed.type === 'signup'
      ? sanitizeAuthNextPath(metadata.auth_next || parsed.next, '/')
      : parsed.next
    const invite = parsed.type === 'signup'
      ? sanitizeInviteCode(metadata.invite_code || parsed.invite)
      : parsed.invite
    const recoveryGrant = parsed.type === 'recovery'
      ? buildRecoveryHandoffGrant(data.session, {
        env: options.env || process.env,
        secret: options.secret || getAuthHandoffSecret(options.env || process.env),
        next,
        invite,
        now: options.now,
      })
      : ''

    return res.redirect(302, buildSessionRedirectUrl(origin, data.session, {
      flow: parsed.type,
      next,
      invite,
      recoveryGrant,
    }))
  } catch (error) {
    console.error('Auth callback runtime error:', error)
    return res.redirect(302, buildFailureRedirect(origin, 'server_error'))
  }
}

export default handleAuthCallback
