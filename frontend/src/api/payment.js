import { supabase } from '../utils/supabase'
import { parseApiResponse } from '../utils/http'

async function getAuthHeaders(includeJson = false) {
  const { data: { session } } = await supabase.auth.getSession()

  return {
    ...(includeJson ? { 'Content-Type': 'application/json' } : {}),
    'Authorization': `Bearer ${session?.access_token}`,
  }
}

export async function createPayment(provider = 'alipay', productCode = 'report_unlock') {
  const res = await fetch('/api/payment/create', {
    method: 'POST',
    headers: await getAuthHeaders(true),
    body: JSON.stringify({
      provider,
      product_code: productCode,
    }),
  })

  return parseApiResponse(res, {
    fallbackMessage: '创建支付单失败，请稍后再试',
    unauthorizedMessage: '登录状态已失效，请重新登录',
  })
}

export async function getPaymentStatus(paymentId) {
  const searchParams = new URLSearchParams({ payment_id: String(paymentId) })
  const res = await fetch(`/api/payment/status?${searchParams.toString()}`, {
    headers: await getAuthHeaders(),
  })

  return parseApiResponse(res, {
    fallbackMessage: '支付状态获取失败，请稍后再试',
    unauthorizedMessage: '登录状态已失效，请重新登录',
    notFoundMessage: '未找到这笔支付单',
  })
}

export async function getLatestPaymentStatus() {
  const res = await fetch('/api/payment/status?latest=1', {
    headers: await getAuthHeaders(),
  })

  return parseApiResponse(res, {
    fallbackMessage: '支付状态获取失败，请稍后再试',
    unauthorizedMessage: '登录状态已失效，请重新登录',
  })
}
