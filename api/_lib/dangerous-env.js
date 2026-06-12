import dangerousEnv from './dangerous-env-core.cjs'

export const {
  PAYMENT_TEST_MODE_UNTIL,
  ISO_WITH_EXPLICIT_TIMEZONE_RE,
  evaluateEpisodeOneAiredAutoUnlock,
  evaluatePaymentTestMode,
  isStrictRuntimeEnvironment,
  parseExplicitTimezoneDate,
  validateDangerousEnv,
  validatePaymentTestAmountValue,
} = dangerousEnv
