import { describe, expect, it } from 'vitest'

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key'

const { buildDraftPayload } = await import('../api/test/draft.js')

describe('test draft helpers', () => {
  it('builds a user-scoped draft upsert payload', () => {
    const now = new Date('2026-05-23T00:00:00.000Z')
    const result = buildDraftPayload(
      {
        questions: [{ id: 1, question_text: 'Q1' }],
        answers: { 1: 5 },
      },
      'user-1',
      now
    )

    expect(result.payload).toEqual({
      user_id: 'user-1',
      draft: {
        questions: [{ id: 1, question_text: 'Q1' }],
        answers: { 1: 5 },
      },
      updated_at: '2026-05-23T00:00:00.000Z',
    })
  })

  it('accepts a client updatedAt timestamp', () => {
    const result = buildDraftPayload(
      {
        questions: [],
        answers: {},
        updatedAt: '2026-05-23T01:02:03.000Z',
      },
      'user-1'
    )

    expect(result.payload.updated_at).toBe('2026-05-23T01:02:03.000Z')
  })

  it('rejects invalid payload shapes', () => {
    expect(buildDraftPayload({ answers: {} }, 'user-1').error.status).toBe(400)
    expect(buildDraftPayload({ questions: [], answers: [] }, 'user-1').error.status).toBe(400)
    expect(
      buildDraftPayload(
        { questions: [], answers: {}, updatedAt: 'not-a-date' },
        'user-1'
      ).error.status
    ).toBe(400)
  })
})
