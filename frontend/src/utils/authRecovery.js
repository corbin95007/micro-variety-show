export const RECOVERY_READY_KEY = 'micro-variety-show:auth:recovery-ready'
export const RECOVERY_READY_TTL_MS = 15 * 60 * 1000
export const PASSWORD_RECOVERY_FLOW = 'recovery'

const NON_RETRYABLE_SESSION_ERROR_PATTERNS = [
  /invalid[\s_-]*(grant|refresh|token|jwt|session)/i,
  /expired/i,
  /not[\s_-]*found/i,
  /unauthori[sz]ed/i,
  /forbidden/i,
  /already[\s_-]*(used|consumed)/i,
]

const TRANSIENT_SESSION_ERROR_PATTERNS = [
  /lock/i,
  /navigator\.locks/i,
  /lockmanager/i,
  /concurr/i,
  /storage/i,
  /indexeddb/i,
  /localstorage/i,
]

function getSessionStorage() {
  return typeof window !== 'undefined' ? window.sessionStorage : null
}

export function buildPasswordRecoveryState(userId, now = Date.now()) {
  if (!userId) throw new Error('Missing recovery user id')

  return {
    userId,
    createdAt: now,
  }
}

function parsePasswordRecoveryState(raw) {
  if (!raw) return null

  try {
    const state = JSON.parse(raw)
    if (!state || typeof state !== 'object') return null
    if (typeof state.userId !== 'string' || !state.userId) return null
    if (typeof state.createdAt !== 'number' || !Number.isFinite(state.createdAt)) return null
    return state
  } catch {
    return null
  }
}

export function isPasswordRecoveryStateValid(state, userId, now = Date.now()) {
  if (!state || !userId) return false
  if (state.userId !== userId) return false
  if (now - state.createdAt < 0) return false
  return now - state.createdAt <= RECOVERY_READY_TTL_MS
}

export function markPasswordRecoveryReady(userId, options = {}) {
  const storage = options.storage || getSessionStorage()
  if (!storage) return

  const state = buildPasswordRecoveryState(userId, options.now)
  storage.setItem(RECOVERY_READY_KEY, JSON.stringify(state))
}

export function hasPasswordRecoveryReady(userId, options = {}) {
  const storage = options.storage || getSessionStorage()
  if (!storage) return false

  const state = parsePasswordRecoveryState(storage.getItem(RECOVERY_READY_KEY))
  const valid = isPasswordRecoveryStateValid(state, userId, options.now)
  if (!valid) clearPasswordRecoveryReady({ storage })
  return valid
}

export function clearPasswordRecoveryReady(options = {}) {
  const storage = options.storage || getSessionStorage()
  if (!storage) return

  storage.removeItem(RECOVERY_READY_KEY)
}

export function clearPasswordRecoveryState(options = {}) {
  clearPasswordRecoveryReady(options)
}

export function clearPasswordRecoveryReadyForOtherUser(userId, options = {}) {
  const storage = options.storage || getSessionStorage()
  if (!storage) return

  const state = parsePasswordRecoveryState(storage.getItem(RECOVERY_READY_KEY))
  if (state && state.userId === userId) return
  clearPasswordRecoveryReady({ storage })
}

export function completePasswordRecoverySession(userId, flow, options = {}) {
  clearPasswordRecoveryReady(options)
  if (flow !== PASSWORD_RECOVERY_FLOW || !userId) return false

  markPasswordRecoveryReady(userId, options)
  return true
}

export function markConsumedPasswordRecoveryReady(result, options = {}) {
  if (!result?.ok || result.flow !== PASSWORD_RECOVERY_FLOW || !result.userId) return false

  markPasswordRecoveryReady(result.userId, options)
  return true
}

export function isRetryableAuthSessionError(error) {
  const text = [
    error?.name,
    error?.message,
    error?.status,
    error?.code,
    typeof error === 'string' ? error : '',
  ].filter(Boolean).join(' ')

  if (!text) return false
  if (NON_RETRYABLE_SESSION_ERROR_PATTERNS.some((pattern) => pattern.test(text))) return false
  return TRANSIENT_SESSION_ERROR_PATTERNS.some((pattern) => pattern.test(text))
}
