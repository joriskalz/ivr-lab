import { createServerFn } from '@tanstack/react-start'
import { getSoftphoneTestScenarioById } from '@/features/admin-softphone/queries'
import { normalizeSoftphoneBrandColor } from '@/features/softphone/theme'
import type { SoftphoneScenarioAccessPreview } from '@/features/softphone/types'

function validateScenarioPreviewInput(input: { scenarioId?: string | null | undefined }) {
  return {
    scenarioId: typeof input?.scenarioId === 'string' ? input.scenarioId.trim().toUpperCase() : '',
  }
}

export const getSoftphoneScenarioPreviewServer = createServerFn({ method: 'GET' })
  .inputValidator(validateScenarioPreviewInput)
  .handler(async ({ data }): Promise<SoftphoneScenarioAccessPreview | null> => {
    const scenario = getSoftphoneTestScenarioById(data.scenarioId)

    if (scenario == null) {
      return null
    }

    return {
      brandColor: normalizeSoftphoneBrandColor(scenario.config.brandColor),
      id: scenario.id,
      name: scenario.name,
    }
  })
