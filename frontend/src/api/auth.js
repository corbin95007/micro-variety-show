import { getHtmlResponseMessage } from '../utils/http'

function looksLikeHtml(text = '') {
  const trimmed = text.trim()
  return (
    trimmed.startsWith('<!DOCTYPE html') ||
    trimmed.startsWith('<html') ||
    trimmed.startsWith('<head') ||
    trimmed.startsWith('<body') ||
    trimmed.startsWith('<')
  )
}

async function parseAuthResponse(resp) {
  const contentType = resp.headers.get('content-type') || ''
  const text = await resp.text()
  const isHtml = contentType.includes('text/html') || looksLikeHtml(text)
  let body = null

  if (text.trim()) {
    try {
      body = JSON.parse(text)
    } catch {
      body = undefined
    }
  }

  if (!resp.ok) {
    if (body && typeof body === 'object') {
      throw new Error(body.message || body.error || '重置密码邮件发送失败，请稍后再试')
    }

    if (isHtml) {
      throw new Error(getHtmlResponseMessage())
    }

    throw new Error('重置密码邮件发送失败，请稍后再试')
  }

  if (isHtml) {
    throw new Error(getHtmlResponseMessage())
  }

  return body || { ok: true }
}

export async function requestPasswordReset(email) {
  const res = await fetch('/api/auth/password-reset', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email }),
  })

  return parseAuthResponse(res)
}
