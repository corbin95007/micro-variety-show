import { getUserId, supabase } from '../../_lib/supabase.js'
import { consumeRecoveryHandoffGrant } from '../../../shared/authHandoff.js'

function jsonError(res, status, error) {
  return res.status(status).json({ error })
}

function readBearer(req) {
  const header = req.headers.authorization || ''
  if (!header.startsWith('Bearer ')) return ''
  return header.slice('Bearer '.length).trim()
}

async function persistRecoveryGrantUse(result) {
  if (!supabase) throw new Error('Missing environment variable: SUPABASE_SERVICE_ROLE_KEY')

  const { error } = await supabase
    .from('auth_handoff_consumptions')
    .insert({
      nonce: result.nonce,
      user_id: result.userId,
      flow: result.flow,
      expires_at: new Date(result.expiresAt).toISOString(),
    })

  if (error) {
    if (error.code === '23505') return { ok: false, error: 'replayed_grant' }
    throw error
  }

  return { ok: true }
}

export async function handleRecoveryConsume(req, res, options = {}) {
  if (req.method !== 'POST') {
    res.setHeader?.('Allow', 'POST')
    return res.status(405).end()
  }

  const bearerToken = readBearer(req)
  if (!bearerToken) return jsonError(res, 401, 'unauthorized')

  const currentUserId = options.userId || await getUserId(req)
  if (!currentUserId) return jsonError(res, 401, 'unauthorized')

  const result = consumeRecoveryHandoffGrant({
    grant: req.body?.grant,
    currentUserId,
    bearerToken,
  }, {
    env: options.env || process.env,
    secret: options.secret,
    now: options.now,
  })

  if (!result.ok) return jsonError(res, 403, 'invalid_recovery_handoff')

  try {
    const persisted = options.persistGrantUse
      ? await options.persistGrantUse(result)
      : await persistRecoveryGrantUse(result)
    if (!persisted?.ok) return jsonError(res, 403, 'invalid_recovery_handoff')
  } catch (error) {
    console.error('Failed to persist recovery handoff consumption:', error)
    return jsonError(res, 500, 'recovery_handoff_not_configured')
  }

  return res.json({
    ok: true,
    flow: result.flow,
    userId: result.userId,
    expiresAt: result.expiresAt,
  })
}

export default handleRecoveryConsume
