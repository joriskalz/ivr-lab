import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  consumeRateLimit,
  getRateLimitRetryAfterSeconds,
  resetSoftphoneRateLimitsForTests,
  resolveRateLimitClientKey,
} from '@/features/softphone/server/rate-limit'

const RULE = {
  limit: 3,
  windowMs: 60 * 1000,
}

describe('softphone rate limiting', () => {
  beforeEach(() => {
    resetSoftphoneRateLimitsForTests()
  })

  afterEach(() => {
    resetSoftphoneRateLimitsForTests()
  })

  test('allows requests up to the limit and rejects the rest of the window', () => {
    expect(consumeRateLimit('key', RULE).ok).toBe(true)
    expect(consumeRateLimit('key', RULE).ok).toBe(true)
    expect(consumeRateLimit('key', RULE).ok).toBe(true)

    const rejected = consumeRateLimit('key', RULE)

    expect(rejected.ok).toBe(false)
    if (!rejected.ok) {
      expect(rejected.retryAfterSeconds).toBeGreaterThan(0)
      expect(rejected.retryAfterSeconds).toBeLessThanOrEqual(60)
    }
  })

  test('tracks keys independently', () => {
    expect(consumeRateLimit('first', RULE).ok).toBe(true)
    expect(consumeRateLimit('second', RULE).ok).toBe(true)
    expect(getRateLimitRetryAfterSeconds('first', RULE)).toBeNull()
  })

  test('reports a retry delay once the limit is reached without consuming', () => {
    consumeRateLimit('key', RULE)
    consumeRateLimit('key', RULE)

    expect(getRateLimitRetryAfterSeconds('key', RULE)).toBeNull()

    consumeRateLimit('key', RULE)

    expect(getRateLimitRetryAfterSeconds('key', RULE)).toBeGreaterThan(0)
  })

  test('derives the client key from proxy headers with a local fallback', () => {
    expect(
      resolveRateLimitClientKey(
        new Request('http://localhost/', {
          headers: { 'x-forwarded-for': '198.51.100.4, 10.0.0.1' },
        }),
      ),
    ).toBe('198.51.100.4')

    expect(
      resolveRateLimitClientKey(
        new Request('http://localhost/', {
          headers: { 'x-real-ip': '198.51.100.9' },
        }),
      ),
    ).toBe('198.51.100.9')

    expect(resolveRateLimitClientKey(new Request('http://localhost/'))).toBe('local')
  })
})
