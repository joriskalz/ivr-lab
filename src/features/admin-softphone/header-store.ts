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
  setAutosave: (autosave: AdminHeaderAutosaveState) => void
}

const emptyAutosaveState: AdminHeaderAutosaveState = {
  isSaving: false,
  label: null,
  tone: 'default',
}

export const useAdminHeaderStore = create<AdminHeaderStore>((set) => ({
  autosave: emptyAutosaveState,
  clearAutosave: () => set({ autosave: emptyAutosaveState }),
  setAutosave: (autosave) => set({ autosave }),
}))
