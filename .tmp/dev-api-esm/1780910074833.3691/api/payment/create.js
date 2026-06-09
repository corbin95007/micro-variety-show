import {
  PAYMENT_PROVIDER,
  PAYMENT_STATUS,
  buildAlipayWapPayForm,
  createQixiangOrder,
  createPendingPayment,
  generateProviderOrderNo,
  getPaymentRuntimeErrorMessage,
  getAlipayConfig,
  getPaymentProduct,
  getQixiangConfig,
  resolvePaymentProviderForCreate,
  toClientPayment,
  transitionPaymentStatus,
  updatePaymentRecord,
} from '../_lib/payment.js'
import { getUserId } from '../_lib/supabase.js'
import { getUnlockDecision } from '../_lib/unlock.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  try {
    const userId = await getUserId(req)
    if (!userId) return res.status(401).json({ error: '未登录' })

    const {
      provider = PAYMENT_PROVIDER.ALIPAY,
      product_code = 'report_unlock',
    } = req.body || {}

    const normalizedProvider = resolvePaymentProviderForCreate(provider)
    const product = getPaymentProduct(product_code)
    const unlockDecision = await getUnlockDecision(userId)

    if (unlockDecision.unlocked) {
      return res.status(409).json({ error: '你已完成购买，无需重复支付' })
    }

    const providerOrderNo = generateProviderOrderNo(normalizedProvider)

    if (normalizedProvider === PAYMENT_PROVIDER.PAYQIXIANG) {
      const qixiangConfig = getQixiangConfig(req)
      const payment = await createPendingPayment({
        userId,
        provider: normalizedProvider,
        product,
        providerOrderNo,
        checkoutUrl: qixiangConfig.apiUrl,
      })

      try {
        const qixiangOrder = await createQixiangOrder({
          req,
          payment,
          product,
        })
        const updatedPayment = await updatePaymentRecord(payment.id, {
          checkout_url: qixiangOrder.checkoutUrl,
          provider_trade_no: qixiangOrder.providerTradeNo || payment.provider_trade_no,
        })

        return res.json({
          payment: toClientPayment(updatedPayment),
          payment_url: qixiangOrder.checkoutUrl,
          payment_action: {
            type: 'redirect',
            method: 'GET',
            action: qixiangOrder.checkoutUrl,
            url: qixiangOrder.checkoutUrl,
          },
        })
      } catch (error) {
        await transitionPaymentStatus(payment, PAYMENT_STATUS.FAILED, {
          failure_reason: error?.message || '七相统一下单失败',
        })
        throw error
      }
    }

    const alipayConfig = getAlipayConfig(req)
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
    return res.status(500).json({ error: getPaymentRuntimeErrorMessage(error, '创建支付单失败') })
  }
}
