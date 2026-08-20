import { createFileRoute } from '@tanstack/react-router'
import { setSoftphoneCaseIvrRawTextPayloadForCorrelationCode } from '@/features/softphone/server/case-store'
import { getSoftphoneServerConfig } from '@/features/softphone/server/config'
import { resolveSoftphoneExternalTargetSession } from '@/features/softphone/server/external-access'
import { jsonResponse } from '@/features/softphone/server/json'
import { parseSoftphoneRawTextPayload, readJsonBody } from '@/features/softphone/server/parsers'

getSoftphoneServerConfig()

export const Route = createFileRoute('/api/public/softphone/case/ivr-raw-text/set')({
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

        const parsedPayload = parseSoftphoneRawTextPayload(body.value)

        if (!parsedPayload.ok) {
          return jsonResponse({ error: parsedPayload.issues.join(' ') }, { status: 400 })
        }

        return jsonResponse(
          setSoftphoneCaseIvrRawTextPayloadForCorrelationCode(accessResult.correlationCode, parsedPayload.value),
        )
      },
    },
  },
})
