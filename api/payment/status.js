import {
  getLatestPaymentForUser,
  getPaymentForUser,
  toClientPayment,
} from '../_lib/payment.js'
import { getUserId } from '../_lib/supabase.js'
import { getUnlockDecision } from '../_lib/unlock.js'

function getSingleQueryValue(value) {
  return Array.isArray(value) ? value[0] : value
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
      if (latest) {
        return res.json({
          payment: null,
          unlocked: false,
          unlock_method: null,
        })
      }

      return res.status(404).json({ error: '支付单不存在' })
    }

    const decision = payment.status === 'success'
      ? await getUnlockDecision(userId)
      : null

    return res.json({
      payment: toClientPayment(payment),
      unlocked: Boolean(decision?.unlocked),
      unlock_method: decision?.method ?? null,
    })
  } catch (error) {
    return res.status(500).json({ error: error.message || '支付状态查询失败' })
  }
}
