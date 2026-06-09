import { describe, expect, it } from 'vitest'

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key'

const { default: draftHandler } = await import('../api/_lib/test-routes/draft.js')
const { default: questionsHandler } = await import('../api/_lib/test-routes/questions.js')
const { default: resultHandler } = await import('../api/_lib/test-routes/result.js')
const { default: resultsHandler } = await import('../api/_lib/test-routes/results.js')
const { default: submitHandler } = await import('../api/_lib/test-routes/submit.js')
const { default: catchAllHandler, resolveTestRoute } = await import('../api/test/[...path].js')

describe('test catch-all API route', () => {
  it.each([
    ['draft', draftHandler],
    ['questions', questionsHandler],
    ['results', resultsHandler],
    ['submit', submitHandler],
  ])('maps /api/test/%s to the legacy handler', (path, handler) => {
    const route = resolveTestRoute({
      query: {
        path: [path],
        existing: 'value',
      },
    })

    expect(route?.handler).toBe(handler)
    expect(route?.query).toEqual({
      path: [path],
      existing: 'value',
    })
  })

  it('maps /api/test/result/:id to the legacy result id query', () => {
    const route = resolveTestRoute({
      query: {
        path: ['result', '123'],
        existing: 'value',
      },
    })

    expect(route?.query).toEqual({
      path: ['result', '123'],
      existing: 'value',
      id: '123',
    })
  })

  it('falls back to req.url when Vercel does not inject query.path', () => {
    const route = resolveTestRoute({
      url: '/api/test/results?cursor=next',
      query: {
        cursor: 'next',
      },
    })

    expect(route?.handler).toBe(resultsHandler)
    expect(route?.query).toEqual({
      cursor: 'next',
      path: ['results'],
    })
  })

  it('maps result detail routes from req.url when query.path is missing', () => {
    const route = resolveTestRoute({
      url: '/api/test/result/fake-id?from=list',
      query: {
        from: 'list',
      },
    })

    expect(route?.handler).toBe(resultHandler)
    expect(route?.query).toEqual({
      from: 'list',
      path: ['result', 'fake-id'],
      id: 'fake-id',
    })
  })

  it('normalizes URL encoding and trailing slashes in req.url fallback', () => {
    const route = resolveTestRoute({
      url: '/api/test/result/fake%20id/',
      query: {},
    })

    expect(route?.handler).toBe(resultHandler)
    expect(route?.query).toEqual({
      path: ['result', 'fake id'],
      id: 'fake id',
    })
  })

  it('rejects unknown test subroutes', () => {
    expect(resolveTestRoute({ query: { path: ['unknown'] } })).toBeNull()
    expect(resolveTestRoute({ query: { path: ['result'] } })).toBeNull()
  })

  it('returns 404 for unknown test subroutes', async () => {
    const payloads = []
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code
        return this
      },
      json(payload) {
        payloads.push(payload)
        return this
      },
    }

    await catchAllHandler({
      url: '/api/test/unknown',
      query: {},
    }, res)

    expect(res.statusCode).toBe(404)
    expect(payloads).toEqual([{ error: 'API route not found' }])
  })
})
