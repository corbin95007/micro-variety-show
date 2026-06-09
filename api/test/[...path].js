import draftHandler from '../_lib/test-routes/draft.js'
import questionsHandler from '../_lib/test-routes/questions.js'
import resultHandler from '../_lib/test-routes/result.js'
import resultsHandler from '../_lib/test-routes/results.js'
import submitHandler from '../_lib/test-routes/submit.js'

const ROUTES = {
  draft: draftHandler,
  questions: questionsHandler,
  results: resultsHandler,
  submit: submitHandler,
}

const TEST_API_PREFIX = '/api/test'

function decodePathSegment(segment) {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

function normalizePath(value) {
  if (Array.isArray(value)) return value.map((segment) => decodePathSegment(String(segment))).filter(Boolean)
  if (typeof value === 'string') return value.split('/').filter(Boolean).map(decodePathSegment)
  return []
}

function parsePathnameFromUrl(value) {
  if (typeof value !== 'string' || !value) return ''

  try {
    return new URL(value, 'https://grandwitch.local').pathname
  } catch {
    return value.split('?')[0].split('#')[0]
  }
}

function normalizePathFromUrl(req) {
  const candidates = [
    req.url,
    req.originalUrl,
    req._parsedUrl?.pathname,
    req.path,
  ]

  for (const candidate of candidates) {
    const pathname = parsePathnameFromUrl(candidate)

    if (pathname === TEST_API_PREFIX) return []
    if (!pathname.startsWith(`${TEST_API_PREFIX}/`)) continue

    return normalizePath(pathname.slice(TEST_API_PREFIX.length + 1))
  }

  return []
}

function resolveRouteForPath(path, query) {
  const [name, id, ...rest] = path

  if (rest.length > 0) return null

  if (name === 'result' && id) {
    return {
      handler: resultHandler,
      query: {
        ...query,
        id,
      },
    }
  }

  if (path.length === 1 && ROUTES[name]) {
    return {
      handler: ROUTES[name],
      query,
    }
  }

  return null
}

export function resolveTestRoute(req) {
  const queryPath = normalizePath(req.query?.path)
  if (queryPath.length > 0) return resolveRouteForPath(queryPath, req.query)

  const urlPath = normalizePathFromUrl(req)
  return resolveRouteForPath(urlPath, {
    ...req.query,
    path: urlPath,
  })
}

export default async function handler(req, res) {
  const route = resolveTestRoute(req)

  if (!route) {
    return res.status(404).json({ error: 'API route not found' })
  }

  req.query = route.query
  return route.handler(req, res)
}
