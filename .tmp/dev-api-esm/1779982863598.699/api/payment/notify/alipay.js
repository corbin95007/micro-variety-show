import {
  PAYMENT_PROVIDER,
  PAYMENT_STATUS,
  getAlipayConfig,
  getPaymentRuntimeErrorMessage,
  getPaymentByProviderOrderNo,
  parseAlipayNotifyPayload,
  parseAlipayTime,
  parseAmountToFen,
  transitionPaymentStatus,
  updatePaymentRecord,
  verifyAlipaySignature,
} from '../../_lib/payment.js'
import { setReportUnlocked } from '../../_lib/unlock.js'

function sendNotifyText(res, statusCode, text) {
  res.status(statusCode)
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.send(text)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendNotifyText(res, 405, 'fail')

  try {
    const notifyPayload = await parseAlipayNotifyPayload(req)
    if (!notifyPayload.out_trade_no || !notifyPayload.sign) {
      return sendNotifyText(res, 400, 'fail')
    }

    const alipayConfig = getAlipayConfig(req)
    if (alipayConfig.publicKeySource !== 'platform') {
      console.warn(
        'ALIPAY_PUBLIC_KEY 未配置支付宝公钥，当前回退到了应用公钥。异步回调验签大概率会失败，请替换为沙盒支付宝公钥。'
      )
    }
    const signatureValid = verifyAlipaySignature(notifyPayload, alipayConfig.publicKey)

    if (!signatureValid) {
      return sendNotifyText(res, 400, 'fail')
    }

    if (notifyPayload.app_id && notifyPayload.app_id !== alipayConfig.appId) {
      return sendNotifyText(res, 400, 'fail')
    }

    if (notifyPayload.seller_id && notifyPayload.seller_id !== alipayConfig.sellerId) {
      return sendNotifyText(res, 400, 'fail')
    }

    const payment = await getPaymentByProviderOrderNo(
      PAYMENT_PROVIDER.ALIPAY,
      notifyPayload.out_trade_no
    )

    if (!payment) {
      return sendNotifyText(res, 404, 'fail')
    }

    const amountFen = parseAmountToFen(notifyPayload.total_amount)
    if (!Number.isFinite(amountFen) || amountFen !== payment.amount) {
      return sendNotifyText(res, 400, 'fail')
    }

    if (
      payment.provider_trade_no &&
      notifyPayload.trade_no &&
      payment.provider_trade_no !== notifyPayload.trade_no
    ) {
      return sendNotifyText(res, 400, 'fail')
    }

    const baseFields = {
      provider_trade_no: notifyPayload.trade_no || payment.provider_trade_no,
      buyer_id: notifyPayload.buyer_id || payment.buyer_id,
      buyer_logon_id: notifyPayload.buyer_logon_id || payment.buyer_logon_id,
      notify_payload: notifyPayload,
    }

    const tradeStatus = notifyPayload.trade_status

    if (tradeStatus === 'TRADE_SUCCESS' || tradeStatus === 'TRADE_FINISHED') {
      const updatedPayment = await transitionPaymentStatus(payment, PAYMENT_STATUS.SUCCESS, {
        ...baseFields,
        paid_at: payment.paid_at || parseAlipayTime(notifyPayload.gmt_payment) || new Date().toISOString(),
        failure_reason: null,
      })

      await setReportUnlocked(updatedPayment.user_id, true, 'payment')

      return sendNotifyText(res, 200, 'success')
    }

    if (tradeStatus === 'TRADE_CLOSED' && payment.status !== PAYMENT_STATUS.SUCCESS) {
      await transitionPaymentStatus(payment, PAYMENT_STATUS.FAILED, {
        ...baseFields,
        failure_reason: '支付宝交易关闭',
      })

      return sendNotifyText(res, 200, 'success')
    }

    await updatePaymentRecord(payment.id, baseFields)
    return sendNotifyText(res, 200, 'success')
  } catch (error) {
    console.error(getPaymentRuntimeErrorMessage(error, '支付宝异步通知处理失败'))
    return sendNotifyText(res, 500, 'fail')
  }
}
