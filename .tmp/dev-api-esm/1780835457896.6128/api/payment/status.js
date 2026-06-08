import {
  getPaymentRuntimeErrorMessage,
  getLatestPaymentForUser,
  getPaymentForUser,
  reconcilePaymentStatus,
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

    const refreshedPayment = payment.status === 'success'
      ? payment
      : await reconcilePaymentStatus({ req, payment })

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
