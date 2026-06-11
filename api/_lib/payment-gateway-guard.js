const DEFAULT_QIXIANG_QUERY_HOSTNAMES = Object.freeze(['api.payqixiang.cn'])

const QIXIANG_ALLOWED_HOST_ENV_KEYS = Object.freeze([
  'QIXIANG_QUERY_ALLOWED_HOSTS',
  'QIXIANG_ALLOWED_QUERY_HOSTS',
])

const SENSITIVE_QUERY_KEYS = new Set([
  'access_token',
  'key',
  'password',
  'refresh_token',
  'secret',
  'sign',
  'signature',
  'token',
])

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

function isValidHostname(hostname) {
  if (!hostname || hostname.length > 253 || hostname.includes('..')) return false

  return hostname
    .split('.')
    .every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
}

function parseHostnameEntry(entry) {
  const normalized = normalizeEnvValue(entry)
  if (!normalized) return ''

  if (normalized.includes('*')) {
    throw new Error('七相查单白名单域名配置无效')
  }

  let parsedUrl
  try {
    parsedUrl = new URL(normalized.includes('://') ? normalized : `https://${normalized}`)
  } catch {
    throw new Error('七相查单白名单域名配置无效')
  }

  if (parsedUrl.username || parsedUrl.password) {
    throw new Error('七相查单白名单域名配置无效')
  }

  const hostname = parsedUrl.hostname.toLowerCase()
  if (!isValidHostname(hostname)) {
    throw new Error('七相查单白名单域名配置无效')
  }

  return hostname
}

function splitEnvList(value) {
  return normalizeEnvValue(value)
    .split(/[\s,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export function getQixiangQueryAllowedHostnames(env = process.env) {
  const allowedHostnames = new Set(DEFAULT_QIXIANG_QUERY_HOSTNAMES)

  QIXIANG_ALLOWED_HOST_ENV_KEYS.forEach((envKey) => {
    splitEnvList(env?.[envKey]).forEach((entry) => {
      allowedHostnames.add(parseHostnameEntry(entry))
    })
  })

  return allowedHostnames
}

function assertNoSensitiveSearchParams(url) {
  for (const key of url.searchParams.keys()) {
    if (SENSITIVE_QUERY_KEYS.has(String(key).toLowerCase())) {
      throw new Error('七相查单 URL 不能包含敏感查询参数')
    }
  }
}

export function validateQixiangQueryUrl(queryUrl, env = process.env) {
  const normalizedUrl = normalizeEnvValue(queryUrl)
  if (!normalizedUrl) {
    throw new Error('Missing environment variable: QIXIANG_QUERY_URL')
  }

  let parsedUrl
  try {
    parsedUrl = new URL(normalizedUrl)
  } catch {
    throw new Error('七相查单 URL 配置无效')
  }

  if (parsedUrl.protocol !== 'https:') {
    throw new Error('七相查单 URL 必须使用 https://')
  }

  const hostname = parsedUrl.hostname.toLowerCase()
  if (!isValidHostname(hostname)) {
    throw new Error('七相查单 URL 域名配置无效')
  }

  if (!getQixiangQueryAllowedHostnames(env).has(hostname)) {
    throw new Error('七相查单 URL 域名不在白名单内')
  }

  assertNoSensitiveSearchParams(parsedUrl)
  return parsedUrl
}

export function resolveQixiangQueryMethod(env = process.env) {
  const method = normalizeEnvValue(env?.QIXIANG_QUERY_METHOD || env?.QIXIANG_QUERY_HTTP_METHOD)
    .toUpperCase()

  if (!method) return 'POST'
  if (method === 'POST' || method === 'GET') return method

  throw new Error('QIXIANG_QUERY_METHOD 只能配置为 POST 或 GET')
}

export function buildQixiangQueryRequest({ qixiangConfig, providerOrderNo, env = process.env }) {
  if (!providerOrderNo) {
    throw new Error('缺少七相查询单号')
  }

  const queryUrl = validateQixiangQueryUrl(qixiangConfig?.queryUrl, env)
  const method = resolveQixiangQueryMethod(env)
  const params = new URLSearchParams({
    act: 'order',
    pid: qixiangConfig.pid,
    out_trade_no: providerOrderNo,
  })

  if (method === 'GET') {
    params.forEach((value, key) => {
      queryUrl.searchParams.set(key, value)
    })

    return {
      method,
      url: queryUrl,
      fetchOptions: {
        method,
        headers: {
          Accept: 'application/json',
          'X-Qixiang-Key': qixiangConfig.key,
        },
      },
    }
  }

  const body = new URLSearchParams(params)
  body.set('key', qixiangConfig.key)

  return {
    method,
    url: queryUrl,
    body,
    fetchOptions: {
      method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
      },
      body,
    },
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function redactPaymentSensitiveText(value, secrets = []) {
  let text = String(value || '')
  if (!text) return text

  const configuredSecrets = [process.env.QIXIANG_KEY, ...secrets]
    .map((secret) => String(secret || '').trim())
    .filter((secret) => secret.length >= 4)

  configuredSecrets.forEach((secret) => {
    text = text.replace(new RegExp(escapeRegExp(secret), 'g'), '[redacted]')
  })

  text = text.replace(
    /([?&](?:access_token|key|password|refresh_token|secret|sign|signature|token)=)[^&#\s]+/gi,
    '$1[redacted]'
  )
  text = text.replace(
    /(["']?\b(?:access_token|key|password|refresh_token|secret|sign|signature|token)\b["']?\s*:\s*["'])[^"']*(["'])/gi,
    '$1[redacted]$2'
  )
  text = text.replace(
    /\b((?:access_token|key|password|refresh_token|secret|sign|signature|token)\s*[:=]\s*)[^\s&,}]+/gi,
    '$1[redacted]'
  )

  return text
}
