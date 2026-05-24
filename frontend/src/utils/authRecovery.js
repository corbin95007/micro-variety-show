export const RECOVERY_READY_KEY = 'micro-variety-show:auth:recovery-ready'
export const RECOVERY_PENDING_KEY = 'micro-variety-show:auth:recovery-pending'
export const RECOVERY_READY_TTL_MS = 15 * 60 * 1000
export const RECOVERY_PENDING_TTL_MS = 15 * 60 * 1000
export const PASSWORD_RECOVERY_EXCHANGE_REDIRECT_TYPE = 'recovery'

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

export function buildPasswordRecoveryPendingState(now = Date.now()) {
  return {
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

function parsePasswordRecoveryPendingState(raw) {
  if (!raw) return null

  try {
    const state = JSON.parse(raw)
    if (!state || typeof state !== 'object') return null
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

export function isPasswordRecoveryPendingStateValid(state, now = Date.now()) {
  if (!state) return false
  if (now - state.createdAt < 0) return false
  return now - state.createdAt <= RECOVERY_PENDING_TTL_MS
}

export function markPasswordRecoveryPending(options = {}) {
  const storage = options.storage || getSessionStorage()
  if (!storage) return

  const state = buildPasswordRecoveryPendingState(options.now)
  storage.setItem(RECOVERY_PENDING_KEY, JSON.stringify(state))
}

export function hasPasswordRecoveryPending(options = {}) {
  const storage = options.storage || getSessionStorage()
  if (!storage) return false

  const state = parsePasswordRecoveryPendingState(storage.getItem(RECOVERY_PENDING_KEY))
  const valid = isPasswordRecoveryPendingStateValid(state, options.now)
  if (!valid) clearPasswordRecoveryPending({ storage })
  return valid
}

export function clearPasswordRecoveryPending(options = {}) {
  const storage = options.storage || getSessionStorage()
  if (!storage) return

  storage.removeItem(RECOVERY_PENDING_KEY)
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
  clearPasswordRecoveryPending(options)
  clearPasswordRecoveryReady(options)
}

export function clearPasswordRecoveryReadyForOtherUser(userId, options = {}) {
  const storage = options.storage || getSessionStorage()
  if (!storage) return

  const state = parsePasswordRecoveryState(storage.getItem(RECOVERY_READY_KEY))
  if (state && state.userId === userId) return
  clearPasswordRecoveryReady({ storage })
}

export function completePasswordRecoveryCallback(userId, options = {}) {
  const storage = options.storage || getSessionStorage()
  if (!storage) return false

  clearPasswordRecoveryReady({ storage })

  const valid = Boolean(userId) && hasPasswordRecoveryPending({ storage, now: options.now })
  clearPasswordRecoveryPending({ storage })
  if (!valid) return false

  markPasswordRecoveryReady(userId, { storage, now: options.now })
  return true
}

export function isPasswordRecoveryRedirectType(type) {
  return type === PASSWORD_RECOVERY_EXCHANGE_REDIRECT_TYPE
}
