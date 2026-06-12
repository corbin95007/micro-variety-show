import { afterEach, describe, expect, it, vi } from 'vitest'

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key'

function withEnv(nextEnv) {
  const originalEnv = Object.fromEntries(
    Object.keys(nextEnv).map((key) => [key, process.env[key]])
  )

  Object.entries(nextEnv).forEach(([key, value]) => {
    if (value == null) {
      delete process.env[key]
      return
    }

    process.env[key] = value
  })

  return () => {
    Object.entries(originalEnv).forEach(([key, value]) => {
      if (value == null) {
        delete process.env[key]
        return
      }

      process.env[key] = value
    })
  }
}

function getQueryEqFilter(query, column) {
  return query.eq.mock.calls.find(([field]) => field === column)?.[1]
}

function getSupabaseQueryForTable(supabase, tableName) {
  const index = supabase.from.mock.calls.findIndex(([table]) => table === tableName)
  if (index === -1) return null

  return supabase.from.mock.results[index]?.value || null
}

function createSelectQuery({ table, state }) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    maybeSingle: vi.fn(async () => {
      if (table === 'user_report_access') {
        return {
          data: state.manualAccess,
          error: state.manualAccessError || null,
        }
      }

      if (table === 'payments') {
        const productCodeFilter = getQueryEqFilter(query, 'product_code')
        if (
          state.successPayment &&
          productCodeFilter &&
          state.successPayment.product_code !== productCodeFilter
        ) {
          return {
            data: null,
            error: state.paymentError || null,
          }
        }

        return {
          data: state.successPayment || null,
          error: state.paymentError || null,
        }
      }

      return {
        data: null,
        error: null,
      }
    }),
  }

  if (table === 'referrals') {
    query.eq = vi.fn(async () => ({
      count: state.referralCount || 0,
      error: state.referralError || null,
    }))
  }

  return query
}

function createSupabaseMock(state = {}) {
  const supabase = {
    from: vi.fn((table) => createSelectQuery({ table, state })),
    rpc: vi.fn(async (_name, params) => {
      if (state.rpcError) {
        return {
          data: null,
          error: state.rpcError,
        }
      }

      return {
        data: {
          user_id: params.p_user_id,
          report_unlocked: params.p_report_unlocked,
          note: params.p_method,
          event_id: 123,
        },
        error: null,
      }
    }),
  }

  return supabase
}

async function loadUnlockModule(state = {}) {
  vi.resetModules()
  const supabase = createSupabaseMock(state)

  vi.doMock('../api/_lib/supabase.js', () => ({
    supabase,
  }))

  const module = await import('../api/_lib/unlock.js')

  return {
    ...module,
    supabase,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.doUnmock('../api/_lib/supabase.js')
  vi.resetModules()
})

describe('unlock ledger guard', () => {
  it('writes report access through the ledger RPC', async () => {
    const { setReportUnlocked, supabase } = await loadUnlockModule()

    await expect(setReportUnlocked('user-1', true, 'payment', {
      requestId: 'req-1',
    })).resolves.toBe(true)

    expect(supabase.rpc).toHaveBeenCalledWith('grant_report_access_with_event', {
      p_user_id: 'user-1',
      p_report_unlocked: true,
      p_method: 'payment',
      p_source: 'payment',
      p_action: 'grant',
      p_request_id: 'req-1',
      p_actor: 'system:payment',
      p_context: {},
    })
    expect(supabase.from).not.toHaveBeenCalledWith('user_report_access')
  })

  it('derives revoke action when report access is removed', async () => {
    const { setReportUnlocked, supabase } = await loadUnlockModule()

    await expect(setReportUnlocked('user-1', false, 'manual', {
      requestId: 'req-2',
    })).resolves.toBe(false)

    expect(supabase.rpc).toHaveBeenCalledWith('grant_report_access_with_event', {
      p_user_id: 'user-1',
      p_report_unlocked: false,
      p_method: 'manual',
      p_source: 'manual',
      p_action: 'revoke',
      p_request_id: 'req-2',
      p_actor: 'system:manual',
      p_context: {},
    })
  })

  it('does not fall back to direct unlock writes when the ledger RPC fails', async () => {
    const { setReportUnlocked, supabase } = await loadUnlockModule({
      rpcError: new Error('ledger insert failed'),
    })

    await expect(setReportUnlocked('user-1', true, 'payment')).rejects.toThrow('ledger insert failed')

    expect(supabase.rpc).toHaveBeenCalledTimes(1)
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('blocks single-variable episode auto unlock without writing report access', async () => {
    const restoreEnv = withEnv({
      EPISODE_ONE_AIRED: 'true',
      EPISODE_ONE_AIRED_CONFIRMATION_PRIMARY: null,
      EPISODE_ONE_AIRED_CONFIRMATION_SECONDARY: null,
      EPISODE_ONE_AIRED_UNLOCK_UNTIL: null,
    })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { getUnlockDecision, supabase } = await loadUnlockModule({
      manualAccess: null,
      referralCount: 0,
    })

    try {
      const decision = await getUnlockDecision('user-1')

      expect(decision).toEqual({
        unlocked: false,
        method: null,
        referralCount: 0,
      })
      expect(supabase.rpc).not.toHaveBeenCalled()
      expect(warnSpy).toHaveBeenCalledWith(
        'Episode one auto unlock blocked by dangerous env guard:',
        expect.objectContaining({
          reasonCode: 'episode_one_aired_confirmation_missing',
        })
      )
    } finally {
      restoreEnv()
      warnSpy.mockRestore()
    }
  })

  it('keeps referral unlock available when episode auto unlock is misconfigured', async () => {
    const restoreEnv = withEnv({
      EPISODE_ONE_AIRED: 'true',
      EPISODE_ONE_AIRED_CONFIRMATION_PRIMARY: null,
      EPISODE_ONE_AIRED_CONFIRMATION_SECONDARY: null,
      EPISODE_ONE_AIRED_UNLOCK_UNTIL: null,
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { getUnlockDecision, supabase } = await loadUnlockModule({
      manualAccess: null,
      referralCount: 3,
    })

    try {
      const decision = await getUnlockDecision('user-1')

      expect(decision).toEqual({
        unlocked: true,
        method: 'referral',
        referralCount: 3,
      })
      expect(supabase.rpc).toHaveBeenCalledWith(
        'grant_report_access_with_event',
        expect.objectContaining({
          p_user_id: 'user-1',
          p_method: 'referral',
          p_source: 'referral',
          p_action: 'grant',
          p_context: {
            invite_count: 3,
            evidence: 'referrals_count',
          },
        })
      )
    } finally {
      restoreEnv()
    }
  })

  it('allows confirmed episode auto unlock and writes only sanitized confirmation metadata', async () => {
    const restoreEnv = withEnv({
      EPISODE_ONE_AIRED: 'true',
      EPISODE_ONE_AIRED_CONFIRMATION_PRIMARY: 'operator-a-secret',
      EPISODE_ONE_AIRED_CONFIRMATION_SECONDARY: 'operator-b-secret',
      EPISODE_ONE_AIRED_UNLOCK_FROM: '2026-06-10T00:00:00+08:00',
      EPISODE_ONE_AIRED_UNLOCK_UNTIL: '2026-06-20T23:59:59+08:00',
    })
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-12T10:00:00+08:00'))
    const { getUnlockDecision, supabase } = await loadUnlockModule({
      manualAccess: null,
      referralCount: 0,
    })

    try {
      const decision = await getUnlockDecision('user-1')

      expect(decision).toEqual({
        unlocked: true,
        method: 'auto',
        referralCount: 0,
      })
      expect(supabase.rpc).toHaveBeenCalledWith(
        'grant_report_access_with_event',
        expect.objectContaining({
          p_user_id: 'user-1',
          p_method: 'auto',
          p_source: 'episode_one_aired',
          p_context: {
            window_start: '2026-06-09T16:00:00.000Z',
            window_expires_at: '2026-06-20T15:59:59.000Z',
            confirmation: {
              primary_present: true,
              secondary_present: true,
              distinct_confirmations: true,
            },
          },
        })
      )
      expect(JSON.stringify(supabase.rpc.mock.calls)).not.toContain('operator-a-secret')
      expect(JSON.stringify(supabase.rpc.mock.calls)).not.toContain('operator-b-secret')
    } finally {
      vi.useRealTimers()
      restoreEnv()
    }
  })

  it('retries ledger unlock from an existing successful payment when access is still locked', async () => {
    const restoreEnv = withEnv({
      EPISODE_ONE_AIRED: null,
    })
    const { getUnlockDecision, supabase } = await loadUnlockModule({
      manualAccess: null,
      referralCount: 0,
      successPayment: {
        id: 88,
        user_id: 'user-1',
        provider: 'payqixiang',
        product_code: 'report_unlock',
        amount: 990,
        status: 'success',
        provider_order_no: 'QX20260612000000RETRY001',
        provider_trade_no: '202606122200000001',
        paid_at: '2026-06-12T10:00:00.000Z',
        updated_at: '2026-06-12T10:00:01.000Z',
      },
    })

    try {
      const decision = await getUnlockDecision('user-1')

      expect(decision).toEqual({
        unlocked: true,
        method: 'payment',
        referralCount: 0,
      })
      expect(supabase.rpc).toHaveBeenCalledWith(
        'grant_report_access_with_event',
        expect.objectContaining({
          p_user_id: 'user-1',
          p_method: 'payment',
          p_source: 'payment',
          p_actor: 'system:payment-retry',
          p_context: {
            reason: 'payment_success_unlock_retry',
            payment_id: 88,
            provider: 'payqixiang',
            order_no: 'QX20260612000000RETRY001',
            amount_fen: 990,
            provider_trade_no: '202606122200000001',
            paid_at: '2026-06-12T10:00:00.000Z',
          },
        })
      )
      const paymentsQuery = getSupabaseQueryForTable(supabase, 'payments')
      expect(paymentsQuery.eq).toHaveBeenCalledWith('product_code', 'report_unlock')
    } finally {
      restoreEnv()
    }
  })

  it('does not retry report unlock from a successful payment for another product', async () => {
    const restoreEnv = withEnv({
      EPISODE_ONE_AIRED: null,
    })
    const { getUnlockDecision, supabase } = await loadUnlockModule({
      manualAccess: null,
      referralCount: 0,
      successPayment: {
        id: 90,
        user_id: 'user-1',
        provider: 'payqixiang',
        product_code: 'future_product',
        amount: 1990,
        status: 'success',
        provider_order_no: 'QX20260612000000OTHER001',
        provider_trade_no: '202606122200000003',
        paid_at: '2026-06-12T10:00:00.000Z',
        updated_at: '2026-06-12T10:00:01.000Z',
      },
    })

    try {
      const decision = await getUnlockDecision('user-1')

      expect(decision).toEqual({
        unlocked: false,
        method: null,
        referralCount: 0,
      })
      const paymentsQuery = getSupabaseQueryForTable(supabase, 'payments')
      expect(paymentsQuery.eq).toHaveBeenCalledWith('product_code', 'report_unlock')
      expect(supabase.rpc).not.toHaveBeenCalled()
    } finally {
      restoreEnv()
    }
  })

  it('fails closed when the successful-payment ledger retry fails', async () => {
    const restoreEnv = withEnv({
      EPISODE_ONE_AIRED: null,
    })
    const { getUnlockDecision, supabase } = await loadUnlockModule({
      manualAccess: null,
      referralCount: 0,
      successPayment: {
        id: 89,
        user_id: 'user-1',
        provider: 'alipay',
        product_code: 'report_unlock',
        amount: 990,
        status: 'success',
        provider_order_no: 'ALI20260612000000RETRY002',
        provider_trade_no: '202606122200000002',
        paid_at: '2026-06-12T10:00:00.000Z',
      },
      rpcError: new Error('ledger insert failed'),
    })

    try {
      await expect(getUnlockDecision('user-1')).rejects.toThrow('ledger insert failed')
      expect(supabase.rpc).toHaveBeenCalledTimes(1)
      expect(supabase.from).toHaveBeenCalledWith('payments')
      expect(supabase.rpc.mock.calls[0][0]).toBe('grant_report_access_with_event')
    } finally {
      restoreEnv()
    }
  })

  it('does not mark auto unlock as granted when the ledger RPC fails', async () => {
    const restoreEnv = withEnv({
      EPISODE_ONE_AIRED: 'true',
      EPISODE_ONE_AIRED_CONFIRMATION_PRIMARY: 'operator-a-secret',
      EPISODE_ONE_AIRED_CONFIRMATION_SECONDARY: 'operator-b-secret',
      EPISODE_ONE_AIRED_UNLOCK_UNTIL: '2026-06-20T23:59:59+08:00',
    })
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-12T10:00:00+08:00'))
    const { getUnlockDecision, supabase } = await loadUnlockModule({
      manualAccess: null,
      referralCount: 0,
      rpcError: new Error('ledger insert failed'),
    })

    try {
      await expect(getUnlockDecision('user-1')).rejects.toThrow('ledger insert failed')
      expect(supabase.rpc).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
      restoreEnv()
    }
  })
})
