import { createFileRoute } from '@tanstack/react-router'
import { getSoftphoneCaseStateByCorrelationCode } from '@/features/softphone/server/case-store'
import { getSoftphoneServerConfig } from '@/features/softphone/server/config'
import { resolveSoftphoneExternalTargetSession } from '@/features/softphone/server/external-access'
import { jsonResponse } from '@/features/softphone/server/json'
import { buildSoftphonePublicCasePayload } from '@/features/softphone/server/public-case-payload'

getSoftphoneServerConfig()

export const Route = createFileRoute('/api/public/softphone/case/get')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const accessResult = resolveSoftphoneExternalTargetSession(request)

        if (!accessResult.ok) {
          return jsonResponse({ error: accessResult.error }, { status: accessResult.status })
        }

        return jsonResponse(
          buildSoftphonePublicCasePayload(
            getSoftphoneCaseStateByCorrelationCode(accessResult.correlationCode)?.caseData ?? null,
          ),
        )
      },
    },
  },
})
