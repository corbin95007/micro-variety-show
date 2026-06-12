import { describe, expect, it, vi, afterEach } from 'vitest'

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key'

const POSTGRES_ERROR = {
  message: 'relation "public.secret_payments" does not exist where token_hash=abc123',
  code: '42P01',
  details: 'SQL: select * from public.secret_payments',
  hint: 'check table feedback_reports and key=super-secret',
}

function createMockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    ended: false,
    status(code) {
      this.statusCode = code
      return this
    },
    setHeader(name, value) {
      this.headers[name] = value
      return this
    },
    json(payload) {
      this.body = payload
      return this
    },
    end() {
      this.ended = true
      return this
    },
  }
}

function createQueryChain(result) {
  const query = {
    select: vi.fn(() => query),
    order: vi.fn(() => query),
    eq: vi.fn(() => query),
    limit: vi.fn(() => query),
    insert: vi.fn(() => query),
    upsert: vi.fn(() => query),
    delete: vi.fn(() => query),
    update: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
    single: vi.fn(async () => result),
    then(resolve, reject) {
      return Promise.resolve(result).then(resolve, reject)
    },
  }

  return query
}

function expectSafeInternalError(res, { error, type, requestId = 'req-test-1' }) {
  expect(res.statusCode).toBe(500)
  expect(res.headers['X-Request-Id']).toBe(requestId)
  expect(res.body).toMatchObject({
    error,
    type,
    requestId,
  })

  const bodyText = JSON.stringify(res.body)
  expect(bodyText).not.toContain('secret_payments')
  expect(bodyText).not.toContain('feedback_reports')
  expect(bodyText).not.toContain('SQL:')
  expect(bodyText).not.toContain('token_hash')
  expect(bodyText).not.toContain('super-secret')
  expect(bodyText).not.toContain('42P01')
}

afterEach(() => {
  vi.doUnmock('../api/_lib/supabase.js')
  vi.doUnmock('../api/_lib/mailer.js')
  vi.restoreAllMocks()
  vi.resetModules()
})

describe('safe API error responses', () => {
  it('redacts sensitive values in server log payloads', async () => {
    const { redactSensitiveText, sanitizeErrorForLog } = await import('../api/_lib/errors.js')
    const text = [
      'https://example.com/api/auth/callback?token_hash=abc123&type=recovery',
      'https://api.payqixiang.cn/api.php?act=order&key=qixiang-secret&sign=abcdef',
      'Authorization: Bearer eyJabc.def.ghi',
      '{"refresh_token":"refresh-secret","password":"plain"}',
    ].join(' ')

    const redacted = redactSensitiveText(text)
    expect(redacted).toContain('[redacted-auth-link]')
    expect(redacted).toContain('key=[redacted]')
    expect(redacted).toContain('sign=[redacted]')
    expect(redacted).toContain('Bearer [redacted]')
    expect(redacted).toContain('"refresh_token":"[redacted]"')
    expect(redacted).toContain('"password":"[redacted]"')
    expect(redacted).not.toContain('qixiang-secret')
    expect(redacted).not.toContain('refresh-secret')

    const safeError = sanitizeErrorForLog({
      message: 'failed with access_token=raw-access-token',
      details: 'refresh_token=raw-refresh-token',
      hint: 'sign=raw-signature',
    })

    expect(JSON.stringify(safeError)).not.toContain('raw-access-token')
    expect(JSON.stringify(safeError)).not.toContain('raw-refresh-token')
    expect(JSON.stringify(safeError)).not.toContain('raw-signature')
  })

  it('does not expose Supabase schema details from anonymous questions errors', async () => {
    vi.doMock('../api/_lib/supabase.js', () => ({
      supabase: {
        from: vi.fn(() => createQueryChain({ data: null, error: POSTGRES_ERROR })),
      },
    }))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const { default: handler } = await import('../api/_lib/test-routes/questions.js')
    const res = createMockResponse()
    await handler({
      method: 'GET',
      headers: { 'x-request-id': 'req-test-1' },
    }, res)

    expectSafeInternalError(res, {
      error: '题目加载失败，请稍后再试',
      type: 'questions_load_failed',
    })
  })

  it('does not expose Supabase details from submit failures', async () => {
    vi.doMock('../api/_lib/supabase.js', () => ({
      getUserId: vi.fn(async () => 'user-12345678'),
      supabase: {
        from: vi.fn(() => createQueryChain({ data: null, error: POSTGRES_ERROR })),
      },
    }))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const { default: handler } = await import('../api/_lib/test-routes/submit.js')
    const res = createMockResponse()
    await handler({
      method: 'POST',
      headers: { 'x-request-id': 'req-test-1' },
      body: { answers: { 1: 5 } },
    }, res)

    expectSafeInternalError(res, {
      error: '提交失败，请稍后再试',
      type: 'submit_load_questions_failed',
    })
  })

  it('does not expose Supabase details from feedback rate limit checks', async () => {
    vi.doMock('../api/_lib/supabase.js', () => ({
      getUserId: vi.fn(async () => 'user-12345678'),
      supabase: {
        from: vi.fn(() => createQueryChain({ data: null, error: POSTGRES_ERROR })),
        auth: {
          admin: {
            getUserById: vi.fn(),
          },
        },
      },
    }))
    vi.doMock('../api/_lib/mailer.js', () => ({
      sendFeedbackEmail: vi.fn(),
      getMailerRuntimeErrorMessage: vi.fn(() => '邮件发送失败'),
    }))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const { default: handler } = await import('../api/feedback/create.js')
    const res = createMockResponse()
    await handler({
      method: 'POST',
      headers: { 'x-request-id': 'req-test-1' },
      body: { message: '这是一条足够长的问题反馈内容' },
    }, res)

    expectSafeInternalError(res, {
      error: '提交问题反馈失败，请稍后再试',
      type: 'feedback_constraint_check_failed',
    })
  })

  it('does not expose Supabase details from referral loading failures', async () => {
    vi.doMock('../api/_lib/supabase.js', () => ({
      getUserId: vi.fn(async () => 'user-12345678'),
      supabase: {
        from: vi.fn(() => createQueryChain({ data: null, error: POSTGRES_ERROR, count: null })),
      },
    }))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const { default: handler } = await import('../api/referral/index.js')
    const res = createMockResponse()
    await handler({
      method: 'GET',
      headers: { 'x-request-id': 'req-test-1' },
    }, res)

    expectSafeInternalError(res, {
      error: '邀请信息加载失败，请稍后再试',
      type: 'referral_profile_load_failed',
    })
  })
})
