// app/store/useSettingsStore.ts
import { create } from "zustand"

interface SettingsState {
  apiKey: string
  apiStatus: "connected" | "disconnected" | "unknown"
  lastTested: string | null
  setSettings: (data: Partial<SettingsState>) => void
  initialized: boolean
  setInitialized: (val: boolean) => void
}

export const useSettingsStore = create<SettingsState>((set) => ({
  apiKey: "",
  apiStatus: "unknown",
  lastTested: null,
  initialized: false,
  setInitialized: (val) => set({ initialized: val }),
  setSettings: (data) => set((state) => ({ ...state, ...data })),
}))
