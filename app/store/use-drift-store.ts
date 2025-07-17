import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { DriftAnalysisResult } from "@/lib/type"

interface DriftStoreState {
  driftResults: DriftAnalysisResult[]
  lastUpdated: number | null
}

interface DriftStoreActions {
  setDriftResults: (results: DriftAnalysisResult[]) => void
  clearDriftResults: () => void
}

const initialState: DriftStoreState = {
  driftResults: [],
  lastUpdated: null,
}

export const useDriftStore = create<DriftStoreState & DriftStoreActions>()(
  persist(
    (set) => ({
      ...initialState,
      setDriftResults: (results) => set({ driftResults: results, lastUpdated: Date.now() }),
      clearDriftResults: () => set({ driftResults: [], lastUpdated: null }),
    }),
    {
      name: "drift-store",
    }
  )
)
