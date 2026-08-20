import { createFileRoute } from '@tanstack/react-router'
import { setSoftphoneCaseDataPayload } from '@/features/softphone/server/case-store'
import { getSoftphoneServerConfig } from '@/features/softphone/server/config'
import { jsonResponse } from '@/features/softphone/server/json'
import { parseSoftphoneCaseDataPayload, readJsonBody } from '@/features/softphone/server/parsers'

getSoftphoneServerConfig()

export const Route = createFileRoute('/api/softphone/case/set')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await readJsonBody(request)

        if (!body.ok) {
          return jsonResponse({ error: body.issues.join(' ') }, { status: 400 })
        }

        const parsedPayload = parseSoftphoneCaseDataPayload(body.value)

        if (!parsedPayload.ok) {
          return jsonResponse({ error: parsedPayload.issues.join(' ') }, { status: 400 })
        }

        const result = setSoftphoneCaseDataPayload(request, parsedPayload.value)

        if (result == null) {
          return jsonResponse({ error: 'Softphone session not initialized.' }, { status: 401 })
        }

        return jsonResponse(result.payload)
      },
    },
  },
})
