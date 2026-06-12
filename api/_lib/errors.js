import { randomUUID } from 'node:crypto'

const DEFAULT_ERROR_MESSAGE = '服务暂时不可用，请稍后再试'
const REQUEST_ID_HEADER = 'X-Request-Id'
const SAFE_REQUEST_ID_RE = /^[A-Za-z0-9._:-]{1,128}$/

const SECRET_KEY_RE = /([?&](?:key|token|token_hash|access_token|refresh_token|recovery_grant|sign|signature|password|secret)=)[^&#\s]+/gi
const SECRET_ASSIGNMENT_RE = /(\b(?:key|token|token_hash|access_token|refresh_token|recovery_grant|sign|signature|password|secret)=)[^&#\s,;]+/gi
const JSON_SECRET_RE = /("(?:key|token|token_hash|access_token|refresh_token|recovery_grant|sign|signature|password|secret)"\s*:\s*")[^"]+(")/gi
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi
const EMAIL_AUTH_LINK_RE = /https?:\/\/[^\s"'<>]*(?:token_hash|access_token|refresh_token|recovery_grant)=[^\s"'<>]+/gi
const JWT_RE = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g
const LONG_HEX_RE = /\b[a-f0-9]{32,}\b/gi

function readRequestId(req) {
  const headerValue = req?.headers?.['x-request-id'] || req?.headers?.['x-vercel-id']
  const requestId = Array.isArray(headerValue)
    ? String(headerValue[0] || '').trim()
    : String(headerValue || '').trim()

  return SAFE_REQUEST_ID_RE.test(requestId) ? requestId : ''
}

export function getRequestId(req) {
  const requestId = readRequestId(req)
  return requestId || randomUUID()
}

export function attachRequestId(req, res) {
  const requestId = req.requestId || getRequestId(req)
  req.requestId = requestId
  res.setHeader?.(REQUEST_ID_HEADER, requestId)
  return requestId
}

export function redactSensitiveText(value) {
  if (value === undefined || value === null) return value

  return String(value)
    .replace(EMAIL_AUTH_LINK_RE, '[redacted-auth-link]')
    .replace(SECRET_KEY_RE, '$1[redacted]')
    .replace(SECRET_ASSIGNMENT_RE, '$1[redacted]')
    .replace(JSON_SECRET_RE, '$1[redacted]$2')
    .replace(BEARER_RE, 'Bearer [redacted]')
    .replace(JWT_RE, '[redacted-jwt]')
    .replace(LONG_HEX_RE, '[redacted-token]')
}

export function sanitizeLogValue(value, depth = 0) {
  if (value === null || value === undefined) return value
  if (depth > 4) return '[truncated]'

  if (typeof value === 'string') return redactSensitiveText(value)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (value instanceof Error) return sanitizeErrorForLog(value, depth + 1)
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeLogValue(item, depth + 1))
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => {
        const lowerKey = key.toLowerCase()
        if (
          lowerKey.includes('password') ||
          lowerKey.includes('secret') ||
          lowerKey.includes('token') ||
          lowerKey === 'key' ||
          lowerKey === 'sign' ||
          lowerKey === 'signature'
        ) {
          return [key, '[redacted]']
        }

        return [key, sanitizeLogValue(entryValue, depth + 1)]
      })
    )
  }

  return redactSensitiveText(value)
}

export function sanitizeErrorForLog(error, depth = 0) {
  return {
    name: error?.name ?? null,
    message: redactSensitiveText(error?.message || String(error || 'Unknown error')),
    code: error?.code ?? null,
    status: error?.status ?? error?.statusCode ?? null,
    details: redactSensitiveText(error?.details ?? ''),
    hint: redactSensitiveText(error?.hint ?? ''),
    cause: error?.cause && depth < 2 ? sanitizeLogValue(error.cause, depth + 1) : undefined,
  }
}

export function logApiError(label, { req, requestId, error, context = {}, level = 'error' } = {}) {
  const logPayload = {
    requestId: requestId || req?.requestId || null,
    ...sanitizeLogValue(context),
    error: sanitizeErrorForLog(error),
  }

  const logger = level === 'warn' ? console.warn : console.error
  logger(label, logPayload)
}

export function sendError(res, status, message, options = {}) {
  const {
    type = status >= 500 ? 'internal_error' : 'bad_request',
    requestId,
    extra = {},
  } = options

  const body = {
    error: message || DEFAULT_ERROR_MESSAGE,
    type,
    requestId,
    ...extra,
  }

  if (!requestId) delete body.requestId
  return res.status(status).json(body)
}

export function sendBadRequest(res, message, options = {}) {
  return sendError(res, 400, message, {
    type: options.type || 'bad_request',
    requestId: options.requestId,
    extra: options.extra,
  })
}

export function sendUnauthorized(res, options = {}) {
  return sendError(res, 401, options.message || '请先登录后再继续', {
    type: options.type || 'unauthorized',
    requestId: options.requestId,
  })
}

export function sendConflict(res, message, options = {}) {
  return sendError(res, 409, message, {
    type: options.type || 'conflict',
    requestId: options.requestId,
    extra: options.extra,
  })
}

export function sendRateLimited(res, options = {}) {
  const retryAfterSeconds = Math.max(1, Number(options.retryAfterSeconds || 60))
  res.setHeader?.('Retry-After', String(retryAfterSeconds))

  return sendError(res, 429, options.message || '请求过于频繁，请稍后再试', {
    type: options.type || 'rate_limited',
    requestId: options.requestId,
    extra: {
      ...(options.extra || {}),
      retry_after: retryAfterSeconds,
    },
  })
}

export function sendInternalError(res, options = {}) {
  return sendError(res, 500, options.message || DEFAULT_ERROR_MESSAGE, {
    type: options.type || 'internal_error',
    requestId: options.requestId,
  })
}

export function handleApiError(req, res, error, options = {}) {
  const requestId = options.requestId || attachRequestId(req, res)
  logApiError(options.logLabel || 'API request failed:', {
    req,
    requestId,
    error,
    context: options.context,
    level: options.level,
  })

  return sendInternalError(res, {
    requestId,
    message: options.message,
    type: options.type,
  })
}
