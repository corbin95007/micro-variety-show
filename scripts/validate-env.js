#!/usr/bin/env node

const {
  validateDangerousEnv,
} = require('../api/_lib/dangerous-env-core.cjs')

function formatValidationError(error) {
  return `${error.variable}: ${error.reasonCode}`
}

function validateEnvForBuild(env = process.env, options = {}) {
  return validateDangerousEnv(env, options)
}

function runCli() {
  const result = validateEnvForBuild(process.env)

  if (result.ok) {
    console.log('Environment validation passed.')
    return 0
  }

  console.error('Environment validation failed.')
  for (const error of result.errors) {
    console.error(`- ${formatValidationError(error)}`)
  }
  console.error('Dangerous production switches require approved companion variables and an active time window.')

  return 1
}

if (require.main === module) {
  process.exitCode = runCli()
}

module.exports = {
  formatValidationError,
  runCli,
  validateEnvForBuild,
}
