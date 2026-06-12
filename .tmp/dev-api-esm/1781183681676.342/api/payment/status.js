import {
  PAYMENT_PROVIDER,
  PAYMENT_STATUS,
  getPaymentRuntimeErrorMessage,
  getLatestPaymentForUser,
  getPaymentForUser,
  reconcilePaymentStatus,
  toClientPayment,
} from '../_lib/payment.js'
import { consumeTokenBuckets } from '../_lib/rate-limit.js'
import { getUserId } from '../_lib/supabase.js'
import { getUnlockDecision } from '../_lib/unlock.js'

const PAYMENT_STATUS_RATE_LIMIT = Object.freeze({
  user: {
    capacity: 20,
    refillPerSecond: 0.2,
  },
  order: {
    capacity: 10,
    refillPerSecond: 0.1,
  },
  ip: {
    capacity: 60,
    refillPerSecond: 1,
  },
})

function getSingleQueryValue(value) {
  return Array.isArray(value) ? value[0] : value
}

function getRequestIp(req) {
  const forwarded = req.headers?.['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim()
  }

  if (Array.isArray(forwarded) && forwarded[0]) {
    return String(forwarded[0]).split(',')[0].trim()
  }

  return req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown'
}

function normalizeBucketKeyPart(value) {
  return encodeURIComponent(String(value || 'unknown').trim() || 'unknown').slice(0, 160)
}

function isQixiangPendingPayment(payment) {
  return payment?.provider === PAYMENT_PROVIDER.PAYQIXIANG && payment?.status === PAYMENT_STATUS.PENDING
}

function shouldActivelyReconcilePayment({ payment, latest }) {
  if (latest) return false
  return payment?.status === PAYMENT_STATUS.PENDING
}

function buildPaymentStatusRateLimitBuckets({ req, userId, payment }) {
  const orderId = payment?.id || payment?.provider_order_no || 'unknown'

  return [
    {
      key: `payment-status:user:${normalizeBucketKeyPart(userId)}`,
      ...PAYMENT_STATUS_RATE_LIMIT.user,
    },
    {
      key: `payment-status:order:${normalizeBucketKeyPart(orderId)}`,
      ...PAYMENT_STATUS_RATE_LIMIT.order,
    },
    {
      key: `payment-status:ip:${normalizeBucketKeyPart(getRequestIp(req))}`,
      ...PAYMENT_STATUS_RATE_LIMIT.ip,
    },
  ]
}

async function consumePaymentStatusRateLimit({ req, userId, payment }) {
  return consumeTokenBuckets(buildPaymentStatusRateLimitBuckets({ req, userId, payment }))
}

function sendRateLimited(res, rateLimit) {
  const retryAfterSeconds = Math.max(1, Number(rateLimit?.retryAfterSeconds || 60))
  res.setHeader?.('Retry-After', String(retryAfterSeconds))
  return res.status(429).json({
    ok: false,
    error: 'rate_limited',
    retry_after: retryAfterSeconds,
  })
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  try {
    const userId = await getUserId(req)
    if (!userId) return res.status(401).json({ error: '未登录' })

    const paymentId = getSingleQueryValue(req.query.payment_id)
    const providerOrderNo = getSingleQueryValue(req.query.provider_order_no)
    const latestFlag = String(getSingleQueryValue(req.query.latest) || '').toLowerCase()
    const latest = latestFlag === '1' || latestFlag === 'true'

    if (!paymentId && !providerOrderNo && !latest) {
      return res.status(400).json({ error: '缺少支付单标识' })
    }

    const payment = paymentId || providerOrderNo
      ? await getPaymentForUser({ userId, paymentId, providerOrderNo })
      : await getLatestPaymentForUser(userId)

    if (!payment) {
      const decision = latest ? await getUnlockDecision(userId) : null

      if (latest) {
        return res.json({
          payment: null,
          unlocked: Boolean(decision?.unlocked),
          unlock_method: decision?.method ?? null,
        })
      }

      return res.status(404).json({ error: '支付单不存在' })
    }

    if (isQixiangPendingPayment(payment)) {
      const rateLimit = await consumePaymentStatusRateLimit({ req, userId, payment })
      if (!rateLimit.allowed) {
        return sendRateLimited(res, rateLimit)
      }
    }

    const refreshedPayment = shouldActivelyReconcilePayment({ payment, latest })
      ? await reconcilePaymentStatus({ req, payment })
      : payment

    const decision = await getUnlockDecision(userId)

    return res.json({
      payment: toClientPayment(refreshedPayment),
      unlocked: Boolean(decision?.unlocked),
      unlock_method: decision?.method ?? null,
    })
  } catch (error) {
    return res.status(500).json({ error: getPaymentRuntimeErrorMessage(error, '支付状态查询失败') })
  }
}
