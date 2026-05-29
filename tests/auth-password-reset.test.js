import { afterEach, describe, expect, it, vi } from 'vitest'

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key'
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-anon-key'

const {
  checkPasswordResetCooldown,
  handlePasswordReset,
  hashEmail,
} = await import('../api/auth/password-reset.js')

afterEach(() => {
  vi.restoreAllMocks()
})

function createRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    ended: false,
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
  }
}

describe('password reset API handler', () => {
  it('allows only POST', async () => {
    const res = createRes()

    await handlePasswordReset({ method: 'GET', headers: {}, body: {} }, res, {
      env: { APP_BASE_URL: 'https://app.example.com' },
      authClient: {},
    })

    expect(res.statusCode).toBe(405)
    expect(res.headers.Allow).toBe('POST')
    expect(res.ended).toBe(true)
  })

  it('rejects missing and invalid email without calling Supabase', async () => {
    const resetPasswordForEmail = vi.fn()

    for (const email of ['', '   ', 'not-an-email', 'user@', '@example.com']) {
      const res = createRes()
      await handlePasswordReset({ method: 'POST', headers: {}, body: { email } }, res, {
        env: { APP_BASE_URL: 'https://app.example.com' },
        authClient: { auth: { resetPasswordForEmail } },
      })

      expect(res.statusCode).toBe(400)
      expect(String(res.body?.error || '')).toContain('邮箱')
    }

    expect(resetPasswordForEmail).not.toHaveBeenCalled()
  })

  it('sends the first valid request with normalized email and the dashboard reset template', async () => {
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
    expect(JSON.stringify(res.body)).not.toContain('user@example.com')
  })

  it('cools down repeated requests for the same email and IP for 60 seconds', async () => {
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

    expect(second).toMatchObject({ ok: false, retryAfterSeconds: 60 })
    expect(JSON.stringify([...store.entries()])).not.toContain('user@example.com')

    expect(checkPasswordResetCooldown({
      emailHash,
      ip: '203.0.113.10',
      now: 61_001,
      store,
    })).toMatchObject({ ok: true })
  })

  it('maps local cooldown to a friendly 429 without leaking the email', async () => {
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
    expect(res.body).toMatchObject({ ok: true, retryAfterSeconds: 42 })
    expect(res.body.message).toContain('42 秒')
    expect(JSON.stringify(res.body)).not.toContain('user@example.com')
  })

  it('maps Supabase 429 to a friendly error and logs only hashed identifiers', async () => {
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
              message: 'Email rate limit exceeded for user@example.com',
              code: 'over_email_send_rate_limit',
            },
          })),
        },
      },
    })

    const logs = JSON.stringify(warn.mock.calls)
    expect(res.statusCode).toBe(429)
    expect(res.body.message).toBe('请求过于频繁，请稍后再试。')
    expect(JSON.stringify(res.body)).not.toContain('user@example.com')
    expect(logs).toContain(hashEmail('user@example.com'))
    expect(logs).not.toContain('user@example.com')
  })

  it('does not reveal whether a Supabase email exists', async () => {
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
            error: new Error('User not found: missing@example.com'),
          })),
        },
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ ok: true })
    expect(JSON.stringify(res.body)).not.toContain('missing@example.com')
    expect(JSON.stringify(warn.mock.calls)).not.toContain('missing@example.com')
  })
})
