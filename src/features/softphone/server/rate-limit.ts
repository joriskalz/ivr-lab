const RATE_LIMIT_STORE_KEY = '__contosoSoftphoneRateLimits'
const RATE_LIMIT_PRUNE_THRESHOLD = 10_000

export interface RateLimitRule {
  limit: number
  windowMs: number
}

type RateLimitBucket = {
  count: number
  expiresAt: number
  windowStartedAt: number
}

type RateLimitGlobalStore = typeof globalThis & {
  [RATE_LIMIT_STORE_KEY]?: Map<string, RateLimitBucket>
}

function getRateLimitStore() {
  const rateLimitGlobal = globalThis as RateLimitGlobalStore

  if (rateLimitGlobal[RATE_LIMIT_STORE_KEY] == null) {
    rateLimitGlobal[RATE_LIMIT_STORE_KEY] = new Map<string, RateLimitBucket>()
  }

  return rateLimitGlobal[RATE_LIMIT_STORE_KEY] as Map<string, RateLimitBucket>
}

function pruneExpiredBuckets(store: Map<string, RateLimitBucket>, now: number) {
  if (store.size < RATE_LIMIT_PRUNE_THRESHOLD) {
    return
  }

  for (const [key, bucket] of store) {
    if (bucket.expiresAt <= now) {
      store.delete(key)
    }
  }
}

function resolveRetryAfterSeconds(bucket: RateLimitBucket, rule: RateLimitRule, now: number) {
  return Math.max(1, Math.ceil((bucket.windowStartedAt + rule.windowMs - now) / 1000))
}

export function consumeRateLimit(key: string, rule: RateLimitRule):
  | { ok: true }
  | { ok: false; retryAfterSeconds: number } {
  const store = getRateLimitStore()
  const now = Date.now()

  pruneExpiredBuckets(store, now)

  const bucket = store.get(key)

  if (bucket == null || now - bucket.windowStartedAt >= rule.windowMs) {
    store.set(key, {
      count: 1,
      expiresAt: now + rule.windowMs,
      windowStartedAt: now,
    })
    return { ok: true }
  }

  bucket.count += 1

  if (bucket.count > rule.limit) {
    return {
      ok: false,
      retryAfterSeconds: resolveRetryAfterSeconds(bucket, rule, now),
    }
  }

  return { ok: true }
}

export function getRateLimitRetryAfterSeconds(key: string, rule: RateLimitRule) {
  const bucket = getRateLimitStore().get(key)
  const now = Date.now()

  if (bucket == null || now - bucket.windowStartedAt >= rule.windowMs || bucket.count < rule.limit) {
    return null
  }

  return resolveRetryAfterSeconds(bucket, rule, now)
}

export function resolveRateLimitClientKey(request: Request) {
  // Only meaningful when the app runs behind a proxy that overwrites these
  // headers; direct clients could spoof them, so the limiter treats the
  // per-address budgets as best effort, not as an authorization boundary.
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()

  if (forwardedFor) {
    return forwardedFor
  }

  return request.headers.get('x-real-ip')?.trim() || 'local'
}

export function rateLimitedJsonResponse(retryAfterSeconds: number) {
  return new Response(JSON.stringify({ error: 'Too many requests. Try again later.' }), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'retry-after': String(retryAfterSeconds),
    },
    status: 429,
  })
}

export function resetSoftphoneRateLimitsForTests() {
  getRateLimitStore().clear()
}
