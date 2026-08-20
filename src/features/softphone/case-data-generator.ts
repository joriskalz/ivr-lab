import { generateScenarioCaseData } from '@/features/softphone/scenario'
import type { SoftphoneCaseDataPayload, SoftphoneScenarioConfig, SoftphoneScenarioSnapshotConfig } from '@/features/softphone/types'

export function generateSoftphoneCaseDataPayload(config: SoftphoneScenarioConfig | SoftphoneScenarioSnapshotConfig): SoftphoneCaseDataPayload {
  return {
    values: generateScenarioCaseData(config as SoftphoneScenarioConfig),
  }
}
