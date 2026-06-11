import { supabase } from './supabase.js'

const RATE_LIMIT_RPC = 'consume_api_rate_limit_tokens'
const FALLBACK_BUCKETS = new Map()
const FALLBACK_MAX_BUCKETS = 5000
const FALLBACK_STALE_MS = 60 * 60 * 1000

let sharedRateLimitWarningLogged = false

function toPositiveNumber(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : fallback
}

function normalizeBucket(bucket) {
  const key = String(bucket?.key || '').trim()
  if (!key) return null

  const capacity = toPositiveNumber(bucket.capacity, 1)
  const refillPerSecond = Math.max(0, Number(bucket.refillPerSecond ?? bucket.refill_per_second ?? 0))
  const cost = toPositiveNumber(bucket.cost, 1)

  return {
    key,
    capacity,
    refillPerSecond,
    cost,
  }
}

function normalizeBuckets(buckets) {
  return (Array.isArray(buckets) ? buckets : [])
    .map(normalizeBucket)
    .filter(Boolean)
    .sort((left, right) => left.key.localeCompare(right.key))
}

function getRetryAfterSeconds(tokens, cost, refillPerSecond) {
  if (tokens >= cost) return 0
  if (refillPerSecond <= 0) return 60
  return Math.max(1, Math.ceil((cost - tokens) / refillPerSecond))
}

function summarizeBucketResults(rows, storage) {
  const normalizedRows = (Array.isArray(rows) ? rows : []).map((row) => ({
    key: row.bucket_key ?? row.key,
    allowed: Boolean(row.allowed),
    tokensRemaining: Number(row.tokens_remaining ?? row.tokensRemaining ?? 0),
    retryAfterSeconds: Math.max(0, Number(row.retry_after_seconds ?? row.retryAfterSeconds ?? 0)),
  }))

  const allowed = normalizedRows.length > 0 && normalizedRows.every((row) => row.allowed)
  const retryAfterSeconds = allowed
    ? 0
    : Math.max(1, ...normalizedRows.map((row) => row.retryAfterSeconds || 0))

  return {
    allowed,
    retryAfterSeconds,
    storage,
    buckets: normalizedRows,
  }
}

function pruneFallbackBuckets(nowMs) {
  if (FALLBACK_BUCKETS.size <= FALLBACK_MAX_BUCKETS) return

  for (const [key, bucket] of FALLBACK_BUCKETS.entries()) {
    if (nowMs - bucket.updatedAtMs > FALLBACK_STALE_MS) {
      FALLBACK_BUCKETS.delete(key)
    }
  }

  if (FALLBACK_BUCKETS.size <= FALLBACK_MAX_BUCKETS) return

  const keysByAge = [...FALLBACK_BUCKETS.entries()]
    .sort((left, right) => left[1].updatedAtMs - right[1].updatedAtMs)
    .map(([key]) => key)

  for (const key of keysByAge.slice(0, Math.ceil(FALLBACK_MAX_BUCKETS / 5))) {
    FALLBACK_BUCKETS.delete(key)
  }
}

function consumeFallbackTokenBuckets(buckets) {
  const nowMs = Date.now()
  const states = buckets.map((bucket) => {
    const current = FALLBACK_BUCKETS.get(bucket.key)
    const elapsedSeconds = current ? Math.max(0, (nowMs - current.updatedAtMs) / 1000) : 0
    const refilledTokens = current
      ? Math.min(bucket.capacity, current.tokens + elapsedSeconds * current.refillPerSecond)
      : bucket.capacity

    return {
      ...bucket,
      tokens: refilledTokens,
      allowed: refilledTokens >= bucket.cost,
      retryAfterSeconds: getRetryAfterSeconds(refilledTokens, bucket.cost, bucket.refillPerSecond),
    }
  })

  const allowed = states.every((state) => state.allowed)
  for (const state of states) {
    FALLBACK_BUCKETS.set(state.key, {
      tokens: allowed ? Math.max(0, state.tokens - state.cost) : state.tokens,
      capacity: state.capacity,
      refillPerSecond: state.refillPerSecond,
      updatedAtMs: nowMs,
    })
  }

  pruneFallbackBuckets(nowMs)

  return summarizeBucketResults(
    states.map((state) => ({
      key: state.key,
      allowed,
      tokensRemaining: allowed ? Math.max(0, state.tokens - state.cost) : state.tokens,
      retryAfterSeconds: allowed ? 0 : state.retryAfterSeconds,
    })),
    'memory'
  )
}

async function consumeSharedTokenBuckets(buckets) {
  const payload = buckets.map((bucket) => ({
    key: bucket.key,
    capacity: bucket.capacity,
    refill_per_second: bucket.refillPerSecond,
    cost: bucket.cost,
  }))

  const { data, error } = await supabase.rpc(RATE_LIMIT_RPC, {
    p_buckets: payload,
  })

  if (error) throw error
  return summarizeBucketResults(data, 'supabase')
}

export async function consumeTokenBuckets(buckets) {
  const normalizedBuckets = normalizeBuckets(buckets)
  if (normalizedBuckets.length === 0) {
    return {
      allowed: true,
      retryAfterSeconds: 0,
      storage: supabase ? 'supabase' : 'memory',
      buckets: [],
    }
  }

  if (supabase) {
    try {
      return await consumeSharedTokenBuckets(normalizedBuckets)
    } catch (error) {
      if (!sharedRateLimitWarningLogged) {
        sharedRateLimitWarningLogged = true
        console.warn('Shared rate limit store unavailable, using in-memory fallback:', {
          message: error?.message ?? String(error),
          code: error?.code ?? null,
        })
      }
    }
  }

  return consumeFallbackTokenBuckets(normalizedBuckets)
}

export function resetInMemoryRateLimitBucketsForTest() {
  FALLBACK_BUCKETS.clear()
  sharedRateLimitWarningLogged = false
}
