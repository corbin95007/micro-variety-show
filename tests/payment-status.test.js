import { afterEach, describe, expect, it, vi } from 'vitest'

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key'

function createReq({ query = {}, headers = {}, method = 'GET' } = {}) {
  return {
    method,
    query,
    headers,
    socket: {
      remoteAddress: '198.51.100.10',
    },
  }
}

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

async function loadStatusHandler({
  userId = 'user-1',
  payment = null,
  latestPayment = payment,
  rateLimit = {
    allowed: true,
    retryAfterSeconds: 0,
    storage: 'memory',
    buckets: [],
  },
  decision = {
    unlocked: false,
    method: null,
  },
  reconciledPayment = null,
} = {}) {
  vi.resetModules()

  const getUserId = vi.fn(async () => userId)
  const getPaymentForUser = vi.fn(async () => payment)
  const getLatestPaymentForUser = vi.fn(async () => latestPayment)
  const reconcilePaymentStatus = vi.fn(async ({ payment: targetPayment }) => (
    reconciledPayment ?? {
      ...targetPayment,
      status: 'success',
    }
  ))
  const toClientPayment = vi.fn((value) => (value ? {
    id: value.id,
    provider: value.provider,
    status: value.status,
    provider_order_no: value.provider_order_no,
  } : null))
  const getPaymentRuntimeErrorMessage = vi.fn((error, fallbackMessage) => (
    error?.message || fallbackMessage
  ))
  const consumeTokenBuckets = vi.fn(async () => rateLimit)
  const getUnlockDecision = vi.fn(async () => decision)

  vi.doMock('../api/_lib/payment.js', () => ({
    PAYMENT_PROVIDER: Object.freeze({
      ALIPAY: 'alipay',
      PAYQIXIANG: 'payqixiang',
    }),
    PAYMENT_STATUS: Object.freeze({
      PENDING: 'pending',
      SUCCESS: 'success',
      FAILED: 'failed',
      REFUNDED: 'refunded',
    }),
    getPaymentRuntimeErrorMessage,
    getLatestPaymentForUser,
    getPaymentForUser,
    reconcilePaymentStatus,
    toClientPayment,
  }))
  vi.doMock('../api/_lib/rate-limit.js', () => ({
    consumeTokenBuckets,
  }))
  vi.doMock('../api/_lib/supabase.js', () => ({
    getUserId,
  }))
  vi.doMock('../api/_lib/unlock.js', () => ({
    getUnlockDecision,
  }))

  const { default: handler } = await import('../api/payment/status.js')

  return {
    handler,
    mocks: {
      consumeTokenBuckets,
      getLatestPaymentForUser,
      getPaymentForUser,
      getPaymentRuntimeErrorMessage,
      getUnlockDecision,
      getUserId,
      reconcilePaymentStatus,
      toClientPayment,
    },
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
})

describe('payment status handler', () => {
  it('returns 429 with Retry-After for rate-limited pending payqixiang lookups without reconciling', async () => {
    const payment = {
      id: 99,
      provider: 'payqixiang',
      status: 'pending',
      provider_order_no: 'QX20260611000000AABBCCDD',
    }
    const { handler, mocks } = await loadStatusHandler({
      payment,
      rateLimit: {
        allowed: false,
        retryAfterSeconds: 17,
        storage: 'memory',
        buckets: [],
      },
    })

    const res = createRes()
    await handler(createReq({
      query: { payment_id: '99' },
      headers: { 'x-forwarded-for': '203.0.113.8' },
    }), res)

    expect(mocks.getPaymentForUser).toHaveBeenCalledWith({
      userId: 'user-1',
      paymentId: '99',
      providerOrderNo: undefined,
    })
    expect(mocks.consumeTokenBuckets).toHaveBeenCalledTimes(1)
    expect(mocks.consumeTokenBuckets.mock.calls[0][0]).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'payment-status:user:user-1' }),
      expect.objectContaining({ key: 'payment-status:order:99' }),
      expect.objectContaining({ key: 'payment-status:ip:203.0.113.8' }),
    ]))
    expect(mocks.reconcilePaymentStatus).not.toHaveBeenCalled()
    expect(mocks.getUnlockDecision).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(429)
    expect(res.headers['Retry-After']).toBe('17')
    expect(res.body).toEqual({
      ok: false,
      error: 'rate_limited',
      retry_after: 17,
    })
  })

  it('keeps latest=1 payqixiang pending checks local when rate limit allows the request', async () => {
    const payment = {
      id: 7,
      provider: 'payqixiang',
      status: 'pending',
      provider_order_no: 'QX20260611000000LOCAL001',
    }
    const { handler, mocks } = await loadStatusHandler({
      latestPayment: payment,
      decision: {
        unlocked: false,
        method: null,
      },
    })

    const res = createRes()
    await handler(createReq({
      query: { latest: '1' },
      headers: { 'x-forwarded-for': '203.0.113.9' },
    }), res)

    expect(mocks.getLatestPaymentForUser).toHaveBeenCalledWith('user-1')
    expect(mocks.consumeTokenBuckets).toHaveBeenCalledTimes(1)
    expect(mocks.reconcilePaymentStatus).not.toHaveBeenCalled()
    expect(mocks.getUnlockDecision).toHaveBeenCalledWith('user-1')
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({
      payment: {
        id: 7,
        provider: 'payqixiang',
        status: 'pending',
        provider_order_no: 'QX20260611000000LOCAL001',
      },
      unlocked: false,
      unlock_method: null,
    })
  })

  it('returns 429 for latest=1 payqixiang pending checks before any active reconciliation', async () => {
    const payment = {
      id: 8,
      provider: 'payqixiang',
      status: 'pending',
      provider_order_no: 'QX20260611000000LOCAL002',
    }
    const { handler, mocks } = await loadStatusHandler({
      latestPayment: payment,
      rateLimit: {
        allowed: false,
        retryAfterSeconds: 29,
        storage: 'memory',
        buckets: [],
      },
    })

    const res = createRes()
    await handler(createReq({
      query: { latest: '1' },
      headers: { 'x-forwarded-for': '203.0.113.10' },
    }), res)

    expect(mocks.consumeTokenBuckets).toHaveBeenCalledTimes(1)
    expect(mocks.reconcilePaymentStatus).not.toHaveBeenCalled()
    expect(mocks.getUnlockDecision).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(429)
    expect(res.headers['Retry-After']).toBe('29')
    expect(res.body).toEqual({
      ok: false,
      error: 'rate_limited',
      retry_after: 29,
    })
  })

  it.each(['success', 'failed', 'refunded', 'cancelled'])(
    'does not rate limit non-pending %s payments',
    async (status) => {
      const payment = {
        id: 21,
        provider: 'payqixiang',
        status,
        provider_order_no: `QX20260611000000${status.toUpperCase()}`,
      }
      const { handler, mocks } = await loadStatusHandler({
        payment,
        decision: {
          unlocked: status === 'success',
          method: status === 'success' ? 'payment' : null,
        },
      })

      const res = createRes()
      await handler(createReq({
        query: { payment_id: '21' },
        headers: { 'x-forwarded-for': '203.0.113.11' },
      }), res)

      expect(mocks.consumeTokenBuckets).not.toHaveBeenCalled()
      expect(mocks.reconcilePaymentStatus).not.toHaveBeenCalled()
      expect(mocks.getUnlockDecision).toHaveBeenCalledWith('user-1')
      expect(res.statusCode).toBe(200)
      expect(res.body.payment).toEqual({
        id: 21,
        provider: 'payqixiang',
        status,
        provider_order_no: `QX20260611000000${status.toUpperCase()}`,
      })
    }
  )
})
