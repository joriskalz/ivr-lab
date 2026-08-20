import { createFileRoute } from '@tanstack/react-router'
import { getSoftphoneCaseState } from '@/features/softphone/server/case-store'
import { getSoftphoneServerConfig } from '@/features/softphone/server/config'
import { jsonResponse } from '@/features/softphone/server/json'

getSoftphoneServerConfig()

export const Route = createFileRoute('/api/softphone/case/ivr-recognized')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const result = getSoftphoneCaseState(request)

        if (result == null) {
          return jsonResponse({ error: 'Softphone session not initialized.' }, { status: 401 })
        }

        return jsonResponse(result.payload.recognizedData)
      },
    },
  },
})
