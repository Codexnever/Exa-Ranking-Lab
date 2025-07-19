// hooks/use-drift-store.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DriftAnalysisResult } from "@/lib/type";

interface DriftStoreState {
  driftResults: DriftAnalysisResult[];
  lastUpdated: number | null;
  isLoading: boolean; // Added for fetch handling
  error: string | null; // Added
}

interface DriftStoreActions {
  setDriftResults: (results: DriftAnalysisResult[]) => void;
  clearDriftResults: () => void;
  fetchDriftResults: (userId?: string) => Promise<void>; // New: For refetching
}

const initialState: DriftStoreState = {
  driftResults: [],
  lastUpdated: null,
  isLoading: false,
  error: null,
};

export const useDriftStore = create<DriftStoreState & DriftStoreActions>()(
  persist(
    (set) => ({
      ...initialState,
      setDriftResults: (results) => set({ driftResults: results, lastUpdated: Date.now() }),
      clearDriftResults: () => set({ driftResults: [], lastUpdated: null }),
      fetchDriftResults: async (userId?: string) => {
        set({ isLoading: true, error: null });
        try {
          const url = userId ? `/api/drift?userId=${userId}` : "/api/drift"; // Assume your drift API
          const response = await fetch(url);
          if (!response.ok) throw new Error("Failed to fetch drift results");
          const results = await response.json();
          set({ driftResults: results, lastUpdated: Date.now(), isLoading: false });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to fetch drift";
          set({ error: message, isLoading: false });
        }
      },
    }),
    {
      name: "drift-store",
    }
  )
);
