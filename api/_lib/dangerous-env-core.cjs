const PAYMENT_TEST_MODE_UNTIL = '2026-06-20T23:59:59+08:00'
const ISO_WITH_EXPLICIT_TIMEZONE_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/

function normalizeEnvValue(value) {
  return String(value ?? '').trim()
}

function isTruthy(value) {
  return normalizeEnvValue(value).toLowerCase() === 'true'
}

function isStrictRuntimeEnvironment(env = process.env) {
  const vercelEnv = normalizeEnvValue(env.VERCEL_ENV).toLowerCase()
  if (vercelEnv === 'production' || vercelEnv === 'preview') return true

  return normalizeEnvValue(env.NODE_ENV).toLowerCase() === 'production'
}

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

function getDaysInMonth(year, month) {
  if (month === 2) return isLeapYear(year) ? 29 : 28
  if ([4, 6, 9, 11].includes(month)) return 30
  return 31
}

function isValidTimezoneOffset(timezone) {
  if (timezone === 'Z') return true

  const hour = Number(timezone.slice(1, 3))
  const minute = Number(timezone.slice(4, 6))
  return hour <= 23 && minute <= 59
}

function parseExplicitTimezoneDate(value) {
  const text = normalizeEnvValue(value)
  const match = ISO_WITH_EXPLICIT_TIMEZONE_RE.exec(text)
  if (!match) {
    return {
      ok: false,
      date: null,
      reason: 'missing_explicit_timezone',
    }
  }

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, _millisecondText, timezone] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const hour = Number(hourText)
  const minute = Number(minuteText)
  const second = Number(secondText)

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > getDaysInMonth(year, month) ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    !isValidTimezoneOffset(timezone)
  ) {
    return {
      ok: false,
      date: null,
      reason: 'invalid_datetime',
    }
  }

  const date = new Date(text)
  if (Number.isNaN(date.getTime())) {
    return {
      ok: false,
      date: null,
      reason: 'invalid_datetime',
    }
  }

  return {
    ok: true,
    date,
    reason: null,
  }
}

function createAllowedResult(extra = {}) {
  return {
    allowed: true,
    reason: null,
    reasonCode: null,
    errors: [],
    ...extra,
  }
}

function createBlockedResult(reasonCode, reason, extra = {}) {
  return {
    allowed: false,
    reason,
    reasonCode,
    errors: [reason],
    ...extra,
  }
}

function validatePaymentTestAmountValue(env = process.env) {
  const configuredAmount = normalizeEnvValue(env.PAYMENT_TEST_AMOUNT_CENTS)
  if (!configuredAmount) {
    return createAllowedResult({
      configured: false,
      amountFen: null,
    })
  }

  if (!/^\d+$/.test(configuredAmount)) {
    return createBlockedResult(
      'payment_test_amount_invalid_integer',
      'PAYMENT_TEST_AMOUNT_CENTS must be a positive integer in cents.',
      {
        configured: true,
        amountFen: null,
      }
    )
  }

  const amountFen = Number(configuredAmount)
  if (!Number.isSafeInteger(amountFen) || amountFen <= 0) {
    return createBlockedResult(
      'payment_test_amount_invalid_positive_integer',
      'PAYMENT_TEST_AMOUNT_CENTS must be a positive integer in cents.',
      {
        configured: true,
        amountFen: null,
      }
    )
  }

  return createAllowedResult({
    configured: true,
    amountFen,
  })
}

function evaluatePaymentTestMode(env = process.env, options = {}) {
  const now = options.now ? new Date(options.now) : new Date()
  const strict = isStrictRuntimeEnvironment(env)
  const amountValidation = validatePaymentTestAmountValue(env)

  if (!amountValidation.configured) {
    return createAllowedResult({
      configured: false,
      amountFen: null,
      strict,
      expiresAt: null,
    })
  }

  if (!amountValidation.allowed) {
    return {
      ...amountValidation,
      strict,
      expiresAt: null,
    }
  }

  if (!strict) {
    return createAllowedResult({
      configured: true,
      amountFen: amountValidation.amountFen,
      strict,
      expiresAt: null,
    })
  }

  if (!isTruthy(env.PAYMENT_TEST_MODE_ENABLED)) {
    return createBlockedResult(
      'payment_test_mode_not_enabled',
      'PAYMENT_TEST_MODE_ENABLED must be true when PAYMENT_TEST_AMOUNT_CENTS is set in a strict environment.',
      {
        configured: true,
        amountFen: amountValidation.amountFen,
        strict,
        expiresAt: null,
      }
    )
  }

  const untilText = normalizeEnvValue(env.PAYMENT_TEST_MODE_UNTIL)
  const parsedUntil = parseExplicitTimezoneDate(untilText)
  if (!parsedUntil.ok) {
    return createBlockedResult(
      `payment_test_mode_until_${parsedUntil.reason}`,
      'PAYMENT_TEST_MODE_UNTIL must be a valid ISO datetime with an explicit timezone.',
      {
        configured: true,
        amountFen: amountValidation.amountFen,
        strict,
        expiresAt: null,
      }
    )
  }

  if (untilText !== PAYMENT_TEST_MODE_UNTIL) {
    return createBlockedResult(
      'payment_test_mode_until_mismatch',
      'PAYMENT_TEST_MODE_UNTIL must match the approved production test window.',
      {
        configured: true,
        amountFen: amountValidation.amountFen,
        strict,
        expiresAt: parsedUntil.date,
      }
    )
  }

  if (!normalizeEnvValue(env.PAYMENT_TEST_CONFIRMATION)) {
    return createBlockedResult(
      'payment_test_confirmation_missing',
      'PAYMENT_TEST_CONFIRMATION is required when PAYMENT_TEST_AMOUNT_CENTS is set in a strict environment.',
      {
        configured: true,
        amountFen: amountValidation.amountFen,
        strict,
        expiresAt: parsedUntil.date,
      }
    )
  }

  if (now.getTime() > parsedUntil.date.getTime()) {
    return createBlockedResult(
      'payment_test_window_expired',
      'The approved payment test window has expired.',
      {
        configured: true,
        amountFen: amountValidation.amountFen,
        strict,
        expiresAt: parsedUntil.date,
      }
    )
  }

  return createAllowedResult({
    configured: true,
    amountFen: amountValidation.amountFen,
    strict,
    expiresAt: parsedUntil.date,
  })
}

function evaluateEpisodeOneAiredAutoUnlock(env = process.env, options = {}) {
  const now = options.now ? new Date(options.now) : new Date()
  const enabled = isTruthy(env.EPISODE_ONE_AIRED)

  if (!enabled) {
    return createAllowedResult({
      enabled: false,
      windowStartsAt: null,
      windowExpiresAt: null,
      auditConfirmation: {
        primary_present: false,
        secondary_present: false,
        distinct_confirmations: false,
      },
    })
  }

  const primaryConfirmation = normalizeEnvValue(env.EPISODE_ONE_AIRED_CONFIRMATION_PRIMARY)
  const secondaryConfirmation = normalizeEnvValue(env.EPISODE_ONE_AIRED_CONFIRMATION_SECONDARY)

  if (!primaryConfirmation || !secondaryConfirmation) {
    return createBlockedResult(
      'episode_one_aired_confirmation_missing',
      'EPISODE_ONE_AIRED requires two confirmation variables before auto unlock can run.',
      {
        enabled: true,
        windowStartsAt: null,
        windowExpiresAt: null,
        auditConfirmation: {
          primary_present: Boolean(primaryConfirmation),
          secondary_present: Boolean(secondaryConfirmation),
          distinct_confirmations: false,
        },
      }
    )
  }

  if (primaryConfirmation === secondaryConfirmation) {
    return createBlockedResult(
      'episode_one_aired_confirmation_not_distinct',
      'EPISODE_ONE_AIRED confirmation variables must be distinct.',
      {
        enabled: true,
        windowStartsAt: null,
        windowExpiresAt: null,
        auditConfirmation: {
          primary_present: true,
          secondary_present: true,
          distinct_confirmations: false,
        },
      }
    )
  }

  const untilText = normalizeEnvValue(env.EPISODE_ONE_AIRED_UNLOCK_UNTIL)
  const parsedUntil = parseExplicitTimezoneDate(untilText)
  if (!parsedUntil.ok) {
    return createBlockedResult(
      `episode_one_aired_until_${parsedUntil.reason}`,
      'EPISODE_ONE_AIRED_UNLOCK_UNTIL must be a valid ISO datetime with an explicit timezone.',
      {
        enabled: true,
        windowStartsAt: null,
        windowExpiresAt: null,
        auditConfirmation: {
          primary_present: true,
          secondary_present: true,
          distinct_confirmations: true,
        },
      }
    )
  }

  const fromText = normalizeEnvValue(env.EPISODE_ONE_AIRED_UNLOCK_FROM)
  let parsedFrom = null
  if (fromText) {
    parsedFrom = parseExplicitTimezoneDate(fromText)
    if (!parsedFrom.ok) {
      return createBlockedResult(
        `episode_one_aired_from_${parsedFrom.reason}`,
        'EPISODE_ONE_AIRED_UNLOCK_FROM must be a valid ISO datetime with an explicit timezone.',
        {
          enabled: true,
          windowStartsAt: null,
          windowExpiresAt: parsedUntil.date,
          auditConfirmation: {
            primary_present: true,
            secondary_present: true,
            distinct_confirmations: true,
          },
        }
      )
    }

    if (now.getTime() < parsedFrom.date.getTime()) {
      return createBlockedResult(
        'episode_one_aired_window_not_started',
        'The episode auto unlock window has not started.',
        {
          enabled: true,
          windowStartsAt: parsedFrom.date,
          windowExpiresAt: parsedUntil.date,
          auditConfirmation: {
            primary_present: true,
            secondary_present: true,
            distinct_confirmations: true,
          },
        }
      )
    }
  }

  if (now.getTime() > parsedUntil.date.getTime()) {
    return createBlockedResult(
      'episode_one_aired_window_expired',
      'The episode auto unlock window has expired.',
      {
        enabled: true,
        windowStartsAt: parsedFrom?.date || null,
        windowExpiresAt: parsedUntil.date,
        auditConfirmation: {
          primary_present: true,
          secondary_present: true,
          distinct_confirmations: true,
        },
      }
    )
  }

  return createAllowedResult({
    enabled: true,
    windowStartsAt: parsedFrom?.date || null,
    windowExpiresAt: parsedUntil.date,
    auditConfirmation: {
      primary_present: true,
      secondary_present: true,
      distinct_confirmations: true,
    },
  })
}

function validateDangerousEnv(env = process.env, options = {}) {
  const payment = evaluatePaymentTestMode(env, options)
  const episode = evaluateEpisodeOneAiredAutoUnlock(env, options)
  const errors = []

  if (!payment.allowed) {
    errors.push({
      variable: 'PAYMENT_TEST_AMOUNT_CENTS',
      reasonCode: payment.reasonCode,
      message: payment.reason,
    })
  }

  if (episode.enabled && !episode.allowed) {
    errors.push({
      variable: 'EPISODE_ONE_AIRED',
      reasonCode: episode.reasonCode,
      message: episode.reason,
    })
  }

  return {
    ok: errors.length === 0,
    strict: isStrictRuntimeEnvironment(env),
    errors,
    payment,
    episode,
  }
}

module.exports = {
  PAYMENT_TEST_MODE_UNTIL,
  ISO_WITH_EXPLICIT_TIMEZONE_RE,
  evaluateEpisodeOneAiredAutoUnlock,
  evaluatePaymentTestMode,
  isStrictRuntimeEnvironment,
  parseExplicitTimezoneDate,
  validateDangerousEnv,
  validatePaymentTestAmountValue,
}
