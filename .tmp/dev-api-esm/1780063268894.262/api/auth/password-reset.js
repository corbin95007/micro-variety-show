import crypto from 'node:crypto'
import { createSupabaseAuthClient } from '../_lib/supabase.js'

const COOLDOWN_MS = 60 * 1000
const SUCCESS_MESSAGE = '如果该邮箱已注册，我们会发送密码重置邮件，请前往邮箱查看。'
const COOLDOWN_MESSAGE = '请求过于频繁，请稍后再试。'

const cooldownStore = new Map()

function json(res, status, body) {
  return res.status(status).json(body)
}

export function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function getRequestIp(req) {
  const forwarded = req.headers?.['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim()
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return String(forwarded[0]).split(',')[0].trim()
  }
  return req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown'
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

export function hashEmail(email) {
  return sha256(email)
}

function cooldownKey({ emailHash, ip }) {
  return `${emailHash}:${sha256(ip || 'unknown')}`
}

function pruneCooldowns(store, now) {
  for (const [key, entry] of store.entries()) {
    if (!entry?.expiresAt || entry.expiresAt <= now) store.delete(key)
  }
}

export function checkPasswordResetCooldown({ emailHash, ip, now = Date.now(), store = cooldownStore } = {}) {
  pruneCooldowns(store, now)

  const key = cooldownKey({ emailHash, ip })
  const existing = store.get(key)
  if (existing?.expiresAt > now) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.expiresAt - now) / 1000)),
    }
  }

  store.set(key, { expiresAt: now + COOLDOWN_MS })
  return { ok: true, retryAfterSeconds: 0 }
}

export function isSupabaseRateLimit(error) {
  const status = Number(error?.status || error?.statusCode)
  const code = String(error?.code || '').toLowerCase()
  const message = String(error?.message || '').toLowerCase()

  return status === 429 || code.includes('rate') || message.includes('rate limit')
}

export function buildSafeErrorLog(error) {
  return {
    name: error?.name ?? null,
    status: error?.status ?? error?.statusCode ?? null,
    code: error?.code ?? null,
  }
}

export async function handlePasswordReset(req, res, options = {}) {
  if (req.method !== 'POST') {
    res.setHeader?.('Allow', 'POST')
    return res.status(405).end()
  }

  const email = normalizeEmail(req.body?.email)
  if (!email) return json(res, 400, { error: '请填写邮箱地址' })
  if (!isValidEmail(email)) return json(res, 400, { error: '请填写有效的邮箱地址' })

  const emailHash = hashEmail(email)
  const ip = options.ip || getRequestIp(req)
  const cooldown = options.checkCooldown
    ? options.checkCooldown({ emailHash, ip, now: options.now ?? Date.now() })
    : checkPasswordResetCooldown({
      emailHash,
      ip,
      now: options.now ?? Date.now(),
      store: options.cooldownStore || cooldownStore,
    })

  if (!cooldown.ok) {
    const retryAfterSeconds = cooldown.retryAfterSeconds || 60
    res.setHeader?.('Retry-After', String(retryAfterSeconds))
    return json(res, 429, {
      ok: true,
      message: `${COOLDOWN_MESSAGE}请等待 ${retryAfterSeconds} 秒后重试。`,
      retryAfterSeconds,
    })
  }

  try {
    const authClient = options.authClient || createSupabaseAuthClient()
    const { error } = await authClient.auth.resetPasswordForEmail(email)

    if (error) {
      if (isSupabaseRateLimit(error)) {
        console.warn('Supabase password reset rate limited:', {
          emailHash,
          ipHash: sha256(ip || 'unknown'),
          ...buildSafeErrorLog(error),
        })
        return json(res, 429, {
          ok: true,
          message: '请求过于频繁，请稍后再试。',
        })
      }

      console.warn('Supabase password reset request failed:', {
        emailHash,
        ipHash: sha256(ip || 'unknown'),
        ...buildSafeErrorLog(error),
      })
    }

    return json(res, 200, {
      ok: true,
      message: SUCCESS_MESSAGE,
    })
  } catch (error) {
    console.error('Password reset API runtime error:', {
      emailHash,
      ipHash: sha256(ip || 'unknown'),
      ...buildSafeErrorLog(error),
    })
    return json(res, 500, { error: '密码重置服务暂时不可用，请稍后重试。' })
  }
}

export default handlePasswordReset
