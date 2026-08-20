import { createFileRoute } from '@tanstack/react-router'
import { applySoftphoneIvrEventForCorrelationCode } from '@/features/softphone/server/case-store'
import { getSoftphoneServerConfig } from '@/features/softphone/server/config'
import { resolveSoftphoneExternalTargetSession } from '@/features/softphone/server/external-access'
import { jsonResponse } from '@/features/softphone/server/json'
import { parseSoftphoneIvrEventEnvelope, readJsonBody } from '@/features/softphone/server/parsers'

getSoftphoneServerConfig()

export const Route = createFileRoute('/api/public/softphone/case/event/set')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const accessResult = resolveSoftphoneExternalTargetSession(request)

        if (!accessResult.ok) {
          return jsonResponse({ error: accessResult.error }, { status: accessResult.status })
        }

        const body = await readJsonBody(request)

        if (!body.ok) {
          return jsonResponse({ error: body.issues.join(' ') }, { status: 400 })
        }

        const parsedPayload = parseSoftphoneIvrEventEnvelope(
          body.value,
          accessResult.session.scenario.config.phases.map((phase) => phase.id),
        )

        if (!parsedPayload.ok) {
          return jsonResponse({ error: parsedPayload.issues.join(' ') }, { status: 400 })
        }

        return jsonResponse(applySoftphoneIvrEventForCorrelationCode(accessResult.correlationCode, parsedPayload.value))
      },
    },
  },
})
