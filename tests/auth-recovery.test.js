import { afterEach, describe, expect, it, vi } from 'vitest'

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key'
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-anon-key'

const {
  RECOVERY_READY_KEY,
  RECOVERY_READY_TTL_MS,
  PASSWORD_RECOVERY_FLOW,
  buildPasswordRecoveryState,
  clearPasswordRecoveryReady,
  clearPasswordRecoveryReadyForOtherUser,
  clearPasswordRecoveryState,
  completePasswordRecoverySession,
  hasPasswordRecoveryReady,
  isRetryableAuthSessionError,
  isPasswordRecoveryStateValid,
  markConsumedPasswordRecoveryReady,
  markPasswordRecoveryReady,
} = await import('../frontend/src/utils/authRecovery.js')

const {
  AUTH_HANDOFF_TTL_MS,
  buildRecoveryHandoffGrant,
  consumeRecoveryHandoffGrant,
  createSignedAuthHandoff,
} = await import('../shared/authHandoff.js')

const {
  buildSafeAuthQuery,
  getSafeAuthNextPath,
  getSafeLoginRedirectPath,
  normalizeQueryValue,
  sanitizeAuthNextPath,
  sanitizeInviteCode,
} = await import('../shared/authRedirects.js')

const {
  buildSessionRedirectUrl,
  handleAuthCallback,
  validateCallbackQuery,
} = await import('../api/auth/callback.js')

const { handleRecoveryConsume } = await import('../api/auth/recovery/consume.js')

const {
  checkPasswordResetCooldown,
  handlePasswordReset,
  hashEmail,
} = await import('../api/auth/password-reset.js')

afterEach(() => {
  vi.restoreAllMocks()
})

function createStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  }
}

function createRes() {
  return {
    statusCode: 200,
    headers: {},
    redirectStatus: null,
    redirectUrl: null,
    body: null,
    setHeader(key, value) {
      this.headers[key] = value
      return this
    },
    status(code) {
      this.statusCode = code
      return this
    },
    json(body) {
      this.body = body
      return this
    },
    end() {
      this.ended = true
      return this
    },
    redirect(code, url) {
      this.redirectStatus = code
      this.redirectUrl = url
      return this
    },
  }
}

describe('password recovery handoff marker', () => {
  it('creates a user-bound ready marker only from the verified recovery flow', () => {
    const storage = createStorage()

    expect(completePasswordRecoverySession('user-a', 'signup', { storage, now: 1000 })).toBe(false)
    expect(storage.getItem(RECOVERY_READY_KEY)).toBeNull()

    expect(completePasswordRecoverySession('user-a', PASSWORD_RECOVERY_FLOW, { storage, now: 1001 })).toBe(true)
    expect(hasPasswordRecoveryReady('user-a', { storage, now: 1002 })).toBe(true)
    expect(hasPasswordRecoveryReady('user-b', { storage, now: 1002 })).toBe(false)
  })

  it('does not let a normal login session open the reset form', () => {
    const storage = createStorage()

    expect(hasPasswordRecoveryReady('logged-in-user', { storage, now: 1000 })).toBe(false)
  })

  it('does not authorize a tampered query flow without a consumed server grant', () => {
    const storage = createStorage()

    expect(hasPasswordRecoveryReady('user-a', { storage, now: 1000 })).toBe(false)
    expect(markConsumedPasswordRecoveryReady({ ok: true, flow: 'signup', userId: 'user-a' }, { storage })).toBe(false)
    expect(storage.getItem(RECOVERY_READY_KEY)).toBeNull()
  })

  it('expires stale recovery markers', () => {
    const state = buildPasswordRecoveryState('user-a', 1000)

    expect(isPasswordRecoveryStateValid(state, 'user-a', 1000 + RECOVERY_READY_TTL_MS)).toBe(true)
    expect(isPasswordRecoveryStateValid(state, 'user-a', 1001 + RECOVERY_READY_TTL_MS)).toBe(false)
  })

  it('clears malformed and mismatched markers', () => {
    const storage = createStorage()
    storage.setItem(RECOVERY_READY_KEY, '1')

    expect(hasPasswordRecoveryReady('user-a', { storage, now: 1000 })).toBe(false)
    expect(storage.getItem(RECOVERY_READY_KEY)).toBeNull()

    markPasswordRecoveryReady('user-a', { storage, now: 1000 })
    clearPasswordRecoveryReadyForOtherUser('user-a', { storage })
    expect(hasPasswordRecoveryReady('user-a', { storage, now: 1001 })).toBe(true)

    clearPasswordRecoveryReadyForOtherUser('user-b', { storage })
    expect(storage.getItem(RECOVERY_READY_KEY)).toBeNull()

    markPasswordRecoveryReady('user-a', { storage, now: 1000 })
    clearPasswordRecoveryReady({ storage })
    expect(storage.getItem(RECOVERY_READY_KEY)).toBeNull()

    markPasswordRecoveryReady('user-a', { storage, now: 1000 })
    clearPasswordRecoveryState({ storage })
    expect(storage.getItem(RECOVERY_READY_KEY)).toBeNull()
  })
})

describe('auth session handoff retry classifier', () => {
  it('retries only transient lock and browser storage failures', () => {
    expect(isRetryableAuthSessionError(new Error('NavigatorLockAcquireTimeoutError: lock request timed out'))).toBe(true)
    expect(isRetryableAuthSessionError(new Error('Failed to access localStorage while setting auth session'))).toBe(true)
    expect(isRetryableAuthSessionError(new Error('Invalid Refresh Token: Already Used'))).toBe(false)
    expect(isRetryableAuthSessionError(new Error('refresh token expired'))).toBe(false)
  })
})

describe('auth redirect helpers', () => {
  it('accepts only safe same-app paths', () => {
    expect(sanitizeAuthNextPath('/reset-password')).toBe('/reset-password')
    expect(sanitizeAuthNextPath('/test/result/1?x=1#top')).toBe('/test/result/1?x=1#top')
    expect(sanitizeAuthNextPath('/auth/callback')).toBe('/')
    expect(sanitizeAuthNextPath('/auth/session')).toBe('/')
    expect(sanitizeAuthNextPath('/auth/session?next=%2Fuser')).toBe('/')
    expect(sanitizeAuthNextPath('//evil.example/reset-password')).toBe('/')
    expect(sanitizeAuthNextPath('https://evil.example/reset-password')).toBe('/')
  })

  it('uses one helper family for auth and login redirects', () => {
    expect(getSafeAuthNextPath({ next: '/user' })).toBe('/user')
    expect(getSafeLoginRedirectPath({ redirect: '/user' })).toBe('/user')
    expect(getSafeLoginRedirectPath({ redirect: '/login' })).toBe('/')
    expect(getSafeLoginRedirectPath({ redirect: '//evil.example' })).toBe('/')
    expect(normalizeQueryValue(['a', 'b'])).toBe('a')
  })

  it('sanitizes invite codes and safe auth query', () => {
    expect(sanitizeInviteCode(' ABC_12-xy! ')).toBe('abc_12-xy')

    const query = buildSafeAuthQuery({
      flow: 'signup',
      next: '//evil.example',
      invite: 'Invite-1!',
    })

    expect(query.get('flow')).toBe('signup')
    expect(query.has('next')).toBe(false)
    expect(query.get('invite')).toBe('invite-1')
  })
})

describe('server auth callback', () => {
  it('validates required token hash and allowed types', () => {
    expect(validateCallbackQuery({ type: 'signup' }).error).toBe('missing_token_hash')
    expect(validateCallbackQuery({ token_hash: 'abc', type: 'email' }).error).toBe('invalid_type')
    expect(validateCallbackQuery({ token_hash: 'abc', type: 'recovery', next: '/user' })).toMatchObject({
      tokenHash: 'abc',
      type: 'recovery',
      next: '/reset-password',
    })
  })

  it('builds session handoff URL with tokens only in fragment', () => {
    const url = new URL(buildSessionRedirectUrl('https://app.example.com', {
      access_token: 'access-1',
      refresh_token: 'refresh-1',
      token_type: 'bearer',
      expires_in: 3600,
    }, {
      flow: 'signup',
      next: '/user?tab=profile',
      invite: 'Invite-1',
    }))

    expect(url.origin).toBe('https://app.example.com')
    expect(url.pathname).toBe('/auth/session')
    expect(url.searchParams.get('flow')).toBe('signup')
    expect(url.searchParams.get('next')).toBe('/user?tab=profile')
    expect(url.searchParams.get('invite')).toBe('invite-1')
    expect(url.search).not.toContain('access-1')
    expect(url.hash).toContain('access_token=access-1')
    expect(url.hash).toContain('refresh_token=refresh-1')
  })

  it('rejects production HTTP APP_BASE_URL and allows local dev HTTP', async () => {
    const blocked = createRes()
    await handleAuthCallback({ method: 'GET', query: {} }, blocked, {
      env: { APP_BASE_URL: 'http://app.example.com', NODE_ENV: 'production' },
      authClient: {},
    })

    expect(blocked.statusCode).toBe(500)
    expect(blocked.body.error).toBe('auth_callback_not_configured')

    const local = createRes()
    await handleAuthCallback({ method: 'GET', query: { type: 'signup' } }, local, {
      env: { APP_BASE_URL: 'http://localhost:5173', NODE_ENV: 'development' },
      authClient: {},
    })

    expect(local.redirectUrl).toBe('http://localhost:5173/login?auth_error=missing_token_hash')
  })

  it('allows only GET', async () => {
    const res = createRes()
    await handleAuthCallback({ method: 'POST', query: {} }, res, {
      env: { APP_BASE_URL: 'https://app.example.com' },
      authClient: {},
    })

    expect(res.statusCode).toBe(405)
    expect(res.headers.Allow).toBe('GET')
  })

  it('fails closed when APP_BASE_URL is missing', async () => {
    const res = createRes()
    await handleAuthCallback({ method: 'GET', query: {} }, res, {
      env: {},
      authClient: {},
    })

    expect(res.statusCode).toBe(500)
    expect(res.body.error).toBe('auth_callback_not_configured')
  })

  it('redirects invalid requests to a limited login error', async () => {
    const res = createRes()
    await handleAuthCallback({ method: 'GET', query: { type: 'signup' } }, res, {
      env: { APP_BASE_URL: 'https://app.example.com' },
      authClient: {},
    })

    expect(res.redirectStatus).toBe(302)
    expect(res.redirectUrl).toBe('https://app.example.com/login?auth_error=missing_token_hash')
  })

  it('verifies token hash with the auth client and redirects to session handoff', async () => {
    const verifyOtp = vi.fn(async () => ({
      data: {
        session: {
          access_token: 'access-1',
          refresh_token: 'refresh-1',
          token_type: 'bearer',
          expires_in: 3600,
          user: {
            user_metadata: {},
          },
        },
      },
      error: null,
    }))
    const res = createRes()

    await handleAuthCallback({
      method: 'GET',
      query: {
        token_hash: 'hash-1',
        type: 'signup',
        next: '/user',
        invite: 'Invite-1',
      },
    }, res, {
      env: { APP_BASE_URL: 'https://app.example.com' },
      authClient: { auth: { verifyOtp } },
    })

    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'hash-1', type: 'signup' })
    expect(res.redirectStatus).toBe(302)
    const url = new URL(res.redirectUrl)
    expect(url.pathname).toBe('/auth/session')
    expect(url.searchParams.get('flow')).toBe('signup')
    expect(url.searchParams.get('next')).toBe('/user')
    expect(url.searchParams.get('invite')).toBe('invite-1')
    expect(url.hash).toContain('access_token=access-1')
  })

  it('does not create a recovery grant for signup handoff', async () => {
    const res = createRes()

    await handleAuthCallback({
      method: 'GET',
      query: {
        token_hash: 'hash-1',
        type: 'signup',
      },
    }, res, {
      env: { APP_BASE_URL: 'https://app.example.com', AUTH_HANDOFF_SECRET: 'secret-1' },
      authClient: {
        auth: {
          verifyOtp: vi.fn(async () => ({
            data: {
              session: {
                access_token: 'access-1',
                refresh_token: 'refresh-1',
                user: { id: 'user-a', user_metadata: {} },
              },
            },
            error: null,
          })),
        },
      },
    })

    const url = new URL(res.redirectUrl)
    const hash = new URLSearchParams(url.hash.slice(1))
    expect(url.searchParams.get('flow')).toBe('signup')
    expect(hash.has('recovery_grant')).toBe(false)
  })

  it('creates a signed recovery grant only after verified recovery', async () => {
    const res = createRes()

    await handleAuthCallback({
      method: 'GET',
      query: {
        token_hash: 'hash-1',
        type: 'recovery',
      },
    }, res, {
      env: { APP_BASE_URL: 'https://app.example.com', AUTH_HANDOFF_SECRET: 'secret-1' },
      now: 1000,
      authClient: {
        auth: {
          verifyOtp: vi.fn(async () => ({
            data: {
              session: {
                access_token: 'access-1',
                refresh_token: 'refresh-1',
                user: { id: 'user-a', user_metadata: {} },
              },
            },
            error: null,
          })),
        },
      },
    })

    const url = new URL(res.redirectUrl)
    const hash = new URLSearchParams(url.hash.slice(1))
    const grant = hash.get('recovery_grant')
    expect(url.searchParams.get('flow')).toBe('recovery')
    expect(grant).toBeTruthy()
    expect(consumeRecoveryHandoffGrant({
      grant,
      currentUserId: 'user-a',
      bearerToken: 'access-1',
    }, { secret: 'secret-1', now: 1001 }).ok).toBe(true)
  })

  it('uses verified signup metadata for next and invite handoff', async () => {
    const res = createRes()

    await handleAuthCallback({
      method: 'GET',
      query: {
        token_hash: 'hash-1',
        type: 'signup',
      },
    }, res, {
      env: { APP_BASE_URL: 'https://app.example.com' },
      authClient: {
        auth: {
          verifyOtp: vi.fn(async () => ({
            data: {
              session: {
                access_token: 'access-1',
                refresh_token: 'refresh-1',
                user: {
                  user_metadata: {
                    auth_next: '/test',
                    invite_code: 'Invite-1!',
                  },
                },
              },
            },
            error: null,
          })),
        },
      },
    })

    const url = new URL(res.redirectUrl)
    expect(url.searchParams.get('next')).toBe('/test')
    expect(url.searchParams.get('invite')).toBe('invite-1')
  })

  it('logs safe verification failure diagnostics and redirects without leaking tokens', async () => {
    const res = createRes()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const tokenHash = 'secret-token-hash-1'

    await handleAuthCallback({
      method: 'GET',
      query: {
        token_hash: tokenHash,
        type: 'recovery',
      },
    }, res, {
      env: {
        APP_BASE_URL: 'https://app.example.com',
        SUPABASE_URL: 'https://project-ref.supabase.co',
      },
      authClient: {
        auth: {
          verifyOtp: vi.fn(async () => {
            const error = new Error(`bad token_hash=${tokenHash}&access_token=access-1&refresh_token=refresh-1&recovery_grant=grant-1`)
            error.status = 403
            error.code = 'otp_expired'
            return {
              data: null,
              error,
            }
          }),
        },
      },
    })

    expect(res.redirectUrl).toBe('https://app.example.com/login?auth_error=verification_failed')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toBe('Auth callback verification failed:')
    expect(warn.mock.calls[0][1]).toMatchObject({
      type: 'recovery',
      hasTokenHash: true,
      supabaseUrlHost: 'project-ref.supabase.co',
      reason: 'verifyOtp_error',
      errorName: 'Error',
      errorStatus: '403',
      errorCode: 'otp_expired',
    })
    expect(warn.mock.calls[0][1].errorMessage).toContain('token_hash=[REDACTED]')
    expect(warn.mock.calls[0][1].errorMessage).toContain('access_token=[REDACTED]')

    const logged = JSON.stringify(warn.mock.calls)
    expect(logged).not.toContain(tokenHash)
    expect(logged).not.toContain('access-1')
    expect(logged).not.toContain('refresh-1')
    expect(logged).not.toContain('grant-1')
    expect(logged).not.toContain('token_hash=secret-token-hash-1')
    expect(logged).not.toContain('access_token=access-1')
    expect(logged).not.toContain('refresh_token=refresh-1')
    expect(logged).not.toContain('recovery_grant=grant-1')
  })

  it('logs missing-session verification results safely and still uses verification_failed', async () => {
    const res = createRes()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await handleAuthCallback({
      method: 'GET',
      query: {
        token_hash: 'hash-1',
        type: 'recovery',
      },
    }, res, {
      env: {
        APP_BASE_URL: 'https://app.example.com',
        SUPABASE_URL: 'not a url',
      },
      authClient: {
        auth: {
          verifyOtp: vi.fn(async () => ({
            data: { session: null },
            error: null,
          })),
        },
      },
    })

    expect(res.redirectUrl).toBe('https://app.example.com/login?auth_error=verification_failed')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][1]).toMatchObject({
      type: 'recovery',
      hasTokenHash: true,
      supabaseUrlHost: 'invalid_supabase_url',
      reason: 'missing_session',
      errorName: null,
      errorMessage: null,
      errorStatus: null,
      errorCode: null,
    })
  })

  it('redirects verification failures without leaking raw errors to users', async () => {
    const res = createRes()
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    await handleAuthCallback({
      method: 'GET',
      query: {
        token_hash: 'hash-1',
        type: 'recovery',
      },
    }, res, {
      env: { APP_BASE_URL: 'https://app.example.com' },
      authClient: {
        auth: {
          verifyOtp: vi.fn(async () => ({
            data: null,
            error: new Error('raw provider error'),
          })),
        },
      },
    })

    expect(res.redirectUrl).toBe('https://app.example.com/login?auth_error=verification_failed')
    expect(res.redirectUrl).not.toContain('raw provider error')
  })
})

describe('signed recovery handoff consume', () => {
  const session = {
    access_token: 'access-1',
    refresh_token: 'refresh-1',
    user: { id: 'user-a' },
  }

  it('requires a valid signed grant and current bearer session before ready', () => {
    const grant = buildRecoveryHandoffGrant(session, { secret: 'secret-1', now: 1000 })
    const result = consumeRecoveryHandoffGrant({
      grant,
      currentUserId: 'user-a',
      bearerToken: 'access-1',
    }, { secret: 'secret-1', now: 1001 })

    expect(result.ok).toBe(true)
    expect(result.flow).toBe('recovery')
    expect(result.userId).toBe('user-a')
    expect(result.nonce).toBeTruthy()
  })

  it('rejects missing, expired, wrong-user, wrong-session, and bad-signature grants', () => {
    const grant = buildRecoveryHandoffGrant(session, { secret: 'secret-1', now: 1000 })
    const expired = buildRecoveryHandoffGrant(session, { secret: 'secret-1', now: 1000 })
    const badSignature = `${grant.slice(0, -1)}x`

    expect(consumeRecoveryHandoffGrant({
      grant: '',
      currentUserId: 'user-a',
      bearerToken: 'access-1',
    }, { secret: 'secret-1', now: 1001 }).ok).toBe(false)
    expect(consumeRecoveryHandoffGrant({
      grant: expired,
      currentUserId: 'user-a',
      bearerToken: 'access-1',
    }, { secret: 'secret-1', now: 1000 + AUTH_HANDOFF_TTL_MS + 1 }).error).toBe('expired_grant')
    expect(consumeRecoveryHandoffGrant({
      grant,
      currentUserId: 'user-b',
      bearerToken: 'access-1',
    }, { secret: 'secret-1', now: 1001 }).error).toBe('wrong_user')
    expect(consumeRecoveryHandoffGrant({
      grant,
      currentUserId: 'user-a',
      bearerToken: 'access-2',
    }, { secret: 'secret-1', now: 1001 }).error).toBe('wrong_session')
    expect(consumeRecoveryHandoffGrant({
      grant: badSignature,
      currentUserId: 'user-a',
      bearerToken: 'access-1',
    }, { secret: 'secret-1', now: 1001 }).error).toBe('invalid_signature')
  })

  it('rejects ordinary signup signed payloads for reset', () => {
    const grant = createSignedAuthHandoff({
      v: 1,
      flow: 'signup',
      userId: 'user-a',
      exp: 2000,
      sessionTokenHash: 'hash',
      jti: 'nonce-1',
    }, 'secret-1')

    expect(consumeRecoveryHandoffGrant({
      grant,
      currentUserId: 'user-a',
      bearerToken: 'access-1',
    }, { secret: 'secret-1', now: 1000 }).error).toBe('invalid_flow')
  })

  it('persists consume nonce and blocks replay', async () => {
    const grant = buildRecoveryHandoffGrant(session, { secret: 'secret-1', now: 1000 })
    const used = new Set()
    const persistGrantUse = vi.fn(async (result) => {
      if (used.has(result.nonce)) return { ok: false, error: 'replayed_grant' }
      used.add(result.nonce)
      return { ok: true }
    })

    const req = {
      method: 'POST',
      headers: { authorization: 'Bearer access-1' },
      body: { grant },
    }
    const first = createRes()
    await handleRecoveryConsume(req, first, {
      userId: 'user-a',
      secret: 'secret-1',
      now: 1001,
      persistGrantUse,
    })
    expect(first.body).toMatchObject({ ok: true, flow: 'recovery', userId: 'user-a' })

    const second = createRes()
    await handleRecoveryConsume(req, second, {
      userId: 'user-a',
      secret: 'secret-1',
      now: 1002,
      persistGrantUse,
    })
    expect(second.statusCode).toBe(403)
    expect(second.body.error).toBe('invalid_recovery_handoff')
  })

  it('allows only POST and bearer auth on consume endpoint', async () => {
    const getRes = createRes()
    await handleRecoveryConsume({ method: 'GET', headers: {}, body: {} }, getRes, {
      userId: 'user-a',
      secret: 'secret-1',
    })
    expect(getRes.statusCode).toBe(405)
    expect(getRes.headers.Allow).toBe('POST')

    const noAuthRes = createRes()
    await handleRecoveryConsume({ method: 'POST', headers: {}, body: {} }, noAuthRes, {
      userId: 'user-a',
      secret: 'secret-1',
    })
    expect(noAuthRes.statusCode).toBe(401)
  })
})

describe('password reset proxy API', () => {
  it('allows only POST', async () => {
    const res = createRes()
    await handlePasswordReset({ method: 'GET', headers: {}, body: {} }, res, {
      env: { APP_BASE_URL: 'https://app.example.com' },
      authClient: {},
    })

    expect(res.statusCode).toBe(405)
    expect(res.headers.Allow).toBe('POST')
  })

  it('normalizes email and asks Supabase to send the dashboard-templated reset email', async () => {
    const resetPasswordForEmail = vi.fn(async () => ({ error: null }))
    const res = createRes()

    await handlePasswordReset({
      method: 'POST',
      headers: { 'x-forwarded-for': '203.0.113.10' },
      body: { email: '  USER@Example.COM  ' },
    }, res, {
      env: { APP_BASE_URL: 'https://app.example.com' },
      authClient: { auth: { resetPasswordForEmail } },
      cooldownStore: new Map(),
      now: 1000,
    })

    expect(resetPasswordForEmail).toHaveBeenCalledWith('user@example.com')
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ ok: true })
  })

  it('rejects missing and invalid email before calling Supabase', async () => {
    const resetPasswordForEmail = vi.fn(async () => ({ error: null }))
    const missing = createRes()
    await handlePasswordReset({
      method: 'POST',
      headers: {},
      body: { email: '   ' },
    }, missing, {
      authClient: { auth: { resetPasswordForEmail } },
      cooldownStore: new Map(),
    })

    const invalid = createRes()
    await handlePasswordReset({
      method: 'POST',
      headers: {},
      body: { email: 'not-an-email' },
    }, invalid, {
      authClient: { auth: { resetPasswordForEmail } },
      cooldownStore: new Map(),
    })

    expect(missing.statusCode).toBe(400)
    expect(missing.body.error).toBe('请填写邮箱地址')
    expect(invalid.statusCode).toBe(400)
    expect(invalid.body.error).toBe('请填写有效的邮箱地址')
    expect(resetPasswordForEmail).not.toHaveBeenCalled()
  })

  it('applies a 60 second cooldown by email hash and IP without storing plaintext email', async () => {
    const store = new Map()
    const emailHash = hashEmail('user@example.com')

    expect(checkPasswordResetCooldown({
      emailHash,
      ip: '203.0.113.10',
      now: 1000,
      store,
    })).toMatchObject({ ok: true })

    const second = checkPasswordResetCooldown({
      emailHash,
      ip: '203.0.113.10',
      now: 1500,
      store,
    })
    expect(second.ok).toBe(false)
    expect(second.retryAfterSeconds).toBe(60)
    expect(JSON.stringify([...store.entries()])).not.toContain('user@example.com')

    expect(checkPasswordResetCooldown({
      emailHash,
      ip: '203.0.113.10',
      now: 61_001,
      store,
    })).toMatchObject({ ok: true })
  })

  it('returns a friendly cooldown response with retry seconds', async () => {
    const resetPasswordForEmail = vi.fn(async () => ({ error: null }))
    const res = createRes()

    await handlePasswordReset({
      method: 'POST',
      headers: {},
      body: { email: 'user@example.com' },
    }, res, {
      env: { APP_BASE_URL: 'https://app.example.com' },
      authClient: { auth: { resetPasswordForEmail } },
      checkCooldown: () => ({ ok: false, retryAfterSeconds: 42 }),
    })

    expect(resetPasswordForEmail).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(429)
    expect(res.headers['Retry-After']).toBe('42')
    expect(res.body).toMatchObject({
      ok: true,
      retryAfterSeconds: 42,
    })
    expect(res.body.message).toContain('42 秒')
  })

  it('maps Supabase 429 to a friendly response and logs only hashed identifiers', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const res = createRes()

    await handlePasswordReset({
      method: 'POST',
      headers: { 'x-forwarded-for': '203.0.113.10' },
      body: { email: 'user@example.com' },
    }, res, {
      env: { APP_BASE_URL: 'https://app.example.com' },
      cooldownStore: new Map(),
      authClient: {
        auth: {
          resetPasswordForEmail: vi.fn(async () => ({
            error: {
              status: 429,
              message: 'Email rate limit exceeded',
              code: 'over_email_send_rate_limit',
            },
          })),
        },
      },
    })

    expect(res.statusCode).toBe(429)
    expect(res.body.message).toBe('请求过于频繁，请稍后再试。')
    expect(JSON.stringify(warn.mock.calls)).not.toContain('user@example.com')
    expect(JSON.stringify(warn.mock.calls)).toContain(hashEmail('user@example.com'))
  })

  it('does not expose whether the email exists on Supabase errors', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const res = createRes()

    await handlePasswordReset({
      method: 'POST',
      headers: {},
      body: { email: 'missing@example.com' },
    }, res, {
      env: { APP_BASE_URL: 'https://app.example.com' },
      cooldownStore: new Map(),
      authClient: {
        auth: {
          resetPasswordForEmail: vi.fn(async () => ({
            error: new Error('User not found'),
          })),
        },
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ ok: true })
    expect(res.body.message).not.toContain('User not found')
    expect(JSON.stringify(warn.mock.calls)).not.toContain('missing@example.com')
  })
})
