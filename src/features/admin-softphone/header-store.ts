import { create } from 'zustand'

type AdminAutosaveTone = 'default' | 'error' | 'success'

type AdminHeaderAutosaveState = {
  isSaving: boolean
  label: string | null
  tone: AdminAutosaveTone
}

type AdminHeaderStore = {
  autosave: AdminHeaderAutosaveState
  clearAutosave: () => void
  sensitiveInformationVisible: boolean
  setAutosave: (autosave: AdminHeaderAutosaveState) => void
  toggleSensitiveInformation: () => void
}

const emptyAutosaveState: AdminHeaderAutosaveState = {
  isSaving: false,
  label: null,
  tone: 'default',
}

export const useAdminHeaderStore = create<AdminHeaderStore>((set) => ({
  autosave: emptyAutosaveState,
  clearAutosave: () => set({ autosave: emptyAutosaveState }),
  sensitiveInformationVisible: false,
  setAutosave: (autosave) => set({ autosave }),
  toggleSensitiveInformation: () => set((state) => ({
    sensitiveInformationVisible: !state.sensitiveInformationVisible,
  })),
}))
