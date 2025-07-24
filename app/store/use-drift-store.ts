// hooks/use-drift-store.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DriftAnalysisResult } from "@/lib/type";

interface DriftStoreState {
  driftResults: DriftAnalysisResult[];
  lastUpdated: number | null;
  isLoading: boolean;
  error: string | null;
  cacheExpiry: number; // Add cache expiry time
}

interface DriftStoreActions {
  setDriftResults: (results: DriftAnalysisResult[]) => void;
  clearDriftResults: () => void;
  fetchDriftResults: (userId?: string, forceRefresh?: boolean) => Promise<void>;
  isCacheValid: () => boolean; // Add cache validation
}

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

const initialState: DriftStoreState = {
  driftResults: [],
  lastUpdated: null,
  isLoading: false,
  error: null,
  cacheExpiry: CACHE_DURATION,
};

export const useDriftStore = create<DriftStoreState & DriftStoreActions>()(
  persist(
    (set, get) => ({
      ...initialState,
      
      setDriftResults: (results) => 
        set({ 
          driftResults: results, 
          lastUpdated: Date.now(),
          error: null 
        }),
      
      clearDriftResults: () => 
        set({ 
          driftResults: [], 
          lastUpdated: null,
          error: null 
        }),
      
      isCacheValid: () => {
        const { lastUpdated, cacheExpiry } = get();
        if (!lastUpdated) return false;
        return Date.now() - lastUpdated < cacheExpiry;
      },
      
      fetchDriftResults: async (userId?: string, forceRefresh = false) => {
        const { isCacheValid, driftResults } = get();
        
        // If cache is valid and we have data, don't fetch unless forced
        if (!forceRefresh && isCacheValid() && driftResults.length > 0) {
          console.log('Using cached drift results');
          return;
        }
        
        set({ isLoading: true, error: null });
        
        try {
          const url = userId ? `/api/drift?userId=${userId}` : "/api/drift";
          const response = await fetch(url);
          
          if (!response.ok) {
            throw new Error(`Failed to fetch drift results: ${response.statusText}`);
          }
          
          const results = await response.json();
          
          set({ 
            driftResults: results, 
            lastUpdated: Date.now(), 
            isLoading: false,
            error: null
          });
          
          console.log('Fetched fresh drift results:', results.length);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to fetch drift";
          console.error('Drift fetch error:', error);
          set({ error: message, isLoading: false });
        }
      },
    }),
    {
      name: "drift-store",
      // Only persist the data, not loading states
      partialize: (state) => ({
        driftResults: state.driftResults,
        lastUpdated: state.lastUpdated,
        cacheExpiry: state.cacheExpiry,
      }),
    }
  )
);
