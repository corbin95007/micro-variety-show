import { describe, expect, it } from 'vitest'

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key'

const { resolveTestRoute } = await import('../api/test/[...path].js')

describe('test catch-all API route', () => {
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
