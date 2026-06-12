import { createSign, generateKeyPairSync } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key'

const {
  buildQixiangOrderParams,
  buildAlipayWapPayForm,
  formatAmountFenToYuan,
  formatAlipayTimestamp,
  generateProviderOrderNo,
  getActivePaymentProvider,
  getAlipayConfig,
  getPaymentProduct,
  getPaymentRuntimeErrorMessage,
  isPaymentsSchemaMismatch,
  queryQixiangTrade,
  queryAlipayTrade,
  resolvePaymentProviderForCreate,
  serializeQixiangParamsForSigning,
  signAlipayParams,
  signQixiangParams,
  toClientPayment,
  verifyAlipaySignature,
  verifyQixiangSignature,
} = await import('../api/_lib/payment.js')
const {
  applyUnlockStateToResult,
} = await import('../api/_lib/unlock.js')

function signAlipayQueryResponse(payload, privateKey) {
  const responseNodeName = 'alipay_trade_query_response'
  const responseContent = JSON.stringify(payload)
  const signer = createSign('RSA-SHA256')
  signer.update(responseContent, 'utf8')
  signer.end()

  return JSON.stringify({
    [responseNodeName]: payload,
    sign: signer.sign(privateKey, 'base64'),
  })
}

function createPaymentPersistenceMock(updatedPayment) {
  const query = {
    update: vi.fn(() => query),
    eq: vi.fn(() => query),
    select: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data: updatedPayment, error: null })),
    single: vi.fn(async () => ({ data: updatedPayment, error: null })),
  }

  return {
    query,
    supabase: {
      from: vi.fn(() => query),
    },
  }
}

async function loadPaymentModuleWithMocks({ updatedPayment = null } = {}) {
  vi.resetModules()

  const persistence = createPaymentPersistenceMock(updatedPayment)
  const setReportUnlocked = vi.fn(async () => null)

  vi.doMock('../api/_lib/supabase.js', () => ({
    supabase: persistence.supabase,
  }))
  vi.doMock('../api/_lib/unlock.js', () => ({
    buildReportAccessPaymentContext: (payment, reason = 'payment_success') => ({
      reason,
      payment_id: payment?.id ?? null,
      provider: payment?.provider ?? null,
      order_no: payment?.provider_order_no ?? null,
      amount_fen: Number.isInteger(payment?.amount) ? payment.amount : null,
      provider_trade_no: payment?.provider_trade_no ?? null,
      paid_at: payment?.paid_at ?? null,
    }),
    setReportUnlocked,
  }))

  const paymentModule = await import('../api/_lib/payment.js')

  return {
    ...paymentModule,
    mocks: {
      ...persistence,
      setReportUnlocked,
    },
  }
}

function restorePaymentModuleMocks() {
  vi.doUnmock('../api/_lib/supabase.js')
  vi.doUnmock('../api/_lib/unlock.js')
  vi.resetModules()
}

function withPaymentEnv(nextEnv) {
  const originalEnv = Object.fromEntries(
    Object.keys(nextEnv).map((key) => [key, process.env[key]])
  )

  Object.entries(nextEnv).forEach(([key, value]) => {
    if (value == null) {
      delete process.env[key]
      return
    }

    process.env[key] = value
  })

  return () => {
    Object.entries(originalEnv).forEach(([key, value]) => {
      if (value == null) {
        delete process.env[key]
        return
      }

      process.env[key] = value
    })
  }
}

function createPendingPayment(overrides = {}) {
  return {
    id: 1,
    user_id: 'user-1',
    provider: 'alipay',
    status: 'pending',
    amount: 990,
    provider_order_no: 'ALI20260501000000ABCD1234',
    provider_trade_no: null,
    buyer_id: null,
    buyer_logon_id: null,
    paid_at: null,
    ...overrides,
  }
}

function createAlipayEnv(privateKey, publicKey) {
  return {
    APP_BASE_URL: 'https://micro-variety-show.vercel.app',
    ALIPAY_NOTIFY_BASE_URL: 'https://micro-variety-show.vercel.app',
    ALIPAY_NOTIFY_URL: 'https://micro-variety-show.vercel.app/api/payment/notify/alipay',
    ALIPAY_APP_ID: 'sandbox-app-id',
    ALIPAY_PRIVATE_KEY: privateKey,
    ALIPAY_PUBLIC_KEY: publicKey,
    ALIPAY_SELLER_ID: '2088123412341234',
    ALIPAY_GATEWAY: 'https://openapi-sandbox.dl.alipaydev.com/gateway.do',
  }
}

function createSuccessfulAlipayQueryPayload(overrides = {}) {
  return {
    code: '10000',
    msg: 'Success',
    out_trade_no: 'ALI20260501000000ABCD1234',
    trade_no: '2026050122001499999999999999',
    buyer_user_id: '2088000000000001',
    buyer_logon_id: 'sandbox_buyer@example.com',
    seller_id: '2088123412341234',
    total_amount: '9.90',
    trade_status: 'TRADE_SUCCESS',
    send_pay_date: '2026-05-01 20:00:00',
    ...overrides,
  }
}

async function setupAlipayReconcileScenario({
  payload = createSuccessfulAlipayQueryPayload(),
  signResponse = true,
  paymentOverrides = {},
} = {}) {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  })
  const restoreEnv = withPaymentEnv(createAlipayEnv(privateKey, publicKey))
  const payment = createPendingPayment(paymentOverrides)
  const updatedPayment = {
    ...payment,
    status: 'success',
    provider_trade_no: payload.trade_no || payment.provider_trade_no,
    buyer_id: payload.buyer_user_id || payment.buyer_id,
    buyer_logon_id: payload.buyer_logon_id || payment.buyer_logon_id,
    paid_at: '2026-05-01T12:00:00.000Z',
  }
  const originalFetch = global.fetch
  const { reconcilePaymentStatus, mocks } = await loadPaymentModuleWithMocks({ updatedPayment })
  const rawText = signResponse
    ? signAlipayQueryResponse(payload, privateKey)
    : JSON.stringify({
      alipay_trade_query_response: payload,
      sign: 'invalid-signature-for-test',
    })

  global.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    text: async () => rawText,
  }))

  return {
    reconcilePaymentStatus,
    mocks,
    payment,
    restore() {
      global.fetch = originalFetch
      restoreEnv()
      restorePaymentModuleMocks()
    },
  }
}

function createQixiangEnv() {
  return {
    APP_BASE_URL: 'https://micro-variety-show.vercel.app',
    QIXIANG_PID: '1001',
    QIXIANG_KEY: 'test-secret',
    QIXIANG_QUERY_URL: 'https://api.payqixiang.cn/api.php',
    QIXIANG_QUERY_METHOD: null,
    QIXIANG_QUERY_HTTP_METHOD: null,
  }
}

function signQixiangQueryPayload(payload, key = 'test-secret') {
  return {
    ...payload,
    sign: signQixiangParams(payload, key),
  }
}

async function setupQixiangReconcileScenario({
  payload,
  paymentOverrides = {},
} = {}) {
  const payment = createPendingPayment({
    provider: 'payqixiang',
    amount: 1,
    provider_order_no: 'QX20260608000000AABBCCDD',
    ...paymentOverrides,
  })
  const responsePayload = payload || {
    code: 1,
    status: 1,
    pid: '1001',
    type: 'alipay',
    out_trade_no: payment.provider_order_no,
    trade_no: '202606082200000001',
    money: '0.01',
  }
  const restoreEnv = withPaymentEnv(createQixiangEnv())
  const originalFetch = global.fetch
  const { reconcilePaymentStatus, reconcileQixiangPaymentStatus, mocks } = await loadPaymentModuleWithMocks({
    updatedPayment: {
      ...payment,
      status: 'success',
      provider_trade_no: responsePayload.trade_no || payment.provider_trade_no,
      paid_at: '2026-06-08T12:00:00.000Z',
    },
  })

  global.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(responsePayload),
  }))

  return {
    reconcilePaymentStatus,
    reconcileQixiangPaymentStatus,
    mocks,
    payment,
    restore() {
      global.fetch = originalFetch
      restoreEnv()
      restorePaymentModuleMocks()
    },
  }
}

describe('payment helpers', () => {
  it('does not expose internal payment failure reasons to clients', () => {
    const clientPayment = toClientPayment({
      id: 1,
      provider: 'payqixiang',
      product_code: 'report_unlock',
      amount: 990,
      currency: 'CNY',
      status: 'failed',
      provider_order_no: 'QX20260612000000SAFEFAIL',
      provider_trade_no: null,
      paid_at: null,
      created_at: '2026-06-12T00:00:00.000Z',
      updated_at: '2026-06-12T00:01:00.000Z',
      failure_reason:
        '七相统一下单失败: key=qixiang-secret&sign=raw-signature token_hash=raw-token SQL 42P01 relation "payments"',
    })

    expect(clientPayment.failure_reason).toBe('支付未完成，请重新发起支付或联系客服处理')
    const bodyText = JSON.stringify(clientPayment)
    expect(bodyText).not.toContain('qixiang-secret')
    expect(bodyText).not.toContain('raw-signature')
    expect(bodyText).not.toContain('token_hash')
    expect(bodyText).not.toContain('SQL')
    expect(bodyText).not.toContain('42P01')
    expect(bodyText).not.toContain('relation "payments"')
  })

  it('formats fen amounts for alipay requests', () => {
    expect(formatAmountFenToYuan(990)).toBe('9.90')
    expect(formatAmountFenToYuan(1)).toBe('0.01')
  })

  it('generates stable alipay order numbers', () => {
    const orderNo = generateProviderOrderNo('alipay')

    expect(orderNo).toMatch(/^ALI\d{14}[A-F0-9]{8}$/)
  })

  it('generates stable payqixiang order numbers', () => {
    const orderNo = generateProviderOrderNo('payqixiang')

    expect(orderNo).toMatch(/^QX\d{14}[A-F0-9]{8}$/)
  })

  it('defaults active provider to alipay and lets server env override creates', () => {
    const originalEnv = {
      PAYMENT_ACTIVE_PROVIDER: process.env.PAYMENT_ACTIVE_PROVIDER,
    }

    try {
      delete process.env.PAYMENT_ACTIVE_PROVIDER
      expect(getActivePaymentProvider()).toBe('alipay')
      expect(resolvePaymentProviderForCreate('payqixiang')).toBe('payqixiang')

      process.env.PAYMENT_ACTIVE_PROVIDER = 'payqixiang'
      expect(getActivePaymentProvider()).toBe('payqixiang')
      expect(resolvePaymentProviderForCreate('alipay')).toBe('payqixiang')
    } finally {
      if (originalEnv.PAYMENT_ACTIVE_PROVIDER == null) {
        delete process.env.PAYMENT_ACTIVE_PROVIDER
      } else {
        process.env.PAYMENT_ACTIVE_PROVIDER = originalEnv.PAYMENT_ACTIVE_PROVIDER
      }
    }
  })

  it('uses server-side test amount cents when configured', () => {
    const originalEnv = {
      VERCEL_ENV: process.env.VERCEL_ENV,
      NODE_ENV: process.env.NODE_ENV,
      PAYMENT_TEST_AMOUNT_CENTS: process.env.PAYMENT_TEST_AMOUNT_CENTS,
      PAYMENT_TEST_MODE_ENABLED: process.env.PAYMENT_TEST_MODE_ENABLED,
      PAYMENT_TEST_MODE_UNTIL: process.env.PAYMENT_TEST_MODE_UNTIL,
      PAYMENT_TEST_CONFIRMATION: process.env.PAYMENT_TEST_CONFIRMATION,
    }

    try {
      delete process.env.VERCEL_ENV
      delete process.env.NODE_ENV
      delete process.env.PAYMENT_TEST_AMOUNT_CENTS
      delete process.env.PAYMENT_TEST_MODE_ENABLED
      delete process.env.PAYMENT_TEST_MODE_UNTIL
      delete process.env.PAYMENT_TEST_CONFIRMATION
      expect(getPaymentProduct('report_unlock').amountFen).toBe(990)

      process.env.PAYMENT_TEST_AMOUNT_CENTS = '1'
      expect(getPaymentProduct('report_unlock').amountFen).toBe(1)
    } finally {
      Object.entries(originalEnv).forEach(([key, value]) => {
        if (value == null) {
          delete process.env[key]
          return
        }

        process.env[key] = value
      })
    }
  })

  it('blocks production test amount without the approved confirmation bundle before creating a product', () => {
    const restoreEnv = withPaymentEnv({
      VERCEL_ENV: 'production',
      NODE_ENV: null,
      PAYMENT_TEST_AMOUNT_CENTS: '1',
      PAYMENT_TEST_MODE_ENABLED: null,
      PAYMENT_TEST_MODE_UNTIL: null,
      PAYMENT_TEST_CONFIRMATION: null,
    })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      expect(() => getPaymentProduct('report_unlock')).toThrow('payment_test_mode_not_enabled')
      expect(warnSpy).toHaveBeenCalledWith(
        'Payment test amount blocked by dangerous env guard:',
        expect.objectContaining({
          reasonCode: 'payment_test_mode_not_enabled',
          strict: true,
        })
      )
      expect(JSON.stringify(warnSpy.mock.calls)).not.toContain('PAYMENT_TEST_CONFIRMATION')
    } finally {
      warnSpy.mockRestore()
      restoreEnv()
    }
  })

  it('allows production test amount inside the approved payment test window', () => {
    const restoreEnv = withPaymentEnv({
      VERCEL_ENV: 'production',
      NODE_ENV: null,
      PAYMENT_TEST_AMOUNT_CENTS: '1',
      PAYMENT_TEST_MODE_ENABLED: 'true',
      PAYMENT_TEST_MODE_UNTIL: '2026-06-20T23:59:59+08:00',
      PAYMENT_TEST_CONFIRMATION: 'confirmed-by-ops',
    })
    vi.useFakeTimers()

    try {
      vi.setSystemTime(new Date('2026-06-12T10:00:00+08:00'))
      expect(getPaymentProduct('report_unlock').amountFen).toBe(1)
    } finally {
      vi.useRealTimers()
      restoreEnv()
    }
  })

  it('blocks production test amount after the approved payment test window', () => {
    const restoreEnv = withPaymentEnv({
      VERCEL_ENV: 'production',
      NODE_ENV: null,
      PAYMENT_TEST_AMOUNT_CENTS: '1',
      PAYMENT_TEST_MODE_ENABLED: 'true',
      PAYMENT_TEST_MODE_UNTIL: '2026-06-20T23:59:59+08:00',
      PAYMENT_TEST_CONFIRMATION: 'confirmed-by-ops',
    })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.useFakeTimers()

    try {
      vi.setSystemTime(new Date('2026-06-21T00:00:00+08:00'))
      expect(() => getPaymentProduct('report_unlock')).toThrow('payment_test_window_expired')
    } finally {
      vi.useRealTimers()
      warnSpy.mockRestore()
      restoreEnv()
    }
  })

  it('uses the alipay timestamp shape', () => {
    expect(formatAlipayTimestamp(new Date('2026-04-28T07:08:09.000Z'))).toBe('2026-04-28 15:08:09')
  })

  it('round-trips RSA2 signatures', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    })

    const signedFields = {
      app_id: 'test-app',
      biz_content: '{"out_trade_no":"ALI2026042812345600000000","total_amount":"9.90"}',
      charset: 'utf-8',
      format: 'JSON',
      method: 'alipay.trade.wap.pay',
      notify_url: 'https://example.com/api/payment/notify/alipay',
      return_url: 'https://example.com/user?payment_id=1&provider=alipay',
      timestamp: '2026-04-28 16:00:00',
      version: '1.0',
    }

    const sign = signAlipayParams(signedFields, privateKey)

    expect(
      verifyAlipaySignature(
        {
          ...signedFields,
          sign_type: 'RSA2',
          sign,
        },
        publicKey
      )
    ).toBe(true)
  })

  it('signs payqixiang params with ascii key ordering and excludes empty/sign fields', () => {
    const params = {
      money: '0.01',
      name: '微综艺测试结果解锁',
      notify_url: 'https://example.com/api/payment/notify/payqixiang',
      out_trade_no: 'QX20260608000000AABBCCDD',
      pid: '1001',
      return_url: 'https://example.com/user?payment_id=1&provider=payqixiang',
      sign: 'ignored',
      sign_type: 'MD5',
      type: 'alipay',
      empty: '',
    }

    expect(serializeQixiangParamsForSigning(params)).toBe(
      'money=0.01&name=微综艺测试结果解锁&notify_url=https://example.com/api/payment/notify/payqixiang&out_trade_no=QX20260608000000AABBCCDD&pid=1001&return_url=https://example.com/user?payment_id=1&provider=payqixiang&type=alipay'
    )

    const sign = signQixiangParams(params, 'test-secret')
    expect(verifyQixiangSignature({ ...params, sign }, 'test-secret')).toBe(true)
    expect(verifyQixiangSignature({ ...params, money: '9.90', sign }, 'test-secret')).toBe(false)
  })

  it('builds payqixiang jump order params without exposing the key', () => {
    const originalEnv = {
      APP_BASE_URL: process.env.APP_BASE_URL,
      QIXIANG_PID: process.env.QIXIANG_PID,
      QIXIANG_KEY: process.env.QIXIANG_KEY,
      QIXIANG_API_URL: process.env.QIXIANG_API_URL,
      QIXIANG_QUERY_URL: process.env.QIXIANG_QUERY_URL,
    }

    try {
      process.env.APP_BASE_URL = 'https://micro-variety-show.vercel.app'
      process.env.QIXIANG_PID = '1001'
      process.env.QIXIANG_KEY = 'test-secret'
      process.env.QIXIANG_API_URL = 'https://api.payqixiang.cn/mapi.php'
      process.env.QIXIANG_QUERY_URL = 'https://api.payqixiang.cn/api.php'

      const { params } = buildQixiangOrderParams({
        req: { headers: { 'x-forwarded-for': '203.0.113.8' } },
        paymentId: 1,
        providerOrderNo: 'QX20260608000000AABBCCDD',
        product: {
          amountFen: 1,
          subject: '微综艺测试结果解锁',
        },
      })

      expect(params.pid).toBe('1001')
      expect(params.type).toBe('alipay')
      expect(params.money).toBe('0.01')
      expect(params.device).toBe('jump')
      expect(params.clientip).toBe('203.0.113.8')
      expect(params.notify_url).toBe('https://micro-variety-show.vercel.app/api/payment/notify/payqixiang')
      expect(params.return_url).toBe('https://micro-variety-show.vercel.app/user?payment_id=1&provider=payqixiang')
      expect(params.sign).toMatch(/^[a-f0-9]{32}$/)
      expect(Object.values(params)).not.toContain('test-secret')
    } finally {
      Object.entries(originalEnv).forEach(([key, value]) => {
        if (value == null) {
          delete process.env[key]
          return
        }

        process.env[key] = value
      })
    }
  })

  it('normalizes sandbox env aliases and notify URLs', () => {
    const originalEnv = {
      APP_BASE_URL: process.env.APP_BASE_URL,
      ALIPAY_NOTIFY_BASE_URL: process.env.ALIPAY_NOTIFY_BASE_URL,
      ALIPAY_NOTIFY_URL: process.env.ALIPAY_NOTIFY_URL,
      ALIPAY_APP_ID: process.env.ALIPAY_APP_ID,
      APPID: process.env.APPID,
      ALIPAY_PRIVATE_KEY: process.env.ALIPAY_PRIVATE_KEY,
      ALIPAY_APP_PRIVATE_KEY: process.env.ALIPAY_APP_PRIVATE_KEY,
      ALIPAY_PUBLIC_KEY: process.env.ALIPAY_PUBLIC_KEY,
      ALIPAY_APP_PUBLIC_KEY: process.env.ALIPAY_APP_PUBLIC_KEY,
      ALIPAY_SELLER_ID: process.env.ALIPAY_SELLER_ID,
      ALIPAY_GATEWAY: process.env.ALIPAY_GATEWAY,
    }

    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    })

    try {
      delete process.env.ALIPAY_APP_ID
      delete process.env.ALIPAY_PRIVATE_KEY
      delete process.env.ALIPAY_PUBLIC_KEY
      delete process.env.ALIPAY_NOTIFY_URL

      process.env.APPID = 'sandbox-app-id'
      process.env.APP_BASE_URL = '[https://micro-variety-show.vercel.app]'
      process.env.ALIPAY_NOTIFY_BASE_URL = 'https://micro-variety-show.vercel.app/user'
      process.env.ALIPAY_APP_PRIVATE_KEY = privateKey
      process.env.ALIPAY_APP_PUBLIC_KEY = publicKey
      process.env.ALIPAY_SELLER_ID = '2088123412341234'
      process.env.ALIPAY_GATEWAY = 'https://openapi-sandbox.dl.alipaydev.com/gateway.do'

      const config = getAlipayConfig({ headers: {} })

      expect(config.appId).toBe('sandbox-app-id')
      expect(config.siteBaseUrl).toBe('https://micro-variety-show.vercel.app')
      expect(config.notifyUrl).toBe('https://micro-variety-show.vercel.app/api/payment/notify/alipay')
      expect(config.publicKeySource).toBe('app')
      expect(config.privateKey).toContain('BEGIN PRIVATE KEY')
      expect(config.publicKey).toContain('BEGIN PUBLIC KEY')
    } finally {
      Object.entries(originalEnv).forEach(([key, value]) => {
        if (value == null) {
          delete process.env[key]
          return
        }

        process.env[key] = value
      })
    }
  })

  it('turns missing payments columns into an actionable migration error', () => {
    const error = {
      code: '42703',
      message: 'column payments.provider does not exist',
    }

    expect(isPaymentsSchemaMismatch(error)).toBe(true)
    expect(getPaymentRuntimeErrorMessage(error, 'fallback')).toContain('005_expand_payments.sql')
  })

  it('puts charset into the action query string for wap pay forms', () => {
    const originalEnv = {
      APP_BASE_URL: process.env.APP_BASE_URL,
      ALIPAY_NOTIFY_BASE_URL: process.env.ALIPAY_NOTIFY_BASE_URL,
      ALIPAY_NOTIFY_URL: process.env.ALIPAY_NOTIFY_URL,
      ALIPAY_APP_ID: process.env.ALIPAY_APP_ID,
      ALIPAY_PRIVATE_KEY: process.env.ALIPAY_PRIVATE_KEY,
      ALIPAY_PUBLIC_KEY: process.env.ALIPAY_PUBLIC_KEY,
      ALIPAY_SELLER_ID: process.env.ALIPAY_SELLER_ID,
      ALIPAY_GATEWAY: process.env.ALIPAY_GATEWAY,
    }

    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    })

    try {
      process.env.APP_BASE_URL = 'https://micro-variety-show.vercel.app'
      process.env.ALIPAY_NOTIFY_BASE_URL = 'https://micro-variety-show.vercel.app'
      process.env.ALIPAY_NOTIFY_URL = 'https://micro-variety-show.vercel.app/api/payment/notify/alipay'
      process.env.ALIPAY_APP_ID = 'sandbox-app-id'
      process.env.ALIPAY_PRIVATE_KEY = privateKey
      process.env.ALIPAY_PUBLIC_KEY = publicKey
      process.env.ALIPAY_SELLER_ID = '2088123412341234'
      process.env.ALIPAY_GATEWAY = 'https://openapi-sandbox.dl.alipaydev.com/gateway.do'

      const form = buildAlipayWapPayForm({
        req: { headers: {} },
        paymentId: 1,
        providerOrderNo: 'ALI20260501000000ABCD1234',
        product: {
          amountFen: 990,
          subject: '微综艺测试结果解锁',
          description: '一次购买，永久解锁所有测试结果',
        },
      })

      const actionUrl = new URL(form.action)

      expect(actionUrl.searchParams.get('charset')).toBe('utf-8')
      expect(actionUrl.searchParams.get('sign')).toBeTruthy()
      expect(actionUrl.searchParams.get('app_id')).toBe('sandbox-app-id')
      expect(form.accept_charset).toBe('utf-8')
      expect(form.fields.charset).toBeUndefined()
      expect(form.fields.sign).toBeUndefined()
      expect(typeof form.fields.biz_content).toBe('string')
    } finally {
      Object.entries(originalEnv).forEach(([key, value]) => {
        if (value == null) {
          delete process.env[key]
          return
        }

        process.env[key] = value
      })
    }
  })

  it('reports invalid alipay trade query response signatures', async () => {
    const originalEnv = {
      APP_BASE_URL: process.env.APP_BASE_URL,
      ALIPAY_NOTIFY_BASE_URL: process.env.ALIPAY_NOTIFY_BASE_URL,
      ALIPAY_NOTIFY_URL: process.env.ALIPAY_NOTIFY_URL,
      ALIPAY_APP_ID: process.env.ALIPAY_APP_ID,
      ALIPAY_PRIVATE_KEY: process.env.ALIPAY_PRIVATE_KEY,
      ALIPAY_PUBLIC_KEY: process.env.ALIPAY_PUBLIC_KEY,
      ALIPAY_SELLER_ID: process.env.ALIPAY_SELLER_ID,
      ALIPAY_GATEWAY: process.env.ALIPAY_GATEWAY,
    }

    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    })

    const originalFetch = global.fetch

    try {
      process.env.APP_BASE_URL = 'https://micro-variety-show.vercel.app'
      process.env.ALIPAY_NOTIFY_BASE_URL = 'https://micro-variety-show.vercel.app'
      process.env.ALIPAY_NOTIFY_URL = 'https://micro-variety-show.vercel.app/api/payment/notify/alipay'
      process.env.ALIPAY_APP_ID = 'sandbox-app-id'
      process.env.ALIPAY_PRIVATE_KEY = privateKey
      process.env.ALIPAY_PUBLIC_KEY = publicKey
      process.env.ALIPAY_SELLER_ID = '2088123412341234'
      process.env.ALIPAY_GATEWAY = 'https://openapi-sandbox.dl.alipaydev.com/gateway.do'

      global.fetch = vi.fn(async (_url, options) => {
        const form = new URLSearchParams(options.body)
        const bizContent = JSON.parse(form.get('biz_content'))
        const responsePayload = {
          code: '10000',
          msg: 'Success',
          out_trade_no: bizContent.out_trade_no,
          trade_no: '2026050122001499999999999999',
          buyer_user_id: '2088000000000001',
          buyer_logon_id: 'sandbox_buyer@example.com',
          total_amount: '9.90',
          trade_status: 'TRADE_SUCCESS',
          send_pay_date: '2026-05-01 20:00:00',
        }

        const responseNodeName = 'alipay_trade_query_response'
        const rawText = JSON.stringify({
          [responseNodeName]: responsePayload,
          sign: 'invalid-signature-for-test',
        })

        return {
          ok: true,
          status: 200,
          text: async () => rawText,
        }
      })

      const payment = {
        id: 1,
        provider: 'alipay',
        status: 'pending',
        amount: 990,
        provider_order_no: 'ALI20260501000000ABCD1234',
        provider_trade_no: null,
        buyer_id: null,
        buyer_logon_id: null,
        paid_at: null,
      }

      const queried = await queryAlipayTrade({
        req: { headers: {} },
        providerOrderNo: payment.provider_order_no,
      })

      expect(queried.payload.trade_status).toBe('TRADE_SUCCESS')
      expect(queried.responseSignatureValid).toBe(false)
    } finally {
      global.fetch = originalFetch
      Object.entries(originalEnv).forEach(([key, value]) => {
        if (value == null) {
          delete process.env[key]
          return
        }

        process.env[key] = value
      })
    }
  })

  it('reconciles pending alipay payments only when query signature and required fields are valid', async () => {
    const scenario = await setupAlipayReconcileScenario()

    try {
      const result = await scenario.reconcilePaymentStatus({
        req: { headers: {} },
        payment: scenario.payment,
      })

      expect(result.status).toBe('success')
      expect(scenario.mocks.query.update).toHaveBeenCalledWith(expect.objectContaining({
        status: 'success',
        provider_trade_no: '2026050122001499999999999999',
        buyer_id: '2088000000000001',
        buyer_logon_id: 'sandbox_buyer@example.com',
        failure_reason: null,
      }))
      expect(scenario.mocks.setReportUnlocked).toHaveBeenCalledWith(
        'user-1',
        true,
        'payment',
        {
          context: expect.objectContaining({
            reason: 'payment_success',
            provider: 'alipay',
            order_no: 'ALI20260501000000ABCD1234',
            amount_fen: 990,
            provider_trade_no: '2026050122001499999999999999',
          }),
        }
      )
    } finally {
      scenario.restore()
    }
  })

  it('does not unlock alipay trade query results when response signature verification fails', async () => {
    const scenario = await setupAlipayReconcileScenario({
      signResponse: false,
    })

    try {
      await expect(scenario.reconcilePaymentStatus({
        req: { headers: {} },
        payment: scenario.payment,
      })).rejects.toThrow('验签未通过')

      expect(scenario.mocks.query.update).not.toHaveBeenCalled()
      expect(scenario.mocks.setReportUnlocked).not.toHaveBeenCalled()
    } finally {
      scenario.restore()
    }
  })

  it.each([
    ['missing total_amount', { total_amount: undefined }, '金额缺失'],
    ['non-numeric total_amount', { total_amount: 'not-a-number' }, '金额非法'],
    ['mismatched total_amount', { total_amount: '9.91' }, '金额与本地支付单不一致'],
  ])('does not unlock alipay trade query results with %s', async (_label, overrides, expectedMessage) => {
    const scenario = await setupAlipayReconcileScenario({
      payload: createSuccessfulAlipayQueryPayload(overrides),
    })

    try {
      await expect(scenario.reconcilePaymentStatus({
        req: { headers: {} },
        payment: scenario.payment,
      })).rejects.toThrow(expectedMessage)

      expect(scenario.mocks.query.update).not.toHaveBeenCalled()
      expect(scenario.mocks.setReportUnlocked).not.toHaveBeenCalled()
    } finally {
      scenario.restore()
    }
  })

  it('does not unlock alipay trade query results when merchant id mismatches', async () => {
    const scenario = await setupAlipayReconcileScenario({
      payload: createSuccessfulAlipayQueryPayload({
        seller_id: '2088000000000000',
      }),
    })

    try {
      await expect(scenario.reconcilePaymentStatus({
        req: { headers: {} },
        payment: scenario.payment,
      })).rejects.toThrow('商户号与本地配置不一致')

      expect(scenario.mocks.query.update).not.toHaveBeenCalled()
      expect(scenario.mocks.setReportUnlocked).not.toHaveBeenCalled()
    } finally {
      scenario.restore()
    }
  })

  it('does not unlock alipay trade query results when provider order number mismatches', async () => {
    const scenario = await setupAlipayReconcileScenario({
      payload: createSuccessfulAlipayQueryPayload({
        out_trade_no: 'ALI20260501000000DIFFERENT',
      }),
    })

    try {
      await expect(scenario.reconcilePaymentStatus({
        req: { headers: {} },
        payment: scenario.payment,
      })).rejects.toThrow('订单号与本地支付单不一致')

      expect(scenario.mocks.query.update).not.toHaveBeenCalled()
      expect(scenario.mocks.setReportUnlocked).not.toHaveBeenCalled()
    } finally {
      scenario.restore()
    }
  })

  it('does not unlock payqixiang active trade queries without a verifiable response signature', async () => {
    const scenario = await setupQixiangReconcileScenario()

    try {
      await expect(scenario.reconcilePaymentStatus({
        req: { headers: {} },
        payment: scenario.payment,
      })).rejects.toThrow('未提供可验证签名')

      expect(scenario.mocks.query.update).not.toHaveBeenCalled()
      expect(scenario.mocks.setReportUnlocked).not.toHaveBeenCalled()
    } finally {
      scenario.restore()
    }
  })

  it('does not unlock payqixiang active trade queries when response signature verification fails', async () => {
    const scenario = await setupQixiangReconcileScenario({
      payload: {
        code: 1,
        status: 1,
        pid: '1001',
        type: 'alipay',
        out_trade_no: 'QX20260608000000AABBCCDD',
        trade_no: '202606082200000001',
        money: '0.01',
        sign: '00000000000000000000000000000000',
      },
    })

    try {
      await expect(scenario.reconcilePaymentStatus({
        req: { headers: {} },
        payment: scenario.payment,
      })).rejects.toThrow('验签未通过')

      expect(scenario.mocks.query.update).not.toHaveBeenCalled()
      expect(scenario.mocks.setReportUnlocked).not.toHaveBeenCalled()
    } finally {
      scenario.restore()
    }
  })

  it('does not unlock verified payqixiang notify reconciliation with an unsigned query confirmation', async () => {
    const scenario = await setupQixiangReconcileScenario()

    try {
      await expect(scenario.reconcileQixiangPaymentStatus({
        req: { headers: {} },
        payment: scenario.payment,
        notifyPayload: {
          pid: '1001',
          type: 'alipay',
          out_trade_no: scenario.payment.provider_order_no,
          trade_no: '202606082200000001',
          money: '0.01',
          trade_status: 'TRADE_SUCCESS',
        },
        requireSuccess: true,
      })).rejects.toThrow('未提供可验证签名')

      expect(scenario.mocks.query.update).not.toHaveBeenCalled()
      expect(scenario.mocks.setReportUnlocked).not.toHaveBeenCalled()
    } finally {
      scenario.restore()
    }
  })

  it('does not unlock verified payqixiang notify reconciliation when query response signature verification fails', async () => {
    const scenario = await setupQixiangReconcileScenario({
      payload: {
        code: 1,
        status: 1,
        pid: '1001',
        type: 'alipay',
        out_trade_no: 'QX20260608000000AABBCCDD',
        trade_no: '202606082200000001',
        money: '0.01',
        sign: '00000000000000000000000000000000',
      },
    })

    try {
      await expect(scenario.reconcileQixiangPaymentStatus({
        req: { headers: {} },
        payment: scenario.payment,
        notifyPayload: {
          pid: '1001',
          type: 'alipay',
          out_trade_no: scenario.payment.provider_order_no,
          trade_no: '202606082200000001',
          money: '0.01',
          trade_status: 'TRADE_SUCCESS',
        },
        requireSuccess: true,
      })).rejects.toThrow('验签未通过')

      expect(scenario.mocks.query.update).not.toHaveBeenCalled()
      expect(scenario.mocks.setReportUnlocked).not.toHaveBeenCalled()
    } finally {
      scenario.restore()
    }
  })

  it('reconciles payqixiang only when the query response signature is verifiable', async () => {
    const scenario = await setupQixiangReconcileScenario({
      payload: signQixiangQueryPayload({
        code: 1,
        status: 1,
        pid: '1001',
        type: 'alipay',
        out_trade_no: 'QX20260608000000AABBCCDD',
        trade_no: '202606082200000001',
        money: '0.01',
      }),
    })

    try {
      const result = await scenario.reconcilePaymentStatus({
        req: { headers: {} },
        payment: scenario.payment,
      })

      expect(result.status).toBe('success')
      expect(scenario.mocks.query.update).toHaveBeenCalledWith(expect.objectContaining({
        status: 'success',
        provider_trade_no: '202606082200000001',
        failure_reason: null,
      }))
      expect(scenario.mocks.setReportUnlocked).toHaveBeenCalledWith(
        'user-1',
        true,
        'payment',
        {
          context: expect.objectContaining({
            reason: 'payment_success',
            provider: 'payqixiang',
            order_no: 'QX20260608000000AABBCCDD',
            amount_fen: 1,
            provider_trade_no: '202606082200000001',
          }),
        }
      )
    } finally {
      scenario.restore()
    }
  })

  it('queries payqixiang order status with POST body key and no key in the URL', async () => {
    const originalEnv = {
      APP_BASE_URL: process.env.APP_BASE_URL,
      QIXIANG_PID: process.env.QIXIANG_PID,
      QIXIANG_KEY: process.env.QIXIANG_KEY,
      QIXIANG_QUERY_URL: process.env.QIXIANG_QUERY_URL,
      QIXIANG_QUERY_METHOD: process.env.QIXIANG_QUERY_METHOD,
      QIXIANG_QUERY_HTTP_METHOD: process.env.QIXIANG_QUERY_HTTP_METHOD,
    }
    const originalFetch = global.fetch

    try {
      process.env.APP_BASE_URL = 'https://micro-variety-show.vercel.app'
      process.env.QIXIANG_PID = '1001'
      process.env.QIXIANG_KEY = 'test-secret'
      process.env.QIXIANG_QUERY_URL = 'https://api.payqixiang.cn/api.php'
      delete process.env.QIXIANG_QUERY_METHOD
      delete process.env.QIXIANG_QUERY_HTTP_METHOD

      global.fetch = vi.fn(async (url, options) => {
        const queryUrl = new URL(String(url))
        const body = new URLSearchParams(options.body)

        expect(options.method).toBe('POST')
        expect(queryUrl.origin).toBe('https://api.payqixiang.cn')
        expect(queryUrl.pathname).toBe('/api.php')
        expect(queryUrl.search).toBe('')
        expect(queryUrl.searchParams.has('key')).toBe(false)
        expect(String(url)).not.toContain('key=')
        expect(body.get('act')).toBe('order')
        expect(body.get('pid')).toBe('1001')
        expect(body.get('key')).toBe('test-secret')
        expect(body.get('out_trade_no')).toBe('QX20260608000000AABBCCDD')
        expect(options.headers['Content-Type']).toContain('application/x-www-form-urlencoded')

        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            code: 1,
            status: 1,
            pid: '1001',
            type: 'alipay',
            out_trade_no: 'QX20260608000000AABBCCDD',
            trade_no: '202606082200000001',
            money: '0.01',
          }),
        }
      })

      const queried = await queryQixiangTrade({
        req: { headers: {} },
        providerOrderNo: 'QX20260608000000AABBCCDD',
      })

      expect(global.fetch).toHaveBeenCalledTimes(1)
      expect(queried.payload.status).toBe(1)
      expect(queried.payload.money).toBe('0.01')
    } finally {
      global.fetch = originalFetch
      Object.entries(originalEnv).forEach(([key, value]) => {
        if (value == null) {
          delete process.env[key]
          return
        }

        process.env[key] = value
      })
    }
  })

  it('queries payqixiang order status with GET header key and no key in the URL', async () => {
    const originalEnv = {
      APP_BASE_URL: process.env.APP_BASE_URL,
      QIXIANG_PID: process.env.QIXIANG_PID,
      QIXIANG_KEY: process.env.QIXIANG_KEY,
      QIXIANG_QUERY_URL: process.env.QIXIANG_QUERY_URL,
      QIXIANG_QUERY_METHOD: process.env.QIXIANG_QUERY_METHOD,
      QIXIANG_QUERY_HTTP_METHOD: process.env.QIXIANG_QUERY_HTTP_METHOD,
    }
    const originalFetch = global.fetch

    try {
      process.env.APP_BASE_URL = 'https://micro-variety-show.vercel.app'
      process.env.QIXIANG_PID = '1001'
      process.env.QIXIANG_KEY = 'test-secret'
      process.env.QIXIANG_QUERY_URL = 'https://api.payqixiang.cn/api.php'
      process.env.QIXIANG_QUERY_METHOD = 'GET'
      delete process.env.QIXIANG_QUERY_HTTP_METHOD

      global.fetch = vi.fn(async (url, options) => {
        const queryUrl = new URL(String(url))

        expect(options.method).toBe('GET')
        expect(queryUrl.searchParams.get('act')).toBe('order')
        expect(queryUrl.searchParams.get('pid')).toBe('1001')
        expect(queryUrl.searchParams.get('out_trade_no')).toBe('QX20260608000000AABBCCDD')
        expect(queryUrl.searchParams.has('key')).toBe(false)
        expect(String(url)).not.toContain('key=')
        expect(options.headers['X-Qixiang-Key']).toBe('test-secret')
        expect(options.body).toBeUndefined()

        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            code: 1,
            status: 1,
            pid: '1001',
            type: 'alipay',
            out_trade_no: 'QX20260608000000AABBCCDD',
            trade_no: '202606082200000001',
            money: '0.01',
          }),
        }
      })

      const queried = await queryQixiangTrade({
        req: { headers: {} },
        providerOrderNo: 'QX20260608000000AABBCCDD',
      })

      expect(global.fetch).toHaveBeenCalledTimes(1)
      expect(queried.payload.status).toBe(1)
    } finally {
      global.fetch = originalFetch
      Object.entries(originalEnv).forEach(([key, value]) => {
        if (value == null) {
          delete process.env[key]
          return
        }

        process.env[key] = value
      })
    }
  })

  it('rejects payqixiang query URLs that are not HTTPS or not on the hostname allowlist', async () => {
    const originalEnv = {
      APP_BASE_URL: process.env.APP_BASE_URL,
      QIXIANG_PID: process.env.QIXIANG_PID,
      QIXIANG_KEY: process.env.QIXIANG_KEY,
      QIXIANG_QUERY_URL: process.env.QIXIANG_QUERY_URL,
      QIXIANG_QUERY_METHOD: process.env.QIXIANG_QUERY_METHOD,
      QIXIANG_QUERY_ALLOWED_HOSTS: process.env.QIXIANG_QUERY_ALLOWED_HOSTS,
      QIXIANG_ALLOWED_QUERY_HOSTS: process.env.QIXIANG_ALLOWED_QUERY_HOSTS,
    }
    const originalFetch = global.fetch

    try {
      process.env.APP_BASE_URL = 'https://micro-variety-show.vercel.app'
      process.env.QIXIANG_PID = '1001'
      process.env.QIXIANG_KEY = 'test-secret'
      delete process.env.QIXIANG_QUERY_METHOD
      delete process.env.QIXIANG_QUERY_ALLOWED_HOSTS
      delete process.env.QIXIANG_ALLOWED_QUERY_HOSTS

      global.fetch = vi.fn()

      process.env.QIXIANG_QUERY_URL = 'http://api.payqixiang.cn/api.php'
      await expect(queryQixiangTrade({
        req: { headers: {} },
        providerOrderNo: 'QX20260608000000AABBCCDD',
      })).rejects.toThrow('https://')

      process.env.QIXIANG_QUERY_URL = 'https://payments.example.com/api.php'
      await expect(queryQixiangTrade({
        req: { headers: {} },
        providerOrderNo: 'QX20260608000000AABBCCDD',
      })).rejects.toThrow('白名单')

      expect(global.fetch).not.toHaveBeenCalled()
    } finally {
      global.fetch = originalFetch
      Object.entries(originalEnv).forEach(([key, value]) => {
        if (value == null) {
          delete process.env[key]
          return
        }

        process.env[key] = value
      })
    }
  })

  it('redacts payment runtime error messages before they are returned or logged', () => {
    const originalKey = process.env.QIXIANG_KEY

    try {
      process.env.QIXIANG_KEY = 'real-qixiang-secret'

      const message = getPaymentRuntimeErrorMessage(
        new Error(
          'request failed: https://api.payqixiang.cn/api.php?act=order&key=real-qixiang-secret&sign=raw-sign&access_token=access-1 token=token-1 secret:secret-1 {"secret":"json-secret"}'
        ),
        'fallback'
      )

      expect(message).toContain('[redacted]')
      expect(message).not.toContain('real-qixiang-secret')
      expect(message).not.toContain('raw-sign')
      expect(message).not.toContain('access-1')
      expect(message).not.toContain('token-1')
      expect(message).not.toContain('secret-1')
      expect(message).not.toContain('json-secret')
    } finally {
      if (originalKey == null) {
        delete process.env.QIXIANG_KEY
      } else {
        process.env.QIXIANG_KEY = originalKey
      }
    }
  })

  it('forces locked result output when final report access is not granted', () => {
    const result = applyUnlockStateToResult(
      {
        id: 1,
        is_unlocked: true,
        unlock_method: 'payment',
        unlocked_at: '2026-05-01T12:00:00.000Z',
      },
      {
        unlocked: false,
        method: null,
        referralCount: 0,
      }
    )

    expect(result.is_unlocked).toBe(false)
    expect(result.unlock_method).toBe(null)
    expect(result.unlocked_at).toBe(null)
  })

  it('uses final report access as the only unlock source in result output', () => {
    const result = applyUnlockStateToResult(
      {
        id: 1,
        is_unlocked: false,
        unlock_method: null,
        unlocked_at: null,
      },
      {
        unlocked: true,
        method: 'payment',
        referralCount: 0,
      }
    )

    expect(result.is_unlocked).toBe(true)
    expect(result.unlock_method).toBe('payment')
  })
})
