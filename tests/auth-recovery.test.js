import { describe, expect, it } from 'vitest'

const {
  RECOVERY_PENDING_KEY,
  RECOVERY_PENDING_TTL_MS,
  RECOVERY_READY_KEY,
  RECOVERY_READY_TTL_MS,
  PASSWORD_RECOVERY_EXCHANGE_REDIRECT_TYPE,
  buildPasswordRecoveryPendingState,
  buildPasswordRecoveryState,
  clearPasswordRecoveryPending,
  clearPasswordRecoveryState,
  clearPasswordRecoveryReady,
  clearPasswordRecoveryReadyForOtherUser,
  completePasswordRecoveryCallback,
  hasPasswordRecoveryPending,
  hasPasswordRecoveryReady,
  isPasswordRecoveryRedirectType,
  isPasswordRecoveryPendingStateValid,
  isPasswordRecoveryStateValid,
  markPasswordRecoveryPending,
  markPasswordRecoveryReady,
} = await import('../frontend/src/utils/authRecovery.js')

const {
  buildPasswordResetRedirect,
  getSafeAuthNextPath,
  normalizeQueryValue,
} = await import('../frontend/src/utils/authRedirects.js')

function createStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  }
}

describe('password recovery marker', () => {
  it('accepts only the exchangeCodeForSession recovery redirect type', () => {
    expect(PASSWORD_RECOVERY_EXCHANGE_REDIRECT_TYPE).toBe('recovery')
    expect(isPasswordRecoveryRedirectType('recovery')).toBe(true)
    expect(isPasswordRecoveryRedirectType('PASSWORD_RECOVERY')).toBe(false)
    expect(isPasswordRecoveryRedirectType('SIGNUP')).toBe(false)
    expect(isPasswordRecoveryRedirectType(undefined)).toBe(false)
  })

  it('does not create a ready marker from a forged reset next without pending state', () => {
    const storage = createStorage()

    expect(completePasswordRecoveryCallback('user-a', { storage, now: 1000 })).toBe(false)
    expect(storage.getItem(RECOVERY_READY_KEY)).toBeNull()
    expect(hasPasswordRecoveryReady('user-a', { storage, now: 1001 })).toBe(false)
  })

  it('requires exchange recovery type plus pending marker before creating ready state', () => {
    const storage = createStorage()
    markPasswordRecoveryPending({ storage, now: 1000 })

    const authEventTypeAllowed = isPasswordRecoveryRedirectType('PASSWORD_RECOVERY')
      && completePasswordRecoveryCallback('user-a', { storage, now: 1001 })

    expect(authEventTypeAllowed).toBe(false)
    expect(hasPasswordRecoveryPending({ storage, now: 1002 })).toBe(true)
    expect(storage.getItem(RECOVERY_READY_KEY)).toBeNull()

    const signupTypeAllowed = isPasswordRecoveryRedirectType('SIGNUP')
      && completePasswordRecoveryCallback('user-a', { storage, now: 1003 })

    expect(signupTypeAllowed).toBe(false)
    expect(hasPasswordRecoveryPending({ storage, now: 1004 })).toBe(true)
    expect(storage.getItem(RECOVERY_READY_KEY)).toBeNull()

    const emptyTypeAllowed = isPasswordRecoveryRedirectType('')
      && completePasswordRecoveryCallback('user-a', { storage, now: 1005 })

    expect(emptyTypeAllowed).toBe(false)
    expect(hasPasswordRecoveryPending({ storage, now: 1006 })).toBe(true)
    expect(storage.getItem(RECOVERY_READY_KEY)).toBeNull()

    const exchangeTypeAllowed = isPasswordRecoveryRedirectType('recovery')
      && completePasswordRecoveryCallback('user-a', { storage, now: 1007 })

    expect(exchangeTypeAllowed).toBe(true)
    expect(storage.getItem(RECOVERY_PENDING_KEY)).toBeNull()
    expect(hasPasswordRecoveryReady('user-a', { storage, now: 1008 })).toBe(true)
  })

  it('turns a valid pending recovery callback into a user-bound ready marker', () => {
    const storage = createStorage()
    markPasswordRecoveryPending({ storage, now: 1000 })

    expect(hasPasswordRecoveryPending({ storage, now: 1001 })).toBe(true)
    expect(completePasswordRecoveryCallback('user-a', { storage, now: 1002 })).toBe(true)
    expect(storage.getItem(RECOVERY_PENDING_KEY)).toBeNull()
    expect(hasPasswordRecoveryReady('user-a', { storage, now: 1003 })).toBe(true)
    expect(hasPasswordRecoveryReady('user-b', { storage, now: 1003 })).toBe(false)
  })

  it('expires stale pending markers and refuses to create ready state', () => {
    const storage = createStorage()
    const state = buildPasswordRecoveryPendingState(1000)
    storage.setItem(RECOVERY_PENDING_KEY, JSON.stringify(state))

    expect(isPasswordRecoveryPendingStateValid(state, 1000 + RECOVERY_PENDING_TTL_MS)).toBe(true)
    expect(completePasswordRecoveryCallback('user-a', {
      storage,
      now: 1001 + RECOVERY_PENDING_TTL_MS,
    })).toBe(false)
    expect(storage.getItem(RECOVERY_PENDING_KEY)).toBeNull()
    expect(storage.getItem(RECOVERY_READY_KEY)).toBeNull()
  })

  it('clears pending and ready markers together when a flow is terminated', () => {
    const storage = createStorage()
    markPasswordRecoveryPending({ storage, now: 1000 })
    markPasswordRecoveryReady('user-a', { storage, now: 1000 })

    clearPasswordRecoveryState({ storage })

    expect(storage.getItem(RECOVERY_PENDING_KEY)).toBeNull()
    expect(storage.getItem(RECOVERY_READY_KEY)).toBeNull()
  })

  it('binds the marker to one user id', () => {
    const storage = createStorage()
    markPasswordRecoveryReady('user-a', { storage, now: 1000 })

    expect(hasPasswordRecoveryReady('user-a', { storage, now: 1001 })).toBe(true)
    expect(hasPasswordRecoveryReady('user-b', { storage, now: 1001 })).toBe(false)
    expect(storage.getItem(RECOVERY_READY_KEY)).toBeNull()
  })

  it('expires stale recovery markers', () => {
    const state = buildPasswordRecoveryState('user-a', 1000)

    expect(isPasswordRecoveryStateValid(state, 'user-a', 1000 + RECOVERY_READY_TTL_MS)).toBe(true)
    expect(isPasswordRecoveryStateValid(state, 'user-a', 1001 + RECOVERY_READY_TTL_MS)).toBe(false)
  })

  it('clears malformed and terminal markers', () => {
    const storage = createStorage()
    storage.setItem(RECOVERY_READY_KEY, '1')

    expect(hasPasswordRecoveryReady('user-a', { storage, now: 1000 })).toBe(false)
    expect(storage.getItem(RECOVERY_READY_KEY)).toBeNull()

    markPasswordRecoveryReady('user-a', { storage, now: 1000 })
    clearPasswordRecoveryReady({ storage })
    expect(storage.getItem(RECOVERY_READY_KEY)).toBeNull()

    storage.setItem(RECOVERY_PENDING_KEY, '1')
    expect(hasPasswordRecoveryPending({ storage, now: 1000 })).toBe(false)
    expect(storage.getItem(RECOVERY_PENDING_KEY)).toBeNull()

    markPasswordRecoveryPending({ storage, now: 1000 })
    clearPasswordRecoveryPending({ storage })
    expect(storage.getItem(RECOVERY_PENDING_KEY)).toBeNull()
  })

  it('can preserve only the matching user marker when auth state changes', () => {
    const storage = createStorage()
    markPasswordRecoveryReady('user-a', { storage, now: 1000 })

    clearPasswordRecoveryReadyForOtherUser('user-a', { storage })
    expect(hasPasswordRecoveryReady('user-a', { storage, now: 1001 })).toBe(true)

    clearPasswordRecoveryReadyForOtherUser('user-b', { storage })
    expect(storage.getItem(RECOVERY_READY_KEY)).toBeNull()
  })
})

describe('auth redirect helpers', () => {
  it('builds the password reset callback URL', () => {
    expect(buildPasswordResetRedirect('https://app.example.com')).toBe(
      'https://app.example.com/auth/callback?next=%2Freset-password'
    )
  })

  it('accepts only same-origin route-style next paths', () => {
    expect(getSafeAuthNextPath({ next: '/reset-password' })).toBe('/reset-password')
    expect(getSafeAuthNextPath({ next: '/auth/callback' })).toBe('/')
    expect(getSafeAuthNextPath({ next: '/auth/callback?next=%2Freset-password' })).toBe('/')
    expect(getSafeAuthNextPath({ next: '/auth/callback#code=abc' })).toBe('/')
    expect(getSafeAuthNextPath({ next: '/auth/callback/loop?next=%2Freset-password' })).toBe('/')
    expect(getSafeAuthNextPath({ next: 'https://evil.example/reset-password' })).toBe('/')
    expect(getSafeAuthNextPath({ next: '//evil.example/reset-password' })).toBe('/')
    expect(getSafeAuthNextPath({ next: ['/', '/reset-password'] })).toBe('/')
  })

  it('normalizes router query values', () => {
    expect(normalizeQueryValue(['a', 'b'])).toBe('a')
    expect(normalizeQueryValue('a')).toBe('a')
    expect(normalizeQueryValue(undefined)).toBe('')
  })
})
