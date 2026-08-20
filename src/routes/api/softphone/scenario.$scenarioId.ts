import { createFileRoute } from '@tanstack/react-router'
import { getSoftphoneTestScenarioById } from '@/features/admin-softphone/queries'
import { normalizeSoftphoneBrandColor } from '@/features/softphone/theme'
import { jsonResponse } from '@/features/softphone/server/json'

export const Route = createFileRoute('/api/softphone/scenario/$scenarioId')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const scenario = getSoftphoneTestScenarioById(params.scenarioId)

        if (scenario == null) {
          return jsonResponse({ error: 'Unknown softphone scenario.' }, { status: 404 })
        }

        return jsonResponse({
          brandColor: normalizeSoftphoneBrandColor(scenario.config.brandColor),
          id: scenario.id,
          name: scenario.name,
        })
      },
    },
  },
})
