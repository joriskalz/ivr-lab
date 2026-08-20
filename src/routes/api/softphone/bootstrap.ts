import { createFileRoute } from '@tanstack/react-router'
import { createSoftphonePublicProfile, createSoftphoneScenarioSnapshot } from '@/features/softphone/scenario'
import { getSoftphoneCaseSession } from '@/features/softphone/server/case-store'
import { getSoftphoneServerConfig } from '@/features/softphone/server/config'
import { jsonResponse } from '@/features/softphone/server/json'
import { getSoftphoneCaseStateForSession } from '@/features/softphone/server/session-store'

getSoftphoneServerConfig()

export const Route = createFileRoute('/api/softphone/bootstrap')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = getSoftphoneCaseSession(request)

        if (session == null) {
          return jsonResponse({ error: 'Softphone session not initialized.' }, { status: 401 })
        }

        return jsonResponse({
          caseState: getSoftphoneCaseStateForSession(session),
          correlationCode: session.correlationCode,
          profiles: session.scenario.config.profiles.map(createSoftphonePublicProfile),
          scenario: createSoftphoneScenarioSnapshot(session.scenario),
          sessionId: session.sessionId,
        })
      },
    },
  },
})
