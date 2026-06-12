import { describe, expect, it, vi } from 'vitest'

import {
  PAYMENT_TEST_MODE_UNTIL,
  evaluateEpisodeOneAiredAutoUnlock,
  evaluatePaymentTestMode,
  validateDangerousEnv,
} from '../api/_lib/dangerous-env.js'
import {
  formatValidationError,
  validateEnvForBuild,
} from '../scripts/validate-env.js'

const WINDOW_NOW = new Date('2026-06-12T10:00:00+08:00')
const EXPIRED_NOW = new Date('2026-06-21T00:00:00+08:00')

describe('dangerous environment guard', () => {
  it('blocks production payment test amount without the full confirmation bundle', () => {
    const result = evaluatePaymentTestMode({
      VERCEL_ENV: 'production',
      PAYMENT_TEST_AMOUNT_CENTS: '1',
    }, {
      now: WINDOW_NOW,
    })

    expect(result.allowed).toBe(false)
    expect(result.reasonCode).toBe('payment_test_mode_not_enabled')
  })

  it('allows production payment test amount only inside the approved window', () => {
    const result = evaluatePaymentTestMode({
      VERCEL_ENV: 'production',
      PAYMENT_TEST_AMOUNT_CENTS: '1',
      PAYMENT_TEST_MODE_ENABLED: 'true',
      PAYMENT_TEST_MODE_UNTIL,
      PAYMENT_TEST_CONFIRMATION: 'confirmed-by-ops',
    }, {
      now: WINDOW_NOW,
    })

    expect(result.allowed).toBe(true)
    expect(result.amountFen).toBe(1)
    expect(result.expiresAt.toISOString()).toBe('2026-06-20T15:59:59.000Z')
  })

  it('blocks payment test amount after the approved window even when variables remain configured', () => {
    const result = evaluatePaymentTestMode({
      VERCEL_ENV: 'production',
      PAYMENT_TEST_AMOUNT_CENTS: '1',
      PAYMENT_TEST_MODE_ENABLED: 'true',
      PAYMENT_TEST_MODE_UNTIL,
      PAYMENT_TEST_CONFIRMATION: 'confirmed-by-ops',
    }, {
      now: EXPIRED_NOW,
    })

    expect(result.allowed).toBe(false)
    expect(result.reasonCode).toBe('payment_test_window_expired')
  })

  it('requires an explicit timezone for the approved payment test expiry value', () => {
    const result = evaluatePaymentTestMode({
      NODE_ENV: 'production',
      PAYMENT_TEST_AMOUNT_CENTS: '1',
      PAYMENT_TEST_MODE_ENABLED: 'true',
      PAYMENT_TEST_MODE_UNTIL: '2026-06-20T23:59:59',
      PAYMENT_TEST_CONFIRMATION: 'confirmed-by-ops',
    }, {
      now: WINDOW_NOW,
    })

    expect(result.allowed).toBe(false)
    expect(result.reasonCode).toBe('payment_test_mode_until_missing_explicit_timezone')
  })

  it('rejects payment test expiry values that JavaScript Date would otherwise roll over', () => {
    const result = evaluatePaymentTestMode({
      NODE_ENV: 'production',
      PAYMENT_TEST_AMOUNT_CENTS: '1',
      PAYMENT_TEST_MODE_ENABLED: 'true',
      PAYMENT_TEST_MODE_UNTIL: '2026-02-31T00:00:00+08:00',
      PAYMENT_TEST_CONFIRMATION: 'confirmed-by-ops',
    }, {
      now: WINDOW_NOW,
    })

    expect(result.allowed).toBe(false)
    expect(result.reasonCode).toBe('payment_test_mode_until_invalid_datetime')
  })

  it('keeps local development payment test amount available with integer validation', () => {
    const result = evaluatePaymentTestMode({
      PAYMENT_TEST_AMOUNT_CENTS: '1',
    }, {
      now: EXPIRED_NOW,
    })

    expect(result.allowed).toBe(true)
    expect(result.strict).toBe(false)
    expect(result.amountFen).toBe(1)
  })

  it('treats Vercel preview as strict for dangerous payment overrides', () => {
    const result = evaluatePaymentTestMode({
      VERCEL_ENV: 'preview',
      PAYMENT_TEST_AMOUNT_CENTS: '1',
    }, {
      now: WINDOW_NOW,
    })

    expect(result.allowed).toBe(false)
    expect(result.strict).toBe(true)
  })

  it('blocks episode auto unlock unless two distinct confirmations and a timezone window exist', () => {
    const missingConfirmation = evaluateEpisodeOneAiredAutoUnlock({
      EPISODE_ONE_AIRED: 'true',
      EPISODE_ONE_AIRED_UNLOCK_UNTIL: '2026-06-20T23:59:59+08:00',
    }, {
      now: WINDOW_NOW,
    })

    expect(missingConfirmation.allowed).toBe(false)
    expect(missingConfirmation.reasonCode).toBe('episode_one_aired_confirmation_missing')

    const missingTimezone = evaluateEpisodeOneAiredAutoUnlock({
      EPISODE_ONE_AIRED: 'true',
      EPISODE_ONE_AIRED_CONFIRMATION_PRIMARY: 'ops-a',
      EPISODE_ONE_AIRED_CONFIRMATION_SECONDARY: 'ops-b',
      EPISODE_ONE_AIRED_UNLOCK_UNTIL: '2026-06-20T23:59:59',
    }, {
      now: WINDOW_NOW,
    })

    expect(missingTimezone.allowed).toBe(false)
    expect(missingTimezone.reasonCode).toBe('episode_one_aired_until_missing_explicit_timezone')
  })

  it('rejects episode auto unlock windows with invalid calendar dates', () => {
    const invalidUntil = evaluateEpisodeOneAiredAutoUnlock({
      EPISODE_ONE_AIRED: 'true',
      EPISODE_ONE_AIRED_CONFIRMATION_PRIMARY: 'ops-a',
      EPISODE_ONE_AIRED_CONFIRMATION_SECONDARY: 'ops-b',
      EPISODE_ONE_AIRED_UNLOCK_UNTIL: '2026-02-31T00:00:00+08:00',
    }, {
      now: WINDOW_NOW,
    })

    expect(invalidUntil.allowed).toBe(false)
    expect(invalidUntil.reasonCode).toBe('episode_one_aired_until_invalid_datetime')

    const invalidFrom = evaluateEpisodeOneAiredAutoUnlock({
      EPISODE_ONE_AIRED: 'true',
      EPISODE_ONE_AIRED_CONFIRMATION_PRIMARY: 'ops-a',
      EPISODE_ONE_AIRED_CONFIRMATION_SECONDARY: 'ops-b',
      EPISODE_ONE_AIRED_UNLOCK_FROM: '2026-04-31T00:00:00+08:00',
      EPISODE_ONE_AIRED_UNLOCK_UNTIL: '2026-06-20T23:59:59+08:00',
    }, {
      now: WINDOW_NOW,
    })

    expect(invalidFrom.allowed).toBe(false)
    expect(invalidFrom.reasonCode).toBe('episode_one_aired_from_invalid_datetime')
  })

  it('allows episode auto unlock inside a confirmed window without exposing confirmation values', () => {
    const result = evaluateEpisodeOneAiredAutoUnlock({
      EPISODE_ONE_AIRED: 'true',
      EPISODE_ONE_AIRED_CONFIRMATION_PRIMARY: 'ops-a',
      EPISODE_ONE_AIRED_CONFIRMATION_SECONDARY: 'ops-b',
      EPISODE_ONE_AIRED_UNLOCK_FROM: '2026-06-10T00:00:00+08:00',
      EPISODE_ONE_AIRED_UNLOCK_UNTIL: '2026-06-20T23:59:59+08:00',
    }, {
      now: WINDOW_NOW,
    })

    expect(result.allowed).toBe(true)
    expect(result.auditConfirmation).toEqual({
      primary_present: true,
      secondary_present: true,
      distinct_confirmations: true,
    })
    expect(JSON.stringify(result)).not.toContain('ops-a')
    expect(JSON.stringify(result)).not.toContain('ops-b')
  })

  it('returns a build validation failure with variable names and reason codes only', () => {
    const result = validateEnvForBuild({
      VERCEL_ENV: 'production',
      PAYMENT_TEST_AMOUNT_CENTS: '1',
      EPISODE_ONE_AIRED: 'true',
      EPISODE_ONE_AIRED_CONFIRMATION_PRIMARY: 'ops-a',
      EPISODE_ONE_AIRED_CONFIRMATION_SECONDARY: 'ops-b',
      EPISODE_ONE_AIRED_UNLOCK_UNTIL: '2026-06-20T23:59:59',
    }, {
      now: WINDOW_NOW,
    })

    expect(result.ok).toBe(false)
    expect(result.errors).toHaveLength(2)
    expect(result.errors.map(formatValidationError)).toEqual([
      'PAYMENT_TEST_AMOUNT_CENTS: payment_test_mode_not_enabled',
      'EPISODE_ONE_AIRED: episode_one_aired_until_missing_explicit_timezone',
    ])
    expect(JSON.stringify(result.errors)).not.toContain('ops-a')
    expect(JSON.stringify(result.errors)).not.toContain('ops-b')
  })

  it('passes build validation when no dangerous switch is configured', () => {
    expect(validateDangerousEnv({
      VERCEL_ENV: 'production',
    }, {
      now: EXPIRED_NOW,
    }).ok).toBe(true)
  })

  it('prints no secret values from the CLI failure path', async () => {
    vi.resetModules()
    const originalEnv = {
      VERCEL_ENV: process.env.VERCEL_ENV,
      PAYMENT_TEST_AMOUNT_CENTS: process.env.PAYMENT_TEST_AMOUNT_CENTS,
      PAYMENT_TEST_CONFIRMATION: process.env.PAYMENT_TEST_CONFIRMATION,
    }
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    try {
      process.env.VERCEL_ENV = 'production'
      process.env.PAYMENT_TEST_AMOUNT_CENTS = '1'
      process.env.PAYMENT_TEST_CONFIRMATION = 'super-secret-confirmation'

      const { runCli } = await import('../scripts/validate-env.js')
      expect(runCli()).toBe(1)

      const output = errorSpy.mock.calls.flat().join('\n')
      expect(output).toContain('PAYMENT_TEST_AMOUNT_CENTS')
      expect(output).not.toContain('super-secret-confirmation')
    } finally {
      Object.entries(originalEnv).forEach(([key, value]) => {
        if (value == null) {
          delete process.env[key]
        } else {
          process.env[key] = value
        }
      })
      errorSpy.mockRestore()
      logSpy.mockRestore()
    }
  })
})
