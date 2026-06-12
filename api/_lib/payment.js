import { createHash, createSign, createVerify, randomBytes, timingSafeEqual } from 'node:crypto'
import {
  buildQixiangQueryRequest,
  redactPaymentSensitiveText,
} from './payment-gateway-guard.js'
import { evaluatePaymentTestMode } from './dangerous-env.js'
import { supabase } from './supabase.js'
import { buildReportAccessPaymentContext, setReportUnlocked } from './unlock.js'

export {
  buildQixiangQueryRequest,
  getQixiangQueryAllowedHostnames,
  redactPaymentSensitiveText,
  resolveQixiangQueryMethod,
  validateQixiangQueryUrl,
} from './payment-gateway-guard.js'

export const PAYMENT_PROVIDER = Object.freeze({
  ALIPAY: 'alipay',
  PAYQIXIANG: 'payqixiang',
})

const DEFAULT_PAYMENT_PROVIDER = PAYMENT_PROVIDER.ALIPAY
const DEFAULT_QIXIANG_API_URL = 'https://api.payqixiang.cn/mapi.php'
const DEFAULT_QIXIANG_QUERY_URL = 'https://api.payqixiang.cn/api.php'

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

const PAYMENT_SCHEMA_COLUMNS = [
  'provider',
  'product_code',
  'currency',
  'provider_order_no',
  'provider_trade_no',
  'checkout_url',
  'buyer_id',
  'buyer_logon_id',
  'paid_at',
  'notify_payload',
  'failure_reason',
  'updated_at',
]

function stripTrailingSlash(value = '') {
  return value.replace(/\/+$/, '')
}

function normalizeEnvValue(value) {
  const normalized = String(value ?? '').trim()
  if (!normalized) return ''

  if (
    (normalized.startsWith('[') && normalized.endsWith(']')) ||
    (normalized.startsWith('【') && normalized.endsWith('】'))
  ) {
    return normalized.slice(1, -1).trim()
  }

  return normalized
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const normalized = normalizeEnvValue(value)
    if (normalized) return normalized
  }

  return ''
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

function getRequestClientIp(req) {
  const forwardedFor = getHeaderValue(req.headers, 'x-forwarded-for')
  const firstForwardedIp = String(forwardedFor || '').split(',')[0]?.trim()

  return (
    firstForwardedIp ||
    getHeaderValue(req.headers, 'x-real-ip') ||
    req.socket?.remoteAddress ||
    '127.0.0.1'
  )
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

  if (!Object.values(PAYMENT_PROVIDER).includes(normalizedProvider)) {
    throw new Error('当前不支持该支付方式')
  }

  return normalizedProvider
}

export function getActivePaymentProvider() {
  const configuredProvider = firstNonEmpty(process.env.PAYMENT_ACTIVE_PROVIDER)
  if (!configuredProvider) return DEFAULT_PAYMENT_PROVIDER

  return normalizePaymentProvider(configuredProvider)
}

export function resolvePaymentProviderForCreate(requestedProvider = PAYMENT_PROVIDER.ALIPAY) {
  const configuredProvider = firstNonEmpty(process.env.PAYMENT_ACTIVE_PROVIDER)
  return normalizePaymentProvider(configuredProvider || requestedProvider || DEFAULT_PAYMENT_PROVIDER)
}

function resolvePaymentAmountFen(product) {
  const paymentTestMode = evaluatePaymentTestMode(process.env)
  if (!paymentTestMode.configured) return product.amountFen

  if (!paymentTestMode.allowed) {
    console.warn('Payment test amount blocked by dangerous env guard:', {
      reasonCode: paymentTestMode.reasonCode,
      strict: paymentTestMode.strict,
      expiresAt: paymentTestMode.expiresAt?.toISOString?.() || null,
    })
    throw new Error(`PAYMENT_TEST_AMOUNT_CENTS 当前不可用: ${paymentTestMode.reasonCode}`)
  }

  return paymentTestMode.amountFen
}

export function getPaymentProduct(productCode = 'report_unlock') {
  const normalizedProductCode = String(productCode || 'report_unlock').trim()
  const product = PAYMENT_PRODUCTS[normalizedProductCode]

  if (!product) {
    throw new Error('无效商品')
  }

  return {
    ...product,
    amountFen: resolvePaymentAmountFen(product),
  }
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
  return stripTrailingSlash(firstNonEmpty(process.env.APP_BASE_URL, getRequestOrigin(req)))
}

function appendPathToBaseUrl(baseUrl, pathname) {
  const configuredBaseUrl = stripTrailingSlash(baseUrl)
  if (!configuredBaseUrl) return ''

  try {
    const parsedUrl = new URL(configuredBaseUrl)
    const normalizedPathname = stripTrailingSlash(parsedUrl.pathname || '')

    if (normalizedPathname.endsWith(pathname)) {
      return `${parsedUrl.origin}${normalizedPathname}`
    }

    return `${parsedUrl.origin}${pathname}`
  } catch {
    if (configuredBaseUrl.endsWith(pathname)) {
      return configuredBaseUrl
    }

    return `${configuredBaseUrl}${pathname}`
  }
}

export function resolveNotifyUrl(req) {
  const explicitNotifyUrl = stripTrailingSlash(firstNonEmpty(process.env.ALIPAY_NOTIFY_URL))
  if (explicitNotifyUrl) return explicitNotifyUrl

  const configuredBaseUrl = stripTrailingSlash(
    firstNonEmpty(process.env.ALIPAY_NOTIFY_BASE_URL, resolveSiteBaseUrl(req))
  )

  if (!configuredBaseUrl) return ''

  return appendPathToBaseUrl(configuredBaseUrl, '/api/payment/notify/alipay')
}

export function resolveQixiangNotifyUrl(req) {
  const explicitNotifyUrl = stripTrailingSlash(firstNonEmpty(process.env.QIXIANG_NOTIFY_URL))
  if (explicitNotifyUrl) return explicitNotifyUrl

  return appendPathToBaseUrl(resolveSiteBaseUrl(req), '/api/payment/notify/payqixiang')
}

export function getAlipayConfig(req) {
  const appId = firstNonEmpty(process.env.ALIPAY_APP_ID, process.env.APPID)
  const privateKey = normalizePemKey(
    firstNonEmpty(process.env.ALIPAY_PRIVATE_KEY, process.env.ALIPAY_APP_PRIVATE_KEY),
    'PRIVATE KEY'
  )
  const platformPublicKey = firstNonEmpty(
    process.env.ALIPAY_PUBLIC_KEY,
    process.env.ALIPAY_PLATFORM_PUBLIC_KEY,
    process.env.ALIPAY_ALIPAY_PUBLIC_KEY
  )
  const appPublicKey = firstNonEmpty(process.env.ALIPAY_APP_PUBLIC_KEY)
  const publicKey = normalizePemKey(platformPublicKey || appPublicKey, 'PUBLIC KEY')
  const sellerId = firstNonEmpty(process.env.ALIPAY_SELLER_ID, process.env.ALIPAY_SELLER_USER_ID)
  const gateway =
    firstNonEmpty(process.env.ALIPAY_GATEWAY, process.env.ALIPAY_GATEWAY_URL) ||
    'https://openapi.alipay.com/gateway.do'
  const siteBaseUrl = resolveSiteBaseUrl(req)
  const notifyUrl = resolveNotifyUrl(req)

  if (!appId) throw new Error('Missing environment variable: ALIPAY_APP_ID')
  if (!privateKey) throw new Error('Missing environment variable: ALIPAY_PRIVATE_KEY')
  if (!publicKey) throw new Error('Missing environment variable: ALIPAY_PUBLIC_KEY')
  if (!sellerId) throw new Error('Missing environment variable: ALIPAY_SELLER_ID')
  if (!siteBaseUrl) throw new Error('Missing environment variable: APP_BASE_URL')
  if (!notifyUrl) throw new Error('Missing environment variable: ALIPAY_NOTIFY_BASE_URL')

  return {
    appId,
    privateKey,
    publicKey,
    publicKeySource: platformPublicKey ? 'platform' : 'app',
    sellerId,
    gateway,
    siteBaseUrl,
    notifyUrl,
    signType: 'RSA2',
    charset: 'utf-8',
    format: 'JSON',
    version: '1.0',
  }
}

export function getQixiangConfig(req) {
  const pid = firstNonEmpty(process.env.QIXIANG_PID)
  const key = firstNonEmpty(process.env.QIXIANG_KEY)
  const apiUrl = firstNonEmpty(process.env.QIXIANG_API_URL) || DEFAULT_QIXIANG_API_URL
  const queryUrl = firstNonEmpty(process.env.QIXIANG_QUERY_URL) || DEFAULT_QIXIANG_QUERY_URL
  const siteBaseUrl = resolveSiteBaseUrl(req)
  const notifyUrl = resolveQixiangNotifyUrl(req)

  if (!pid) throw new Error('Missing environment variable: QIXIANG_PID')
  if (!key) throw new Error('Missing environment variable: QIXIANG_KEY')
  if (!siteBaseUrl) throw new Error('Missing environment variable: APP_BASE_URL')
  if (!notifyUrl) throw new Error('Missing Qixiang notify URL')

  return {
    pid,
    key,
    apiUrl,
    queryUrl,
    siteBaseUrl,
    notifyUrl,
    signType: 'MD5',
    payType: 'alipay',
    device: 'jump',
  }
}

export function generateProviderOrderNo(provider = PAYMENT_PROVIDER.ALIPAY) {
  const normalizedProvider = normalizePaymentProvider(provider)
  const timestamp = formatAlipayTimestamp(new Date()).replace(/\D/g, '')

  const suffix = randomBytes(4).toString('hex').toUpperCase()
  const prefix = normalizedProvider === PAYMENT_PROVIDER.ALIPAY ? 'ALI' : 'QX'
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

export function extractAlipayResponseContent(rawText, responseNodeName) {
  const source = String(rawText || '')
  const nodeMarker = `"${responseNodeName}"`
  const nodeIndex = source.indexOf(nodeMarker)

  if (nodeIndex === -1) {
    throw new Error(`支付宝响应缺少 ${responseNodeName}`)
  }

  const objectStart = source.indexOf('{', nodeIndex)
  if (objectStart === -1) {
    throw new Error(`支付宝响应中的 ${responseNodeName} 结构异常`)
  }

  let depth = 0
  let inString = false
  let escaped = false

  for (let index = objectStart; index < source.length; index += 1) {
    const char = source[index]

    if (escaped) {
      escaped = false
      continue
    }

    if (char === '\\') {
      escaped = true
      continue
    }

    if (char === '"') {
      inString = !inString
      continue
    }

    if (inString) continue

    if (char === '{') depth += 1
    if (char === '}') depth -= 1

    if (depth === 0) {
      return source.slice(objectStart, index + 1)
    }
  }

  throw new Error(`支付宝响应中的 ${responseNodeName} 未正常闭合`)
}

export function verifyAlipayResponseSignature(rawText, responseNodeName, sign, publicKey) {
  if (!sign) {
    throw new Error('支付宝响应缺少签名')
  }

  const responseContent = extractAlipayResponseContent(rawText, responseNodeName)
  const verifier = createVerify('RSA-SHA256')
  verifier.update(responseContent, 'utf8')
  verifier.end()
  return verifier.verify(publicKey, sign, 'base64')
}

export function serializeQixiangParamsForSigning(params) {
  return Object.keys(params || {})
    .filter((key) => {
      if (key === 'sign' || key === 'sign_type') return false

      const value = params[key]
      return value !== undefined && value !== null && value !== ''
    })
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&')
}

export function signQixiangParams(params, key) {
  return createHash('md5')
    .update(`${serializeQixiangParamsForSigning(params)}${key}`, 'utf8')
    .digest('hex')
    .toLowerCase()
}

export function verifyQixiangSignature(params, key) {
  const actualSign = String(params?.sign || '').trim().toLowerCase()
  if (!actualSign || !/^[a-f0-9]{32}$/i.test(actualSign)) return false

  const expectedSign = signQixiangParams(params, key)
  const actualBuffer = Buffer.from(actualSign, 'utf8')
  const expectedBuffer = Buffer.from(expectedSign, 'utf8')

  if (actualBuffer.length !== expectedBuffer.length) return false
  return timingSafeEqual(actualBuffer, expectedBuffer)
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

  const sign = signAlipayParams(fields, alipayConfig.privateKey)
  const actionParams = new URLSearchParams()

  Object.entries({
    app_id: fields.app_id,
    method: fields.method,
    format: fields.format,
    charset: fields.charset,
    sign_type: fields.sign_type,
    timestamp: fields.timestamp,
    version: fields.version,
    notify_url: fields.notify_url,
    return_url: fields.return_url,
    sign,
  }).forEach(([key, value]) => {
    actionParams.append(key, value)
  })

  return {
    type: 'form',
    method: 'POST',
    action: `${alipayConfig.gateway}?${actionParams.toString()}`,
    accept_charset: alipayConfig.charset,
    fields: {
      biz_content: fields.biz_content,
    },
  }
}

export function buildQixiangOrderParams({ req, paymentId, providerOrderNo, product }) {
  const qixiangConfig = getQixiangConfig(req)
  const returnUrl = `${qixiangConfig.siteBaseUrl}/user?payment_id=${paymentId}&provider=${PAYMENT_PROVIDER.PAYQIXIANG}`
  const params = {
    pid: qixiangConfig.pid,
    type: qixiangConfig.payType,
    out_trade_no: providerOrderNo,
    notify_url: qixiangConfig.notifyUrl,
    return_url: returnUrl,
    name: product.subject,
    money: formatAmountFenToYuan(product.amountFen),
    clientip: getRequestClientIp(req),
    device: qixiangConfig.device,
  }

  return {
    qixiangConfig,
    params: {
      ...params,
      sign: signQixiangParams(params, qixiangConfig.key),
      sign_type: qixiangConfig.signType,
    },
  }
}

function parseJsonResponse(rawText, fallbackMessage) {
  try {
    return JSON.parse(rawText)
  } catch {
    throw new Error(fallbackMessage)
  }
}

export async function createQixiangOrder({ req, payment, product }) {
  const { qixiangConfig, params } = buildQixiangOrderParams({
    req,
    paymentId: payment.id,
    providerOrderNo: payment.provider_order_no,
    product,
  })

  const response = await fetch(qixiangConfig.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
    },
    body: new URLSearchParams(params),
  })
  const rawText = await response.text()

  if (!response.ok) {
    throw new Error(`七相统一下单请求失败: HTTP ${response.status}`)
  }

  const payload = parseJsonResponse(rawText, '七相统一下单返回了非 JSON 响应')
  const payurl = firstNonEmpty(payload?.payurl, payload?.pay_url, payload?.url)
  const code = payload?.code == null ? '1' : String(payload.code)

  if (code !== '1') {
    throw new Error(payload?.msg || payload?.message || '七相统一下单失败')
  }

  if (!payurl) {
    throw new Error('七相统一下单返回缺少 payurl')
  }

  return {
    checkoutUrl: payurl,
    providerTradeNo: firstNonEmpty(payload?.trade_no),
    payload,
  }
}

async function requestAlipayApi({ req, method, bizContent }) {
  const alipayConfig = getAlipayConfig(req)
  const params = {
    app_id: alipayConfig.appId,
    method,
    format: alipayConfig.format,
    charset: alipayConfig.charset,
    sign_type: alipayConfig.signType,
    timestamp: formatAlipayTimestamp(),
    version: alipayConfig.version,
    biz_content: JSON.stringify(bizContent),
  }

  const body = new URLSearchParams({
    ...params,
    sign: signAlipayParams(params, alipayConfig.privateKey),
  })

  const response = await fetch(alipayConfig.gateway, {
    method: 'POST',
    headers: {
      'Content-Type': `application/x-www-form-urlencoded;charset=${alipayConfig.charset}`,
    },
    body,
  })

  const rawText = await response.text()

  if (!response.ok) {
    throw new Error(`支付宝网关请求失败: HTTP ${response.status}`)
  }

  let parsed
  try {
    parsed = JSON.parse(rawText)
  } catch {
    throw new Error('支付宝网关返回了非 JSON 响应')
  }

  return {
    alipayConfig,
    rawText,
    parsed,
  }
}

export async function queryAlipayTrade({ req, providerOrderNo, providerTradeNo }) {
  if (!providerOrderNo && !providerTradeNo) {
    throw new Error('缺少支付宝查询单号')
  }

  const responseNodeName = 'alipay_trade_query_response'
  const { alipayConfig, rawText, parsed } = await requestAlipayApi({
    req,
    method: 'alipay.trade.query',
    bizContent: {
      ...(providerTradeNo ? { trade_no: providerTradeNo } : {}),
      ...(providerOrderNo ? { out_trade_no: providerOrderNo } : {}),
    },
  })

  const responsePayload = parsed?.[responseNodeName]
  if (!responsePayload || typeof responsePayload !== 'object') {
    throw new Error('支付宝交易查询返回结构异常')
  }

  let responseSignatureValid = false
  try {
    responseSignatureValid = verifyAlipayResponseSignature(
      rawText,
      responseNodeName,
      parsed?.sign,
      alipayConfig.publicKey
    )
  } catch {
    responseSignatureValid = false
  }

  return {
    alipayConfig,
    payload: responsePayload,
    raw: parsed,
    responseSignatureValid,
  }
}

export async function queryQixiangTrade({ req, providerOrderNo }) {
  if (!providerOrderNo) {
    throw new Error('缺少七相查询单号')
  }

  const qixiangConfig = getQixiangConfig(req)
  const { url, fetchOptions } = buildQixiangQueryRequest({
    qixiangConfig,
    providerOrderNo,
  })

  const response = await fetch(url, fetchOptions)
  const rawText = await response.text()

  if (!response.ok) {
    throw new Error(`七相查单请求失败: HTTP ${response.status}`)
  }

  const payload = parseJsonResponse(rawText, '七相查单返回了非 JSON 响应')

  return {
    qixiangConfig,
    payload,
    responseSignaturePresent: Boolean(String(payload?.sign || '').trim()),
    responseSignatureValid: verifyQixiangSignature(payload, qixiangConfig.key),
  }
}

function getPaymentPayloadValue(payload, key) {
  const value = payload?.[key]
  if (value === undefined || value === null) return ''
  return String(value).trim()
}

function requirePaymentPayloadValue(payload, key, message) {
  const value = getPaymentPayloadValue(payload, key)
  if (!value) {
    throw new Error(message)
  }

  return value
}

function parseRequiredPaymentAmountToFen(amount, label) {
  const amountText = String(amount ?? '').trim()
  if (!amountText) {
    throw new Error(`${label}缺失`)
  }

  if (!/^\d+(?:\.\d{1,2})?$/.test(amountText)) {
    throw new Error(`${label}非法`)
  }

  const amountFen = parseAmountToFen(amountText)
  if (!Number.isFinite(amountFen) || amountFen <= 0) {
    throw new Error(`${label}非法`)
  }

  return amountFen
}

function validateAlipayTradeQueryPayload({ payment, alipayConfig, payload, responseSignatureValid }) {
  if (responseSignatureValid !== true) {
    throw new Error('支付宝交易查询响应验签未通过，需人工复核')
  }

  const outTradeNo = requirePaymentPayloadValue(
    payload,
    'out_trade_no',
    '支付宝查单响应缺少订单号，需人工复核'
  )
  if (outTradeNo !== payment.provider_order_no) {
    throw new Error('支付宝订单号与本地支付单不一致')
  }

  const sellerId = firstNonEmpty(payload?.seller_id, payload?.seller_user_id)
  if (!sellerId) {
    throw new Error('支付宝查单响应缺少商户号，需人工复核')
  }
  if (sellerId !== alipayConfig.sellerId) {
    throw new Error('支付宝商户号与本地配置不一致')
  }

  const amountFen = parseRequiredPaymentAmountToFen(payload?.total_amount, '支付宝查单金额')
  if (!Number.isInteger(payment.amount) || amountFen !== payment.amount) {
    throw new Error('支付宝订单金额与本地支付单不一致')
  }

  const tradeNo = getPaymentPayloadValue(payload, 'trade_no')
  if (payment.provider_trade_no && tradeNo && payment.provider_trade_no !== tradeNo) {
    throw new Error('支付宝交易号与本地支付单不一致')
  }

  return {
    provider_trade_no: tradeNo || payment.provider_trade_no,
    buyer_id: getPaymentPayloadValue(payload, 'buyer_user_id') || payment.buyer_id,
    buyer_logon_id: getPaymentPayloadValue(payload, 'buyer_logon_id') || payment.buyer_logon_id,
  }
}

function getQixiangPayloadValue(payload, ...keys) {
  for (const key of keys) {
    const value = payload?.[key]
    if (value !== undefined && value !== null && value !== '') return String(value)
  }

  return ''
}

function isQixiangQuerySuccess(payload) {
  return getQixiangPayloadValue(payload, 'status') === '1'
}

function validateQixiangPaymentPayload({
  payment,
  qixiangConfig,
  payload,
  notifyPayload = null,
  requireQueryFields = false,
}) {
  const mergedPayload = {
    ...(notifyPayload || {}),
    ...(payload || {}),
  }
  const outTradeNo = getQixiangPayloadValue(payload, 'out_trade_no')
  if (!outTradeNo && requireQueryFields) {
    throw new Error('七相查单响应缺少订单号，需人工复核')
  }
  if (outTradeNo && outTradeNo !== payment.provider_order_no) {
    throw new Error('七相订单号与本地支付单不一致')
  }

  const queryPid = getQixiangPayloadValue(payload, 'pid')
  const notifyPid = getQixiangPayloadValue(notifyPayload, 'pid')
  const pid = requireQueryFields ? queryPid : getQixiangPayloadValue(mergedPayload, 'pid')
  if (!pid && requireQueryFields) {
    throw new Error('七相查单响应缺少商户 PID，需人工复核')
  }
  if (pid && pid !== qixiangConfig.pid) {
    throw new Error('七相商户 PID 与本地配置不一致')
  }
  if (queryPid && notifyPid && queryPid !== notifyPid) {
    throw new Error('七相通知商户 PID 与查单响应不一致')
  }

  const queryType = getQixiangPayloadValue(payload, 'type').toLowerCase()
  const notifyType = getQixiangPayloadValue(notifyPayload, 'type').toLowerCase()
  const type = requireQueryFields ? queryType : getQixiangPayloadValue(mergedPayload, 'type').toLowerCase()
  if (!type && requireQueryFields) {
    throw new Error('七相查单响应缺少支付渠道，需人工复核')
  }
  if (type && type !== qixiangConfig.payType) {
    throw new Error('七相支付渠道与本地配置不一致')
  }
  if (queryType && notifyType && queryType !== notifyType) {
    throw new Error('七相通知支付渠道与查单响应不一致')
  }

  const queryAmount = getQixiangPayloadValue(payload, 'money', 'total_amount')
  const notifyAmount = getQixiangPayloadValue(notifyPayload, 'money', 'total_amount')
  const amount = requireQueryFields ? queryAmount : queryAmount || notifyAmount
  const amountFen = parseRequiredPaymentAmountToFen(amount, '七相订单金额')
  if (!Number.isInteger(payment.amount) || amountFen !== payment.amount) {
    throw new Error('七相订单金额与本地支付单不一致')
  }
  if (queryAmount && notifyAmount) {
    const notifyAmountFen = parseRequiredPaymentAmountToFen(notifyAmount, '七相通知金额')
    if (notifyAmountFen !== amountFen) {
      throw new Error('七相通知金额与查单响应不一致')
    }
  }

  const tradeNo = getQixiangPayloadValue(payload, 'trade_no')
  if (payment.provider_trade_no && tradeNo && payment.provider_trade_no !== tradeNo) {
    throw new Error('七相交易号与本地支付单不一致')
  }

  return {
    provider_trade_no: tradeNo || payment.provider_trade_no,
    buyer_id: getQixiangPayloadValue(payload, 'buyer_id', 'buyer') || payment.buyer_id,
    buyer_logon_id: getQixiangPayloadValue(payload, 'buyer_logon_id') || payment.buyer_logon_id,
  }
}

function parseQixiangTime(value) {
  return parseAlipayTime(value)
}

function assertQixiangQueryTrust({
  responseSignaturePresent,
  responseSignatureValid,
}) {
  if (!responseSignaturePresent) {
    throw new Error('七相查单响应未提供可验证签名，需人工复核')
  }

  if (responseSignatureValid !== true) {
    throw new Error('七相查单响应验签未通过，需人工复核')
  }
}

export async function reconcileQixiangPaymentStatus({ req, payment, notifyPayload = null, requireSuccess = false }) {
  const {
    qixiangConfig,
    payload,
    responseSignaturePresent,
    responseSignatureValid,
  } = await queryQixiangTrade({
    req,
    providerOrderNo: payment.provider_order_no,
  })

  if (!isQixiangQuerySuccess(payload)) {
    if (requireSuccess) {
      throw new Error('七相查单未确认支付成功')
    }

    return payment
  }

  assertQixiangQueryTrust({
    responseSignaturePresent,
    responseSignatureValid,
  })

  const baseFields = validateQixiangPaymentPayload({
    payment,
    qixiangConfig,
    payload,
    notifyPayload,
    requireQueryFields: true,
  })

  const updatedPayment = await transitionPaymentStatus(payment, PAYMENT_STATUS.SUCCESS, {
    ...baseFields,
    notify_payload: {
      source: notifyPayload ? 'payqixiang_notify_with_query' : 'payqixiang_trade_query',
      notify: notifyPayload,
      query: payload,
      query_response_signature_present: responseSignaturePresent,
      query_response_signature_valid: responseSignatureValid,
    },
    paid_at:
      payment.paid_at ||
      parseQixiangTime(getQixiangPayloadValue(payload, 'endtime', 'paid_at', 'addtime')) ||
      new Date().toISOString(),
    failure_reason: null,
  })

  await setReportUnlocked(updatedPayment.user_id, true, 'payment', {
    context: buildReportAccessPaymentContext(updatedPayment),
  })
  return updatedPayment
}

export async function reconcilePaymentStatus({ req, payment }) {
  if (!payment) return payment
  if (payment.status === PAYMENT_STATUS.SUCCESS || payment.status === PAYMENT_STATUS.REFUNDED) {
    return payment
  }

  if (payment.provider === PAYMENT_PROVIDER.PAYQIXIANG) {
    return reconcileQixiangPaymentStatus({ req, payment })
  }

  if (payment.provider !== PAYMENT_PROVIDER.ALIPAY) return payment

  const { alipayConfig, payload, raw, responseSignatureValid } = await queryAlipayTrade({
    req,
    providerOrderNo: payment.provider_order_no,
    providerTradeNo: payment.provider_trade_no,
  })

  if (responseSignatureValid !== true) {
    throw new Error('支付宝交易查询响应验签未通过，需人工复核')
  }

  if (payload.code !== '10000') {
    if (payload.sub_code === 'ACQ.TRADE_NOT_EXIST') {
      return payment
    }

    throw new Error(payload.sub_msg || payload.msg || '支付宝订单查询失败')
  }

  const verifiedFields = validateAlipayTradeQueryPayload({
    payment,
    alipayConfig,
    payload,
    responseSignatureValid,
  })
  const baseFields = {
    ...verifiedFields,
    notify_payload: {
      source: 'trade_query',
      response_signature_valid: responseSignatureValid,
      response: raw,
    },
  }

  if (payload.trade_status === 'TRADE_SUCCESS' || payload.trade_status === 'TRADE_FINISHED') {
    const updatedPayment = await transitionPaymentStatus(payment, PAYMENT_STATUS.SUCCESS, {
      ...baseFields,
      paid_at: payment.paid_at || parseAlipayTime(payload.send_pay_date) || new Date().toISOString(),
      failure_reason: null,
    })

    await setReportUnlocked(updatedPayment.user_id, true, 'payment', {
      context: buildReportAccessPaymentContext(updatedPayment),
    })
    return updatedPayment
  }

  if (payload.trade_status === 'TRADE_CLOSED' && payment.status !== PAYMENT_STATUS.SUCCESS) {
    return transitionPaymentStatus(payment, PAYMENT_STATUS.FAILED, {
      ...baseFields,
      failure_reason: '支付宝交易关闭',
    })
  }

  if (
    baseFields.provider_trade_no !== payment.provider_trade_no ||
    baseFields.buyer_id !== payment.buyer_id ||
    baseFields.buyer_logon_id !== payment.buyer_logon_id
  ) {
    return updatePaymentRecord(payment.id, baseFields)
  }

  return payment
}

export function isPaymentsSchemaMismatch(error) {
  const message = String(error?.message || '').toLowerCase()

  if (error?.code === '42703') {
    return PAYMENT_SCHEMA_COLUMNS.some((column) => message.includes(`payments.${column}`))
  }

  return PAYMENT_SCHEMA_COLUMNS.some((column) => message.includes(`column payments.${column} does not exist`))
}

export function getPaymentRuntimeErrorMessage(error, fallbackMessage) {
  if (isPaymentsSchemaMismatch(error)) {
    return '支付库表还是旧结构。请先在 Supabase SQL Editor 执行 `supabase/migrations/005_expand_payments.sql`，把 payments 表补齐后再发起支付。'
  }

  return redactPaymentSensitiveText(error?.message || fallbackMessage)
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

export async function getPaymentById(paymentId) {
  const { data, error } = await supabase
    .from('payments')
    .select(PAYMENT_SELECT_COLUMNS)
    .eq('id', paymentId)
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
  if (nextStatus === PAYMENT_STATUS.SUCCESS || nextStatus === PAYMENT_STATUS.FAILED) {
    if (payment.status === PAYMENT_STATUS.SUCCESS || payment.status === PAYMENT_STATUS.REFUNDED) {
      return payment
    }

    const { data, error } = await supabase
      .from('payments')
      .update({
        ...fields,
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', payment.id)
      .eq('status', PAYMENT_STATUS.PENDING)
      .select(PAYMENT_SELECT_COLUMNS)
      .maybeSingle()

    if (error) throw error
    if (data) return data

    return (await getPaymentById(payment.id)) || payment
  }

  return updatePaymentRecord(payment.id, {
    ...fields,
    status: nextStatus,
  })
}

export function toClientPayment(payment) {
  if (!payment) return null
  const clientFailureReason = payment.failure_reason
    ? '支付未完成，请重新发起支付或联系客服处理'
    : null

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
    failure_reason: clientFailureReason,
  }
}
