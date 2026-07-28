// hooks/use-drift-store.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DriftAnalysisResult } from "@/types/type";

// ✅ Enhanced interface to support new drift analyzer metrics
interface EnhancedDriftAnalysisResult extends DriftAnalysisResult {
  totalContentChanges: number;
  averageCacheHitRate: number;  
  totalProcessingTime: number;
}

interface DriftStoreState {
  driftResults: EnhancedDriftAnalysisResult[];
  lastUpdated: number | null;
  isLoading: boolean;
  error: string | null;
  cacheExpiry: number;
  // ✅ New performance metrics
  performanceMetrics: {
    totalProcessingTime: number;
    averageCacheHitRate: number;
    totalContentChanges: number;
    lastCalculated: number | null;
  };
}

interface DriftStoreActions {
  setDriftResults: (results: EnhancedDriftAnalysisResult[]) => void;
  clearDriftResults: () => void;
  fetchDriftResults: (userId?: string, forceRefresh?: boolean) => Promise<void>;
  isCacheValid: () => boolean;
  // ✅ New performance tracking
  updatePerformanceMetrics: (results: EnhancedDriftAnalysisResult[]) => void;
  getPerformanceMetrics: () => any;
}

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

const initialState: DriftStoreState = {
  driftResults: [],
  lastUpdated: null,
  isLoading: false,
  error: null,
  cacheExpiry: CACHE_DURATION,
  performanceMetrics: {
    totalProcessingTime: 0,
    averageCacheHitRate: 0,
    totalContentChanges: 0,
    lastCalculated: null,
  },
};

export const useDriftStore = create<DriftStoreState & DriftStoreActions>()(
  persist(
    (set, get) => ({
      ...initialState,
      
      setDriftResults: (results) => {
        const safeResults = Array.isArray(results) ? results : [];
        
        // ✅ Update performance metrics when setting results
        get().updatePerformanceMetrics(safeResults);
        
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
          error: null,
          performanceMetrics: {
            totalProcessingTime: 0,
            averageCacheHitRate: 0,
            totalContentChanges: 0,
            lastCalculated: null,
          }
        }),
      
      isCacheValid: () => {
        const { lastUpdated, cacheExpiry } = get();
        if (!lastUpdated) return false;
        return Date.now() - lastUpdated < cacheExpiry;
      },

      // ✅ Enhanced performance metrics calculation
      updatePerformanceMetrics: (results) => {
        if (!results.length) return;

        const totalProcessingTime = results.reduce((sum, r) => sum + (r.totalProcessingTime || 0), 0);
        const averageCacheHitRate = results.reduce((sum, r) => sum + (r.averageCacheHitRate || 0), 0) / results.length;
        const totalContentChanges = results.reduce((sum, r) => sum + (r.totalContentChanges || 0), 0);

        set({
          performanceMetrics: {
            totalProcessingTime,
            averageCacheHitRate,
            totalContentChanges,
            lastCalculated: Date.now(),
          }
        });
      },

      getPerformanceMetrics: () => {
        return get().performanceMetrics;
      },
      
      fetchDriftResults: async (userId?: string, forceRefresh = false) => {
        const { isCacheValid, driftResults } = get();
        
        if (!forceRefresh && isCacheValid() && driftResults.length > 0) {
          console.log('Using cached drift results');
          return;
        }
        
        set({ isLoading: true, error: null });
        
        try {
          const url = userId ? `/api/drift?userId=${userId}` : "/api/drift";
          const response = await fetch(url, {
            credentials: 'include',
          });
          
          if (!response.ok) {
            throw new Error(`Failed to fetch drift results: ${response.statusText}`);
          }
          
          const data = await response.json();
          
          let driftResults: EnhancedDriftAnalysisResult[];
          
          if (Array.isArray(data)) {
            driftResults = data;
          } else if (data && Array.isArray(data.results)) {
            driftResults = data.results;
          } else if (data && typeof data === 'object') {
            driftResults = [data];
          } else {
            driftResults = [];
          }
          
          set({ 
            driftResults: driftResults, 
            lastUpdated: Date.now(), 
            isLoading: false,
            error: null
          });
          
          // ✅ Update performance metrics
          get().updatePerformanceMetrics(driftResults);
          
          console.log(`Fetched fresh drift results: ${driftResults.length} items`);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to fetch drift";
          console.error('Drift fetch error:', error);
          
          set({ 
            driftResults: [], 
            error: message, 
            isLoading: false 
          });
        }
      },
    }),
    {
      name: "drift-store",
      partialize: (state) => ({
        driftResults: state.driftResults,
        lastUpdated: state.lastUpdated,
        cacheExpiry: state.cacheExpiry,
        performanceMetrics: state.performanceMetrics, // ✅ Persist performance metrics
      }),
      
      migrate: (persistedState: any, version: number) => {
        if (persistedState && !Array.isArray(persistedState.driftResults)) {
          persistedState.driftResults = [];
        }
        // ✅ Ensure performance metrics exist
        if (persistedState && !persistedState.performanceMetrics) {
          persistedState.performanceMetrics = {
            totalProcessingTime: 0,
            averageCacheHitRate: 0,
            totalContentChanges: 0,
            lastCalculated: null,
          };
        }
        return persistedState;
      },
      
      version: 2, // ✅ Updated version for new fields
    }
  )
);
