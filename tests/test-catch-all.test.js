import { describe, expect, it } from 'vitest'

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key'

const { default: draftHandler } = await import('../api/_lib/test-routes/draft.js')
const { default: questionsHandler } = await import('../api/_lib/test-routes/questions.js')
const { default: resultsHandler } = await import('../api/_lib/test-routes/results.js')
const { default: submitHandler } = await import('../api/_lib/test-routes/submit.js')
const { resolveTestRoute } = await import('../api/test/[...path].js')

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

  it('rejects unknown test subroutes', () => {
    expect(resolveTestRoute({ query: { path: ['unknown'] } })).toBeNull()
    expect(resolveTestRoute({ query: { path: ['result'] } })).toBeNull()
  })
})
