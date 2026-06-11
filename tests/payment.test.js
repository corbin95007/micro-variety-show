import { generateKeyPairSync } from 'node:crypto'
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
  verifyAlipaySignature,
  verifyQixiangSignature,
} = await import('../api/_lib/payment.js')
const {
  applyUnlockStateToResult,
} = await import('../api/_lib/unlock.js')

describe('payment helpers', () => {
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
      PAYMENT_TEST_AMOUNT_CENTS: process.env.PAYMENT_TEST_AMOUNT_CENTS,
    }

    try {
      delete process.env.PAYMENT_TEST_AMOUNT_CENTS
      expect(getPaymentProduct('report_unlock').amountFen).toBe(990)

      process.env.PAYMENT_TEST_AMOUNT_CENTS = '1'
      expect(getPaymentProduct('report_unlock').amountFen).toBe(1)
    } finally {
      if (originalEnv.PAYMENT_TEST_AMOUNT_CENTS == null) {
        delete process.env.PAYMENT_TEST_AMOUNT_CENTS
      } else {
        process.env.PAYMENT_TEST_AMOUNT_CENTS = originalEnv.PAYMENT_TEST_AMOUNT_CENTS
      }
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

  it('reconciles pending alipay payments to success from trade query', async () => {
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
