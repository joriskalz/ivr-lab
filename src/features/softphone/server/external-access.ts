import { createHash, timingSafeEqual } from 'node:crypto'
import { SOFTPHONE_EXTERNAL_WRITE_HEADER, getSoftphoneServerConfig } from '@/features/softphone/server/config'
import { SOFTPHONE_SHARED_SECRET_PLACEHOLDER } from '@/features/softphone/external-endpoints'
import type { SoftphoneExternalEndpointBundle } from '@/features/softphone/types'
import { getSoftphoneSessionByCorrelationCode, type SoftphoneSessionRecord } from '@/features/softphone/server/session-store'
import {
  consumeRateLimit,
  getRateLimitRetryAfterSeconds,
  resolveRateLimitClientKey,
  type RateLimitRule,
} from '@/features/softphone/server/rate-limit'
import { logSoftphoneInfo, logSoftphoneWarn } from '@/features/softphone/server/log'

export const SOFTPHONE_CORRELATION_HEADER = 'x-softphone-correlation-code'

const SOFTPHONE_EXTERNAL_FAILURE_RULE: RateLimitRule = {
  limit: 20,
  windowMs: 15 * 60 * 1000,
}

export function timingSafeStringEqual(candidate: string, expected: string) {
  // Hashing first hides length differences and keeps the comparison constant-time.
  const candidateDigest = createHash('sha256').update(candidate).digest()
  const expectedDigest = createHash('sha256').update(expected).digest()

  return timingSafeEqual(candidateDigest, expectedDigest)
}

export function resolveSoftphoneExternalEndpointBundle(
  correlationCode: string,
  options?: { revealSecret?: boolean },
): SoftphoneExternalEndpointBundle {
  const headerValue = options?.revealSecret === true
    ? getSoftphoneServerConfig().externalWriteSecret
    : SOFTPHONE_SHARED_SECRET_PLACEHOLDER

  return {
    caseGetUrl: '/api/public/softphone/case/get',
    caseSetUrl: '/api/public/softphone/case/set',
    correlationHeaderName: SOFTPHONE_CORRELATION_HEADER,
    correlationHeaderValue: correlationCode,
    debugInformationSetUrl: '/api/public/softphone/case/debug-information/set',
    eventSetUrl: '/api/public/softphone/case/event/set',
    headerName: SOFTPHONE_EXTERNAL_WRITE_HEADER,
    headerValue,
    phaseSetUrl: '/api/public/softphone/case/phase/set',
    ivrRawTextSetUrl: '/api/public/softphone/case/ivr-raw-text/set',
    ivrRecognizedSetUrl: '/api/public/softphone/case/ivr-recognized/set',
  }
}

export function validateSoftphoneExternalWriteAccess(request: Request) {
  const config = getSoftphoneServerConfig()
  const headerValue = request.headers.get(SOFTPHONE_EXTERNAL_WRITE_HEADER)?.trim() ?? ''

  return headerValue.length > 0 && timingSafeStringEqual(headerValue, config.externalWriteSecret)
}

export function validateSoftphoneCorrelationCode(value: string | null | undefined) {
  const normalizedValue = value?.trim() ?? ''
  return /^\d{4}$/.test(normalizedValue) ? normalizedValue : null
}

export function resolveSoftphoneExternalTargetSession(request: Request):
  | { ok: true; correlationCode: string; session: SoftphoneSessionRecord }
  | { error: string; ok: false; retryAfterSeconds?: number; status: number } {
  const url = new URL(request.url)
  const failureRateLimitKey = `softphone-external-failures:${resolveRateLimitClientKey(request)}`
  const retryAfterSeconds = getRateLimitRetryAfterSeconds(failureRateLimitKey, SOFTPHONE_EXTERNAL_FAILURE_RULE)

  if (retryAfterSeconds != null) {
    logSoftphoneWarn('external.access.denied', {
      method: request.method,
      path: url.pathname,
      reason: 'rate-limited',
    })
    return {
      error: 'Too many failed requests. Try again later.',
      ok: false,
      retryAfterSeconds,
      status: 429,
    }
  }

  if (!validateSoftphoneExternalWriteAccess(request)) {
    consumeRateLimit(failureRateLimitKey, SOFTPHONE_EXTERNAL_FAILURE_RULE)
    logSoftphoneWarn('external.access.denied', {
      method: request.method,
      path: url.pathname,
      reason: 'invalid-secret',
    })
    return {
      error: 'Invalid external softphone secret.',
      ok: false,
      status: 403,
    }
  }

  const correlationCode = validateSoftphoneCorrelationCode(request.headers.get(SOFTPHONE_CORRELATION_HEADER))

  if (correlationCode == null) {
    consumeRateLimit(failureRateLimitKey, SOFTPHONE_EXTERNAL_FAILURE_RULE)
    logSoftphoneWarn('external.access.denied', {
      method: request.method,
      path: url.pathname,
      reason: 'invalid-correlation-code',
    })
    return {
      error: 'A valid 4-digit softphone correlation code is required.',
      ok: false,
      status: 400,
    }
  }

  const session = getSoftphoneSessionByCorrelationCode(correlationCode)

  if (session == null) {
    consumeRateLimit(failureRateLimitKey, SOFTPHONE_EXTERNAL_FAILURE_RULE)
    logSoftphoneWarn('external.access.denied', {
      correlationCode,
      method: request.method,
      path: url.pathname,
      reason: 'unknown-correlation-code',
    })
    return {
      error: 'Unknown softphone correlation code.',
      ok: false,
      status: 404,
    }
  }

  logSoftphoneInfo('external.access.granted', {
    correlationCode,
    method: request.method,
    path: url.pathname,
    sessionId: session.sessionId,
  })

  return {
    correlationCode,
    ok: true,
    session,
  }
}
