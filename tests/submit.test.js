import { describe, expect, it } from 'vitest'

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key'

const { default: handler, buildSubmitResponse } = await import('../api/test/submit.js')

describe('test submit helpers', () => {
  it('returns unlock state in the submit response', () => {
    const response = buildSubmitResponse(
      {
        id: 1,
        is_unlocked: true,
        unlock_method: 'payment',
      },
      {
        unlocked: true,
        method: 'payment',
        referralCount: 2,
      }
    )

    expect(response).toMatchObject({
      id: 1,
      is_unlocked: true,
      unlock_method: 'payment',
      unlocked: true,
      method: 'payment',
      referral_count: 2,
    })
  })

  it('defaults locked submit responses without a second unlock check', () => {
    const response = buildSubmitResponse(
      {
        id: 1,
        is_unlocked: false,
        unlock_method: null,
      },
      {
        unlocked: false,
        method: null,
        referralCount: 0,
      }
    )

    expect(response).toMatchObject({
      id: 1,
      is_unlocked: false,
      unlock_method: null,
      unlocked: false,
      method: null,
      referral_count: 0,
    })
  })

  it('keeps GET submit health checks as 405', async () => {
    const res = {
      statusCode: null,
      ended: false,
      status(code) {
        this.statusCode = code
        return this
      },
      end() {
        this.ended = true
      },
    }

    await handler({ method: 'GET' }, res)

    expect(res.statusCode).toBe(405)
    expect(res.ended).toBe(true)
  })
})
