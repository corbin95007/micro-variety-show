import { supabase } from './supabase.js'

const MANUAL_ACCESS_TABLE = 'user_report_access'
const MANUAL_UNLOCK_METHOD = 'manual'
const MANUAL_ACCESS_FALLBACK_CODES = new Set(['42P01', 'PGRST205'])

function isIgnorableManualAccessError(error) {
  if (!error) return false
  if (MANUAL_ACCESS_FALLBACK_CODES.has(error.code)) return true

  const errorText = [
    error.message,
    error.details,
    error.hint,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return (
    errorText.includes(MANUAL_ACCESS_TABLE) &&
    (
      errorText.includes('could not find') ||
      errorText.includes('schema cache') ||
      errorText.includes('does not exist') ||
      errorText.includes('relation')
    )
  )
}

export async function getUnlockDecision(userId) {
  if (process.env.EPISODE_ONE_AIRED === 'true') {
    return { unlocked: true, method: 'auto', referralCount: 0 }
  }

  const [
    manualAccessResponse,
    referralResponse,
    paymentResponse,
  ] = await Promise.all([
    supabase
      .from(MANUAL_ACCESS_TABLE)
      .select('report_unlocked')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('referrals')
      .select('*', { count: 'exact', head: true })
      .eq('inviter_id', userId),
    supabase
      .from('payments')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'success')
      .limit(1)
      .maybeSingle(),
  ])

  if (manualAccessResponse.error && !isIgnorableManualAccessError(manualAccessResponse.error)) {
    throw manualAccessResponse.error
  }

  if (referralResponse.error) throw referralResponse.error
  if (paymentResponse.error) throw paymentResponse.error

  const referralCount = referralResponse.count || 0
  const hasManualAccess = Boolean(manualAccessResponse.data?.report_unlocked)

  if (hasManualAccess) {
    return { unlocked: true, method: MANUAL_UNLOCK_METHOD, referralCount }
  }

  if (referralCount >= 3) {
    return { unlocked: true, method: 'referral', referralCount }
  }

  if (paymentResponse.data) {
    return { unlocked: true, method: 'payment', referralCount }
  }

  return { unlocked: false, method: null, referralCount }
}

export function applyUnlockStateToResult(result, decision) {
  if (!result) return result

  if (decision.unlocked) {
    const persistedMethod = result.unlock_method
    const effectiveMethod = persistedMethod && persistedMethod !== MANUAL_UNLOCK_METHOD
      ? persistedMethod
      : decision.method

    return {
      ...result,
      is_unlocked: true,
      unlock_method: effectiveMethod,
    }
  }

  if (result.unlock_method === MANUAL_UNLOCK_METHOD) {
    return {
      ...result,
      is_unlocked: false,
      unlock_method: null,
      unlocked_at: null,
    }
  }

  return result
}

export function applyUnlockStateToResults(results, decision) {
  return (results || []).map((result) => applyUnlockStateToResult(result, decision))
}

export async function persistUnlockDecision(userId, resultId, decision) {
  if (!resultId) return

  if (decision.unlocked) {
    const { error } = await supabase
      .from('test_results')
      .update({
        is_unlocked: true,
        unlock_method: decision.method,
        unlocked_at: new Date().toISOString(),
      })
      .eq('id', resultId)
      .eq('user_id', userId)

    if (error) throw error
    return
  }

  const { error } = await supabase
    .from('test_results')
    .update({
      is_unlocked: false,
      unlock_method: null,
      unlocked_at: null,
    })
    .eq('id', resultId)
    .eq('user_id', userId)
    .eq('unlock_method', MANUAL_UNLOCK_METHOD)

  if (error) throw error
}
