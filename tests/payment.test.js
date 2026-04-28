import { generateKeyPairSync } from 'node:crypto'
import { describe, expect, it } from 'vitest'

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key'

const {
  formatAmountFenToYuan,
  formatAlipayTimestamp,
  generateProviderOrderNo,
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
})
