import { supabase } from './supabase.js'
import { evaluateEpisodeOneAiredAutoUnlock } from './dangerous-env.js'

const MANUAL_ACCESS_TABLE = 'user_report_access'
const MANUAL_UNLOCK_METHOD = 'manual'
const MANUAL_ACCESS_FALLBACK_CODES = new Set(['42P01', 'PGRST205'])
const GRANT_REPORT_ACCESS_RPC = 'grant_report_access_with_event'
const REPORT_UNLOCK_PRODUCT_CODE = 'report_unlock'
const REPORT_ACCESS_LEDGER_FALLBACK_CODES = new Set(['42883', 'PGRST202'])
const PAYMENT_SELECT_FOR_UNLOCK_RETRY = [
  'id',
  'user_id',
  'provider',
  'product_code',
  'amount',
  'status',
  'provider_order_no',
  'provider_trade_no',
  'paid_at',
  'updated_at',
].join(', ')

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

function isMissingReportAccessLedgerRpcError(error) {
  if (!error) return false
  if (REPORT_ACCESS_LEDGER_FALLBACK_CODES.has(error.code)) return true

  const errorText = [
    error.message,
    error.details,
    error.hint,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return (
    errorText.includes(GRANT_REPORT_ACCESS_RPC) &&
    (
      errorText.includes('could not find') ||
      errorText.includes('schema cache') ||
      errorText.includes('does not exist') ||
      errorText.includes('function')
    )
  )
}

function buildPaymentUnlockContext(payment, reason = 'payment_success') {
  return {
    reason,
    payment_id: payment?.id ?? null,
    provider: payment?.provider ?? null,
    order_no: payment?.provider_order_no ?? null,
    amount_fen: Number.isInteger(payment?.amount) ? payment.amount : null,
    provider_trade_no: payment?.provider_trade_no ?? null,
    paid_at: payment?.paid_at ?? null,
  }
}

export function buildReportAccessPaymentContext(payment, reason = 'payment_success') {
  return buildPaymentUnlockContext(payment, reason)
}

async function getLatestSuccessfulPaymentForUnlockRetry(userId) {
  const { data, error } = await supabase
    .from('payments')
    .select(PAYMENT_SELECT_FOR_UNLOCK_RETRY)
    .eq('user_id', userId)
    .eq('status', 'success')
    .eq('product_code', REPORT_UNLOCK_PRODUCT_CODE)
    .order('paid_at', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data || null
}

async function retryPaymentLedgerUnlock(userId) {
  const payment = await getLatestSuccessfulPaymentForUnlockRetry(userId)
  if (!payment) return false

  await setReportUnlocked(userId, true, 'payment', {
    source: 'payment',
    actor: 'system:payment-retry',
    context: buildPaymentUnlockContext(payment, 'payment_success_unlock_retry'),
  })

  return true
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
    const episodeAutoUnlock = evaluateEpisodeOneAiredAutoUnlock(process.env)
    if (episodeAutoUnlock.enabled && episodeAutoUnlock.allowed) {
      await setReportUnlocked(userId, true, 'auto', {
        source: 'episode_one_aired',
        requestId: null,
        context: {
          window_start: episodeAutoUnlock.windowStartsAt?.toISOString?.() || null,
          window_expires_at: episodeAutoUnlock.windowExpiresAt?.toISOString?.() || null,
          confirmation: episodeAutoUnlock.auditConfirmation,
        },
      })
      manualAccess = { report_unlocked: true, note: 'auto' }
    } else {
      if (episodeAutoUnlock.enabled && !episodeAutoUnlock.allowed) {
        console.warn('Episode one auto unlock blocked by dangerous env guard:', {
          reasonCode: episodeAutoUnlock.reasonCode,
          windowStartsAt: episodeAutoUnlock.windowStartsAt?.toISOString?.() || null,
          windowExpiresAt: episodeAutoUnlock.windowExpiresAt?.toISOString?.() || null,
        })
      }

      if (referralCount >= 3) {
        await setReportUnlocked(userId, true, 'referral', {
          context: {
            invite_count: referralCount,
            evidence: 'referrals_count',
          },
        })
        manualAccess = { report_unlocked: true, note: 'referral' }
      }

      if (!manualAccess?.report_unlocked) {
        const paymentRetryUnlocked = await retryPaymentLedgerUnlock(userId)
        if (paymentRetryUnlocked) {
          manualAccess = { report_unlocked: true, note: 'payment' }
        }
      }
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

export async function setReportUnlocked(userId, reportUnlocked, note = null, options = {}) {
  const method = normalizeUnlockMethod(note)
  const action = reportUnlocked ? 'grant' : 'revoke'
  const source = options.source || method
  const actor = options.actor || `system:${source}`

  const { data, error } = await supabase.rpc(GRANT_REPORT_ACCESS_RPC, {
    p_user_id: userId,
    p_report_unlocked: Boolean(reportUnlocked),
    p_method: method,
    p_source: source,
    p_action: action,
    p_request_id: options.requestId || null,
    p_actor: actor,
    p_context: options.context || {},
  })

  if (error) {
    if (isIgnorableManualAccessError(error)) {
      throw new Error('user_report_access 表不存在或未同步，请先执行 supabase/migrations/004_user_report_access.sql')
    }

    if (isMissingReportAccessLedgerRpcError(error)) {
      throw new Error('授权账本 RPC 不存在或未同步，请先执行 supabase/migrations/012_report_access_events.sql')
    }

    throw error
  }

  if (Array.isArray(data)) {
    return Boolean(data[0]?.report_unlocked)
  }

  return Boolean(data?.report_unlocked ?? data)
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
