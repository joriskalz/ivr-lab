import { createFileRoute } from '@tanstack/react-router'
import { getSoftphoneTestScenarioById } from '@/features/admin-softphone/queries'
import { createSoftphonePublicProfile, createSoftphoneScenarioSnapshot } from '@/features/softphone/scenario'
import { createSoftphoneCaseSession } from '@/features/softphone/server/case-store'
import { getSoftphoneServerConfig } from '@/features/softphone/server/config'
import { timingSafeStringEqual } from '@/features/softphone/server/external-access'
import { jsonResponse } from '@/features/softphone/server/json'
import { readJsonBody } from '@/features/softphone/server/parsers'
import {
  consumeRateLimit,
  getRateLimitRetryAfterSeconds,
  rateLimitedJsonResponse,
  resolveRateLimitClientKey,
  type RateLimitRule,
} from '@/features/softphone/server/rate-limit'
import { getSoftphoneCaseStateForSession } from '@/features/softphone/server/session-store'

getSoftphoneServerConfig()

// Attempt cap keeps request volume sane; the stricter failure cap makes
// brute-forcing the 5-digit access key infeasible from a single address.
const UNLOCK_ATTEMPT_RULE: RateLimitRule = {
  limit: 10,
  windowMs: 60 * 1000,
}
const UNLOCK_FAILURE_RULE: RateLimitRule = {
  limit: 20,
  windowMs: 60 * 60 * 1000,
}

export const Route = createFileRoute('/api/softphone/unlock')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const clientKey = resolveRateLimitClientKey(request)
        const attemptResult = consumeRateLimit(`softphone-unlock-attempts:${clientKey}`, UNLOCK_ATTEMPT_RULE)

        if (!attemptResult.ok) {
          return rateLimitedJsonResponse(attemptResult.retryAfterSeconds)
        }

        const failureRateLimitKey = `softphone-unlock-failures:${clientKey}`
        const failureRetryAfterSeconds = getRateLimitRetryAfterSeconds(failureRateLimitKey, UNLOCK_FAILURE_RULE)

        if (failureRetryAfterSeconds != null) {
          return rateLimitedJsonResponse(failureRetryAfterSeconds)
        }

        const body = await readJsonBody(request)

        if (!body.ok) {
          return jsonResponse({ error: body.issues.join(' ') }, { status: 400 })
        }

        const accessKey =
          body.value != null &&
          typeof body.value === 'object' &&
          !Array.isArray(body.value) &&
          typeof (body.value as { accessKey?: unknown }).accessKey === 'string'
            ? (body.value as { accessKey: string }).accessKey.trim()
            : ''
        const scenarioId =
          body.value != null &&
          typeof body.value === 'object' &&
          !Array.isArray(body.value) &&
          typeof (body.value as { scenarioId?: unknown }).scenarioId === 'string'
            ? (body.value as { scenarioId: string }).scenarioId.trim().toUpperCase()
            : ''

        if (!/^\d{5}$/.test(accessKey)) {
          return jsonResponse({ error: 'Access key must be a 5-digit string.' }, { status: 400 })
        }

        if (!/^[A-Z]{6}$/.test(scenarioId)) {
          return jsonResponse({ error: 'Scenario identifier must be a 6-letter string.' }, { status: 400 })
        }

        const scenario = getSoftphoneTestScenarioById(scenarioId)

        if (scenario == null) {
          consumeRateLimit(failureRateLimitKey, UNLOCK_FAILURE_RULE)
          return jsonResponse({ error: 'Unknown softphone scenario.' }, { status: 404 })
        }

        if (!timingSafeStringEqual(accessKey, scenario.accessKey)) {
          consumeRateLimit(failureRateLimitKey, UNLOCK_FAILURE_RULE)
          return jsonResponse({ error: 'Invalid access key.' }, { status: 403 })
        }

        const { headers, session } = createSoftphoneCaseSession(scenario)

        return jsonResponse({
          caseState: getSoftphoneCaseStateForSession(session),
          correlationCode: session.correlationCode,
          profiles: session.scenario.config.profiles.map(createSoftphonePublicProfile),
          scenario: createSoftphoneScenarioSnapshot(session.scenario),
          sessionId: session.sessionId,
        }, {
          headers,
        })
      },
    },
  },
})
