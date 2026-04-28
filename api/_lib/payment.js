import { createSign, createVerify, randomBytes } from 'node:crypto'
import { supabase } from './supabase.js'

export const PAYMENT_PROVIDER = Object.freeze({
  ALIPAY: 'alipay',
})

export const PAYMENT_STATUS = Object.freeze({
  PENDING: 'pending',
  SUCCESS: 'success',
  FAILED: 'failed',
  REFUNDED: 'refunded',
})

const PAYMENT_PRODUCTS = Object.freeze({
  report_unlock: {
    code: 'report_unlock',
    name: '微综艺测试结果解锁',
    subject: '微综艺测试结果解锁',
    description: '一次购买，永久解锁所有测试结果',
    amountFen: 990,
    currency: 'CNY',
  },
})

const PAYMENT_SELECT_COLUMNS = [
  'id',
  'user_id',
  'provider',
  'product_code',
  'amount',
  'currency',
  'status',
  'provider_order_no',
  'provider_trade_no',
  'checkout_url',
  'buyer_id',
  'buyer_logon_id',
  'paid_at',
  'created_at',
  'updated_at',
  'failure_reason',
].join(', ')

function stripTrailingSlash(value = '') {
  return value.replace(/\/+$/, '')
}

function getHeaderValue(headers, key) {
  const value = headers?.[key]
  return Array.isArray(value) ? value[0] : value
}

function normalizePemKey(value, label) {
  if (!value) return ''

  const normalized = String(value).replace(/\\n/g, '\n').trim()
  if (normalized.includes('BEGIN')) {
    return normalized
  }

  const body = normalized.replace(/\s+/g, '')
  const wrapped = body.match(/.{1,64}/g)?.join('\n') || body
  return `-----BEGIN ${label}-----\n${wrapped}\n-----END ${label}-----`
}

function serializeParamsForSigning(params, options = {}) {
  const excludeSignType = Boolean(options.excludeSignType)

  return Object.keys(params || {})
    .filter((key) => {
      if (key === 'sign') return false
      if (excludeSignType && key === 'sign_type') return false

      const value = params[key]
      return value !== undefined && value !== null && value !== ''
    })
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&')
}

function getRequestOrigin(req) {
  const forwardedProto = getHeaderValue(req.headers, 'x-forwarded-proto')
  const forwardedHost = getHeaderValue(req.headers, 'x-forwarded-host')
  const host = forwardedHost || getHeaderValue(req.headers, 'host')

  if (!host) return ''

  return `${forwardedProto || 'https'}://${host}`
}

function getShanghaiDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

  return Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  )
}

export function normalizePaymentProvider(provider = PAYMENT_PROVIDER.ALIPAY) {
  const normalizedProvider = String(provider || PAYMENT_PROVIDER.ALIPAY).trim().toLowerCase()

  if (normalizedProvider !== PAYMENT_PROVIDER.ALIPAY) {
    throw new Error('当前仅支持支付宝支付')
  }

  return normalizedProvider
}

export function getPaymentProduct(productCode = 'report_unlock') {
  const normalizedProductCode = String(productCode || 'report_unlock').trim()
  const product = PAYMENT_PRODUCTS[normalizedProductCode]

  if (!product) {
    throw new Error('无效商品')
  }

  return product
}

export function formatAmountFenToYuan(amountFen) {
  if (!Number.isInteger(amountFen)) {
    throw new Error('支付金额必须为分单位整数')
  }

  return (amountFen / 100).toFixed(2)
}

export function parseAmountToFen(amount) {
  const parsedAmount = Number(amount)
  if (!Number.isFinite(parsedAmount)) return NaN
  return Math.round(parsedAmount * 100)
}

export function formatAlipayTimestamp(date = new Date()) {
  const parts = getShanghaiDateParts(date)

  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`
}

export function parseAlipayTime(value) {
  const text = String(value || '').trim()
  if (!text) return null

  const parsed = new Date(`${text.replace(' ', 'T')}+08:00`)
  if (Number.isNaN(parsed.getTime())) return null

  return parsed.toISOString()
}

export function resolveSiteBaseUrl(req) {
  return stripTrailingSlash(process.env.APP_BASE_URL || getRequestOrigin(req))
}

export function resolveNotifyBaseUrl(req) {
  return stripTrailingSlash(process.env.ALIPAY_NOTIFY_BASE_URL || resolveSiteBaseUrl(req))
}

export function getAlipayConfig(req) {
  const appId = process.env.ALIPAY_APP_ID
  const privateKey = normalizePemKey(process.env.ALIPAY_PRIVATE_KEY, 'PRIVATE KEY')
  const publicKey = normalizePemKey(process.env.ALIPAY_PUBLIC_KEY, 'PUBLIC KEY')
  const sellerId = process.env.ALIPAY_SELLER_ID || process.env.ALIPAY_SELLER_USER_ID
  const gateway = process.env.ALIPAY_GATEWAY || 'https://openapi.alipay.com/gateway.do'
  const siteBaseUrl = resolveSiteBaseUrl(req)
  const notifyBaseUrl = resolveNotifyBaseUrl(req)

  if (!appId) throw new Error('Missing environment variable: ALIPAY_APP_ID')
  if (!privateKey) throw new Error('Missing environment variable: ALIPAY_PRIVATE_KEY')
  if (!publicKey) throw new Error('Missing environment variable: ALIPAY_PUBLIC_KEY')
  if (!sellerId) throw new Error('Missing environment variable: ALIPAY_SELLER_ID')
  if (!siteBaseUrl) throw new Error('Missing environment variable: APP_BASE_URL')
  if (!notifyBaseUrl) throw new Error('Missing environment variable: ALIPAY_NOTIFY_BASE_URL')

  return {
    appId,
    privateKey,
    publicKey,
    sellerId,
    gateway,
    siteBaseUrl,
    notifyUrl: `${notifyBaseUrl}/api/payment/notify/alipay`,
    signType: 'RSA2',
    charset: 'utf-8',
    format: 'JSON',
    version: '1.0',
  }
}

export function generateProviderOrderNo(provider = PAYMENT_PROVIDER.ALIPAY) {
  const normalizedProvider = normalizePaymentProvider(provider)
  const timestamp = formatAlipayTimestamp(new Date()).replace(/\D/g, '')

  const suffix = randomBytes(4).toString('hex').toUpperCase()
  const prefix = normalizedProvider === PAYMENT_PROVIDER.ALIPAY ? 'ALI' : 'PAY'
  return `${prefix}${timestamp}${suffix}`
}

export function signAlipayParams(params, privateKey) {
  const signer = createSign('RSA-SHA256')
  signer.update(serializeParamsForSigning(params), 'utf8')
  signer.end()
  return signer.sign(privateKey, 'base64')
}

export function verifyAlipaySignature(params, publicKey) {
  const sign = params?.sign
  const signType = params?.sign_type || 'RSA2'

  if (!sign) return false
  if (signType !== 'RSA2') {
    throw new Error(`不支持的支付宝签名类型: ${signType}`)
  }

  const verifier = createVerify('RSA-SHA256')
  verifier.update(serializeParamsForSigning(params, { excludeSignType: true }), 'utf8')
  verifier.end()
  return verifier.verify(publicKey, sign, 'base64')
}

export function buildAlipayWapPayForm({ req, paymentId, providerOrderNo, product }) {
  const alipayConfig = getAlipayConfig(req)
  const returnUrl = `${alipayConfig.siteBaseUrl}/user?payment_id=${paymentId}&provider=${PAYMENT_PROVIDER.ALIPAY}`

  const fields = {
    app_id: alipayConfig.appId,
    method: 'alipay.trade.wap.pay',
    format: alipayConfig.format,
    charset: alipayConfig.charset,
    sign_type: alipayConfig.signType,
    timestamp: formatAlipayTimestamp(),
    version: alipayConfig.version,
    notify_url: alipayConfig.notifyUrl,
    return_url: returnUrl,
    biz_content: JSON.stringify({
      out_trade_no: providerOrderNo,
      product_code: 'QUICK_WAP_WAY',
      total_amount: formatAmountFenToYuan(product.amountFen),
      subject: product.subject,
      body: product.description,
      timeout_express: '15m',
      quit_url: `${alipayConfig.siteBaseUrl}/user`,
    }),
  }

  return {
    type: 'form',
    method: 'POST',
    action: alipayConfig.gateway,
    fields: {
      ...fields,
      sign: signAlipayParams(fields, alipayConfig.privateKey),
    },
  }
}

function normalizeFormObject(body) {
  return Object.fromEntries(
    Object.entries(body || {}).map(([key, value]) => {
      const normalizedValue = Array.isArray(value) ? value[0] : value
      return [key, normalizedValue == null ? '' : String(normalizedValue)]
    })
  )
}

async function readRequestText(req) {
  if (typeof req.body === 'string') return req.body
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8')
  if (req.body && typeof req.body === 'object') return null

  const chunks = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  if (!chunks.length) return ''
  return Buffer.concat(chunks).toString('utf8')
}

export async function parseAlipayNotifyPayload(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return normalizeFormObject(req.body)
  }

  const bodyText = await readRequestText(req)
  if (bodyText) {
    return Object.fromEntries(new URLSearchParams(bodyText))
  }

  if (req.query && typeof req.query === 'object') {
    return normalizeFormObject(req.query)
  }

  return {}
}

export async function getSuccessfulPaymentForUser(userId) {
  const { data, error } = await supabase
    .from('payments')
    .select(PAYMENT_SELECT_COLUMNS)
    .eq('user_id', userId)
    .eq('status', PAYMENT_STATUS.SUCCESS)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function createPendingPayment({ userId, provider, product, providerOrderNo, checkoutUrl }) {
  const payload = {
    user_id: userId,
    provider,
    product_code: product.code,
    amount: product.amountFen,
    currency: product.currency,
    status: PAYMENT_STATUS.PENDING,
    provider_order_no: providerOrderNo,
    checkout_url: checkoutUrl,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('payments')
    .insert(payload)
    .select(PAYMENT_SELECT_COLUMNS)
    .single()

  if (error) throw error
  return data
}

export async function getPaymentForUser({ userId, paymentId, providerOrderNo }) {
  let query = supabase
    .from('payments')
    .select(PAYMENT_SELECT_COLUMNS)
    .eq('user_id', userId)

  if (paymentId) {
    query = query.eq('id', paymentId)
  }

  if (providerOrderNo) {
    query = query.eq('provider_order_no', providerOrderNo)
  }

  const { data, error } = await query.maybeSingle()

  if (error) throw error
  return data
}

export async function getLatestPaymentForUser(userId) {
  const { data, error } = await supabase
    .from('payments')
    .select(PAYMENT_SELECT_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) throw error
  return data?.[0] || null
}

export async function getPaymentByProviderOrderNo(provider, providerOrderNo) {
  const { data, error } = await supabase
    .from('payments')
    .select(PAYMENT_SELECT_COLUMNS)
    .eq('provider', provider)
    .eq('provider_order_no', providerOrderNo)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function updatePaymentRecord(paymentId, fields) {
  const { data, error } = await supabase
    .from('payments')
    .update({
      ...fields,
      updated_at: new Date().toISOString(),
    })
    .eq('id', paymentId)
    .select(PAYMENT_SELECT_COLUMNS)
    .single()

  if (error) throw error
  return data
}

export async function transitionPaymentStatus(payment, nextStatus, fields = {}) {
  return updatePaymentRecord(payment.id, {
    ...fields,
    status: nextStatus,
  })
}

export function toClientPayment(payment) {
  if (!payment) return null

  return {
    id: payment.id,
    provider: payment.provider,
    product_code: payment.product_code,
    amount: payment.amount,
    amount_yuan: Number.isInteger(payment.amount)
      ? formatAmountFenToYuan(payment.amount)
      : null,
    currency: payment.currency,
    status: payment.status,
    provider_order_no: payment.provider_order_no,
    provider_trade_no: payment.provider_trade_no,
    paid_at: payment.paid_at,
    created_at: payment.created_at,
    updated_at: payment.updated_at,
    failure_reason: payment.failure_reason,
  }
}
