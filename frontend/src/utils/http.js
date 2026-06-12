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

function tryParseJson(text) {
  const trimmed = text.trim()
  if (!trimmed) return null

  try {
    return JSON.parse(trimmed)
  } catch {
    return undefined
  }
}

export function getHtmlResponseMessage() {
  return import.meta.env.DEV
    ? '本地 API 返回了 HTML 页面，请确认已运行 npm run dev:api，且 /api 请求没有被回退到 index.html'
    : '接口返回了页面内容而不是数据，请检查部署里的 /api 路由是否被重写到了 index.html'
}

export function formatRequestError(error, fallbackMessage) {
  if (error instanceof TypeError) {
    return import.meta.env.DEV
      ? '本地 API 未启动，请先在项目根目录运行 npm run dev:api'
      : '网络连接失败，请稍后再试'
  }

  return error instanceof Error ? error.message : fallbackMessage
}

function appendRequestId(message, requestId) {
  if (!requestId) return message
  return `${message}（错误编号：${requestId}）`
}

export async function parseApiResponse(resp, options = {}) {
  const {
    fallbackMessage = '请求失败，请稍后再试',
    unauthorizedMessage,
    notFoundMessage,
    htmlMessage = getHtmlResponseMessage(),
  } = options

  const contentType = resp.headers.get('content-type') || ''
  const text = await resp.text()
  const parsedBody = tryParseJson(text)
  const isHtml = contentType.includes('text/html') || looksLikeHtml(text)

  if (!resp.ok) {
    if (resp.status === 401 && unauthorizedMessage) {
      throw new Error(unauthorizedMessage)
    }

    if (resp.status === 404 && notFoundMessage) {
      throw new Error(notFoundMessage)
    }

    if (parsedBody && typeof parsedBody === 'object') {
      throw new Error(appendRequestId(
        parsedBody.error || parsedBody.message || fallbackMessage,
        parsedBody.requestId
      ))
    }

    if (isHtml) {
      throw new Error(htmlMessage)
    }

    throw new Error(fallbackMessage)
  }

  if (isHtml) {
    throw new Error(htmlMessage)
  }

  if (parsedBody !== undefined) {
    return parsedBody
  }

  throw new Error(fallbackMessage)
}
