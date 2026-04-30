import { generateKeyPairSync } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key'

const {
  buildAlipayWapPayForm,
  formatAmountFenToYuan,
  formatAlipayTimestamp,
  generateProviderOrderNo,
  getAlipayConfig,
  getPaymentRuntimeErrorMessage,
  isPaymentsSchemaMismatch,
  reconcilePaymentStatus,
  queryAlipayTrade,
  signAlipayParams,
  verifyAlipaySignature,
} = await import('../api/_lib/payment.js')

describe('payment helpers', () => {
  it('formats fen amounts for alipay requests', () => {
    expect(formatAmountFenToYuan(990)).toBe('9.90')
    expect(formatAmountFenToYuan(1)).toBe('0.01')
  })

  it('generates stable alipay order numbers', () => {
    const orderNo = generateProviderOrderNo('alipay')

    expect(orderNo).toMatch(/^ALI\d{14}[A-F0-9]{8}$/)
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
})
