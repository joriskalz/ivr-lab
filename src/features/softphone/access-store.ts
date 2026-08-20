import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { normalizeSoftphoneBrandColor } from '@/features/softphone/theme'

const SOFTPHONE_SCENARIO_ACCESS_STORAGE_KEY = 'contoso-softphone-scenario-access'

interface SoftphoneScenarioAccessEntry {
  accessKey: string
  brandColor: string
  scenarioName: string
}

interface SoftphoneScenarioAccessStore {
  clearScenarioAccess: (scenarioId: string) => void
  entriesByScenarioId: Record<string, SoftphoneScenarioAccessEntry>
  hydrated: boolean
  markHydrated: () => void
  setScenarioAccess: (
    scenarioId: string,
    value: {
      accessKey: string
      brandColor: string
      scenarioName?: string | null
    },
  ) => void
}

function normalizeScenarioId(value: string) {
  return value.trim().toUpperCase()
}

export const useSoftphoneScenarioAccessStore = create<SoftphoneScenarioAccessStore>()(
  persist(
    (set) => ({
      clearScenarioAccess(scenarioId) {
        const normalizedScenarioId = normalizeScenarioId(scenarioId)

        set((currentValue) => {
          const nextEntriesByScenarioId = { ...currentValue.entriesByScenarioId }
          delete nextEntriesByScenarioId[normalizedScenarioId]

          return {
            entriesByScenarioId: nextEntriesByScenarioId,
          }
        })
      },
      entriesByScenarioId: {},
      hydrated: false,
      markHydrated() {
        set({ hydrated: true })
      },
      setScenarioAccess(scenarioId, value) {
        const normalizedScenarioId = normalizeScenarioId(scenarioId)
        const normalizedAccessKey = value.accessKey.replace(/\D/g, '').slice(0, 5)

        if (normalizedAccessKey.length !== 5) {
          return
        }

        set((currentValue) => ({
          entriesByScenarioId: {
            ...currentValue.entriesByScenarioId,
            [normalizedScenarioId]: {
              accessKey: normalizedAccessKey,
              brandColor: normalizeSoftphoneBrandColor(value.brandColor),
              scenarioName: value.scenarioName?.trim() || currentValue.entriesByScenarioId[normalizedScenarioId]?.scenarioName || normalizedScenarioId,
            },
          },
        }))
      },
    }),
    {
      name: SOFTPHONE_SCENARIO_ACCESS_STORAGE_KEY,
      onRehydrateStorage: () => (state) => {
        state?.markHydrated()
      },
      partialize: (state) => ({
        entriesByScenarioId: state.entriesByScenarioId,
      }),
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
