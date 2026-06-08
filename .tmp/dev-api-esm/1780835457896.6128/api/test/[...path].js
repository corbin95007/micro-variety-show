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

function normalizePath(value) {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') return value.split('/').filter(Boolean)
  return []
}

export function resolveTestRoute(req) {
  const path = normalizePath(req.query?.path)
  const [name, id, ...rest] = path

  if (rest.length > 0) return null

  if (name === 'result' && id) {
    return {
      handler: resultHandler,
      query: {
        ...req.query,
        id,
      },
    }
  }

  if (path.length === 1 && ROUTES[name]) {
    return {
      handler: ROUTES[name],
      query: req.query,
    }
  }

  return null
}

export default async function handler(req, res) {
  const route = resolveTestRoute(req)

  if (!route) {
    return res.status(404).json({ error: 'API route not found' })
  }

  req.query = route.query
  return route.handler(req, res)
}
