import {
  PAYMENT_PROVIDER,
  buildAlipayWapPayForm,
  createPendingPayment,
  generateProviderOrderNo,
  getAlipayConfig,
  getPaymentProduct,
  getSuccessfulPaymentForUser,
  normalizePaymentProvider,
  toClientPayment,
} from '../_lib/payment.js'
import { getUserId } from '../_lib/supabase.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  try {
    const userId = await getUserId(req)
    if (!userId) return res.status(401).json({ error: '未登录' })

    const {
      provider = PAYMENT_PROVIDER.ALIPAY,
      product_code = 'report_unlock',
    } = req.body || {}

    const normalizedProvider = normalizePaymentProvider(provider)
    const product = getPaymentProduct(product_code)
    const existingPayment = await getSuccessfulPaymentForUser(userId)

    if (existingPayment) {
      return res.status(409).json({ error: '你已完成购买，无需重复支付' })
    }

    const alipayConfig = getAlipayConfig(req)
    const providerOrderNo = generateProviderOrderNo(normalizedProvider)
    const payment = await createPendingPayment({
      userId,
      provider: normalizedProvider,
      product,
      providerOrderNo,
      checkoutUrl: alipayConfig.gateway,
    })

    const paymentAction = buildAlipayWapPayForm({
      req,
      paymentId: payment.id,
      providerOrderNo,
      product,
    })

    return res.json({
      payment: toClientPayment(payment),
      payment_action: paymentAction,
    })
  } catch (error) {
    return res.status(500).json({ error: error.message || '创建支付单失败' })
  }
}
