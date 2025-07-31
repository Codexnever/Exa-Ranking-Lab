// hooks/use-drift-store.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DriftAnalysisResult } from "@/lib/type";

interface DriftStoreState {
  driftResults: DriftAnalysisResult[];
  lastUpdated: number | null;
  isLoading: boolean;
  error: string | null;
  cacheExpiry: number;
}

interface DriftStoreActions {
  setDriftResults: (results: DriftAnalysisResult[]) => void;
  clearDriftResults: () => void;
  fetchDriftResults: (userId?: string, forceRefresh?: boolean) => Promise<void>;
  isCacheValid: () => boolean;
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
      
      setDriftResults: (results) => {
        // ✅ FIXED: Ensure we always set an array
        const safeResults = Array.isArray(results) ? results : [];
        set({ 
          driftResults: safeResults, 
          lastUpdated: Date.now(),
          error: null 
        });
      },
      
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
          const response = await fetch(url, {
            credentials: 'include', // ✅ ADDED: Include credentials for auth
          });
          
          if (!response.ok) {
            throw new Error(`Failed to fetch drift results: ${response.statusText}`);
          }
          
          const data = await response.json();
          
          // ✅ FIXED: Extract the results array from API response
          let driftResults: DriftAnalysisResult[];
          
          if (Array.isArray(data)) {
            // Direct array response
            driftResults = data;
          } else if (data && Array.isArray(data.results)) {
            // Wrapped in results object (based on your API)
            driftResults = data.results;
          } else if (data && typeof data === 'object') {
            // Single result object (for single query endpoint)
            driftResults = [data];
          } else {
            // Fallback to empty array
            driftResults = [];
          }
          
          // ✅ FIXED: Set the extracted results array
          set({ 
            driftResults: driftResults, 
            lastUpdated: Date.now(), 
            isLoading: false,
            error: null
          });
          
          console.log(`Fetched fresh drift results: ${driftResults.length} items`);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to fetch drift";
          console.error('Drift fetch error:', error);
          
          // ✅ FIXED: Set empty array on error to prevent filter errors
          set({ 
            driftResults: [], // Always ensure array
            error: message, 
            isLoading: false 
          });
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
      
      // ✅ ADDED: Migration for existing data
      migrate: (persistedState: any, version: number) => {
        // Ensure driftResults is always an array
        if (persistedState && !Array.isArray(persistedState.driftResults)) {
          persistedState.driftResults = [];
        }
        return persistedState;
      },
      
      version: 1, // ✅ ADDED: Version for migration
    }
  )
);
