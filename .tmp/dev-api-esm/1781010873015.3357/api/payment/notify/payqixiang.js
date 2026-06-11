import {
  PAYMENT_PROVIDER,
  getPaymentByProviderOrderNo,
  getPaymentRuntimeErrorMessage,
  getQixiangConfig,
  parseAmountToFen,
  reconcileQixiangPaymentStatus,
  verifyQixiangSignature,
} from '../../_lib/payment.js'

function sendNotifyText(res, statusCode, text) {
  res.status(statusCode)
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.send(text)
}

function normalizeQueryObject(query) {
  return Object.fromEntries(
    Object.entries(query || {}).map(([key, value]) => {
      const normalizedValue = Array.isArray(value) ? value[0] : value
      return [key, normalizedValue == null ? '' : String(normalizedValue)]
    })
  )
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return sendNotifyText(res, 405, 'fail')

  try {
    const notifyPayload = normalizeQueryObject(req.query)
    if (!notifyPayload.out_trade_no || !notifyPayload.sign) {
      return sendNotifyText(res, 400, 'fail')
    }

    const qixiangConfig = getQixiangConfig(req)
    if (!verifyQixiangSignature(notifyPayload, qixiangConfig.key)) {
      return sendNotifyText(res, 400, 'fail')
    }

    if (notifyPayload.pid !== qixiangConfig.pid) {
      return sendNotifyText(res, 400, 'fail')
    }

    if (String(notifyPayload.type || '').toLowerCase() !== qixiangConfig.payType) {
      return sendNotifyText(res, 400, 'fail')
    }

    if (notifyPayload.trade_status !== 'TRADE_SUCCESS') {
      return sendNotifyText(res, 400, 'fail')
    }

    const payment = await getPaymentByProviderOrderNo(
      PAYMENT_PROVIDER.PAYQIXIANG,
      notifyPayload.out_trade_no
    )

    if (!payment) {
      return sendNotifyText(res, 404, 'fail')
    }

    const amountFen = parseAmountToFen(notifyPayload.money)
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

    await reconcileQixiangPaymentStatus({
      req,
      payment,
      notifyPayload,
      requireSuccess: true,
    })

    return sendNotifyText(res, 200, 'success')
  } catch (error) {
    console.error(getPaymentRuntimeErrorMessage(error, '七相异步通知处理失败'))
    return sendNotifyText(res, 500, 'fail')
  }
}
