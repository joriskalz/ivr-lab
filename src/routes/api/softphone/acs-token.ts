import { createFileRoute } from '@tanstack/react-router'
import { issueSoftphoneAcsToken } from '@/features/softphone/server/acs-session'
import { getSoftphoneCaseSession } from '@/features/softphone/server/case-store'
import { jsonResponse } from '@/features/softphone/server/json'
import { readJsonBody } from '@/features/softphone/server/parsers'
import {
  consumeRateLimit,
  rateLimitedJsonResponse,
  type RateLimitRule,
} from '@/features/softphone/server/rate-limit'

// Caps ACS identity/token minting per softphone session to blunt toll fraud
// if a session leaks; legitimate use needs at most a token per call.
const ACS_TOKEN_RULE: RateLimitRule = {
  limit: 10,
  windowMs: 60 * 1000,
}

export const Route = createFileRoute('/api/softphone/acs-token')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await readJsonBody(request)

        if (!body.ok) {
          return jsonResponse({ error: body.issues.join(' ') }, { status: 400 })
        }

        const profileId =
          body.value != null &&
          typeof body.value === 'object' &&
          !Array.isArray(body.value) &&
          typeof (body.value as { profileId?: unknown }).profileId === 'string'
            ? (body.value as { profileId: string }).profileId.trim()
            : ''

        if (!profileId) {
          return jsonResponse({ error: 'profileId is required.' }, { status: 400 })
        }

        const session = getSoftphoneCaseSession(request)

        if (session == null) {
          return jsonResponse({ error: 'Softphone session not initialized.' }, { status: 401 })
        }

        const tokenRateLimit = consumeRateLimit(`softphone-acs-token:${session.sessionId}`, ACS_TOKEN_RULE)

        if (!tokenRateLimit.ok) {
          return rateLimitedJsonResponse(tokenRateLimit.retryAfterSeconds)
        }

        const profile = session.scenario.config.profiles.find((candidate) => candidate.id === profileId)

        if (profile == null) {
          return jsonResponse({ error: 'Unknown softphone profile.' }, { status: 404 })
        }

        const tokenResult = await issueSoftphoneAcsToken(session, profile)

        return jsonResponse(tokenResult.payload)
      },
    },
  },
})
