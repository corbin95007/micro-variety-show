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
  const [manualAccessResponse, referralResponse] = await Promise.all([
    supabase
      .from(MANUAL_ACCESS_TABLE)
      .select('report_unlocked, note')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('referrals')
      .select('*', { count: 'exact', head: true })
      .eq('inviter_id', userId),
  ])

  if (manualAccessResponse.error && !isIgnorableManualAccessError(manualAccessResponse.error)) {
    throw manualAccessResponse.error
  }

  if (referralResponse.error) throw referralResponse.error

  const referralCount = referralResponse.count || 0
  let manualAccess = manualAccessResponse.data || null

  if (!manualAccess?.report_unlocked) {
    if (process.env.EPISODE_ONE_AIRED === 'true') {
      await setReportUnlocked(userId, true, 'auto')
      manualAccess = { report_unlocked: true, note: 'auto' }
    } else if (referralCount >= 3) {
      await setReportUnlocked(userId, true, 'referral')
      manualAccess = { report_unlocked: true, note: 'referral' }
    }
  }

  const hasManualAccess = Boolean(manualAccess?.report_unlocked)
  const unlockMethod = normalizeUnlockMethod(manualAccess?.note)

  if (hasManualAccess) {
    return { unlocked: true, method: unlockMethod, referralCount }
  }

  return { unlocked: false, method: null, referralCount }
}

function normalizeUnlockMethod(value) {
  const normalized = String(value || '').trim().toLowerCase()

  if (normalized === 'payment') return 'payment'
  if (normalized === 'referral') return 'referral'
  if (normalized === 'auto') return 'auto'
  return MANUAL_UNLOCK_METHOD
}

export async function setReportUnlocked(userId, reportUnlocked, note = null) {
  const payload = {
    user_id: userId,
    report_unlocked: Boolean(reportUnlocked),
  }

  if (note !== undefined) {
    payload.note = note
  }

  const { data, error } = await supabase
    .from(MANUAL_ACCESS_TABLE)
    .upsert(payload, { onConflict: 'user_id' })
    .select('report_unlocked')
    .single()

  if (error) {
    if (isIgnorableManualAccessError(error)) {
      throw new Error('user_report_access 表不存在或未同步，请先执行 supabase/migrations/004_user_report_access.sql')
    }

    throw error
  }

  return Boolean(data?.report_unlocked)
}

export function applyUnlockStateToResult(result, decision) {
  if (!result) return result

  if (decision.unlocked) {
    return {
      ...result,
      is_unlocked: true,
      unlock_method: decision.method,
    }
  }

  return {
    ...result,
    is_unlocked: false,
    unlock_method: null,
    unlocked_at: null,
  }
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

  if (error) throw error
}
