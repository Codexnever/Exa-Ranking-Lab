// app/store/use-analytics-store.ts 
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AnalyticsData, RankingSnapshot, QueryConfig } from "@/lib/type";
import { AppwriteAnalyticsService } from "@/app/services/AppwriteAnalyticsService";

interface AnalyticsState {
  analytics: AnalyticsData | null;
  isLoading: boolean;
  error: string | null;
  lastCalculationHash: string;
  dataSource: 'appwrite' | 'weaviate';
  
  // Only client-safe service
  appwriteService: AppwriteAnalyticsService;
}

interface AnalyticsActions {
  fetchAnalytics: (userId?: string, timeRangeMs?: number, queries?: QueryConfig[], forceRefetch?: boolean) => Promise<void>;
  clearAnalytics: () => void;
  calculateAnalyticsFromSnapshots: (snapshots: RankingSnapshot[], queries?: QueryConfig[]) => void;
  setDataSource: (source: 'appwrite' | 'weaviate') => void;
  
  // Dual-source methods
  getAppwriteAnalytics: (userId: string, timeRangeMs?: number, queries?: QueryConfig[]) => Promise<AnalyticsData>;
  getWeaviateAnalytics: (userId: string, timeRangeMs?: number, queries?: QueryConfig[]) => Promise<any>;
}

type AnalyticsStore = AnalyticsState & AnalyticsActions;

// Only initialize client-safe services
const appwriteService = new AppwriteAnalyticsService(false);

// ✅ SSR-SAFE STORAGE IMPLEMENTATION
const createStorage = () => {
  // Check if we're in browser environment
  if (typeof window === 'undefined') {
    // Server-side: return mock storage that doesn't do anything
    return {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {}
    };
  }
  
  // Client-side: return safe localStorage wrapper
  return {
    getItem: (key: string) => {
      try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : null;
      } catch (error) {
        console.error('[Analytics] Failed to read from localStorage:', error);
        return null;
      }
    },
    setItem: (key: string, value: any) => {
      try {
        const serialized = JSON.stringify(value);
        
        // Check size limit (localStorage ~5MB limit)
        const sizeInBytes = new Blob([serialized]).size;
        const sizeInMB = sizeInBytes / (1024 * 1024);
        
        if (sizeInMB > 4.5) {
          console.warn(`[Analytics] Data too large for localStorage (${sizeInMB.toFixed(2)}MB), using minimal storage`);
          
          // Store only essential data
          const minimalValue = {
            dataSource: value.dataSource || 'appwrite',
            lastCalculationHash: value.lastCalculationHash || '',
          };
          localStorage.setItem(key, JSON.stringify(minimalValue));
          return;
        }
        
        localStorage.setItem(key, serialized);
      } catch (error) {
        console.error('[Analytics] LocalStorage error:', error);
        
        // Try to clear space and store minimal data
        try {
          localStorage.removeItem(key);
          localStorage.removeItem('snapshots');
          localStorage.removeItem('queries');
          
          const minimalValue = {
            dataSource: value.dataSource || 'appwrite'
          };
          localStorage.setItem(key, JSON.stringify(minimalValue));
        } catch (retryError) {
          console.error('[Analytics] Failed to recover localStorage:', retryError);
        }
      }
    },
    removeItem: (key: string) => {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem(key);
        }
      } catch (error) {
        console.error('[Analytics] Failed to remove from localStorage:', error);
      }
    }
  };
};

export const useAnalyticsStore = create<AnalyticsStore>()(
  persist(
    (set, get) => ({
      analytics: null,
      isLoading: false,
      error: null,
      lastCalculationHash: "",
      dataSource: 'appwrite',
      
      appwriteService,

      setDataSource: (source: 'appwrite' | 'weaviate') => {
        console.log(`[Analytics] Switching data source to: ${source}`);
        set({ dataSource: source });
        
        // Clear analytics when switching to trigger fresh fetch
        if (source !== get().dataSource) {
          set({ analytics: null, lastCalculationHash: "" });
        }
      },

      fetchAnalytics: async (userId?: string, timeRangeMs?: number, queries: QueryConfig[] = [], forceRefresh = false) => {
        const { analytics, dataSource } = get();
        
        if (analytics && !forceRefresh) return;
        
        set({ isLoading: true, error: null });
        
        try {
          let analyticsData: AnalyticsData;

          if (dataSource === 'weaviate') {
            // Use API proxy for Weaviate
            analyticsData = await get().getWeaviateAnalytics(userId || '', timeRangeMs, queries);
          } else {
            // Use Appwrite analytics service (client-safe)
            if (userId && timeRangeMs) {
              analyticsData = await get().getAppwriteAnalytics(userId, timeRangeMs, queries);
            } else {
              // Fallback to API for backward compatibility
              const url = userId ? `/api/analytics?userId=${userId}` : "/api/analytics";
              const response = await fetch(url);
              if (!response.ok) throw new Error("Failed to fetch analytics");
              analyticsData = await response.json();
            }
          }

          set({ 
            analytics: analyticsData, 
            isLoading: false, 
            error: null 
          });

        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to fetch analytics";
          set({ error: message, isLoading: false });
          
          // Client-side error handling
          if (typeof window !== 'undefined') {
            // Dynamic import for client-side only
            import('sonner').then(({ toast }) => {
              toast.error(`Failed to fetch analytics: ${message}`);
            }).catch(console.error);
            
            // Fallback to local calculation
            try {
              const localSnapshots: RankingSnapshot[] = JSON.parse(localStorage.getItem('snapshots') || '[]');
              get().calculateAnalyticsFromSnapshots(localSnapshots, queries);
            } catch (localError) {
              console.error('Failed to load local snapshots:', localError);
            }
          }
        }
      },

      getAppwriteAnalytics: async (userId: string, timeRangeMs: number = 30 * 24 * 60 * 60 * 1000, queries: QueryConfig[] = []) => {
        const { appwriteService } = get();
        return await appwriteService.getAnalytics(userId, timeRangeMs, queries);
      },

      // ✅ FIXED: Correct API endpoint
      getWeaviateAnalytics: async (
        userId: string,
        timeRangeMs: number = 30 * 24 * 60 * 60 * 1000,
        queries: QueryConfig[] = []
      ) => {
        try {
          console.log(`[Store] Fetching Weaviate analytics via API proxy for user: ${userId}`);

          // ✅ CORRECT API ENDPOINT
          const response = await fetch('/api/weaviate', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              userId,
              timeRangeMs,
              queries
            })
          });

          const result = await response.json();

          if (!response.ok) {
            throw new Error(result.error || `HTTP error! status: ${response.status}`);
          }

          if (!result.success || !result.data) {
            throw new Error(result.error || 'No data received from Weaviate API');
          }

          console.log(`[Store] Successfully fetched Weaviate analytics for user: ${userId}`);
          return result.data;

        } catch (error) {
          console.error('[Store] Weaviate analytics fetch failed:', error);
          throw error;
        }
      },

      clearAnalytics: () => {
        set({ analytics: null, error: null, lastCalculationHash: "" });
      },

      calculateAnalyticsFromSnapshots: (snapshots: RankingSnapshot[], queries: QueryConfig[] = []) => {
        try {
          const snapshotHash = snapshots.map(s => s.id).sort().join(',');
          const currentHash = get().lastCalculationHash;
          
          if (snapshotHash === currentHash && snapshots.length > 0) {
            return;
          }

          const { appwriteService } = get();
          const analytics = appwriteService.calculateAnalyticsFromSnapshots(snapshots);
          
          set({ 
            analytics, 
            lastCalculationHash: snapshotHash 
          });
          
        } catch (error) {
          console.error("Local calculation failed:", error);
          set({ 
            analytics: {
              timeRangeMs: 0,
              filteredSnapshots: [],
              rankingTrendData: [],
              categoryDistribution: [],
              successRateByHour: [],
              performanceData: [],
              topPerformingQueries: [],
              queryPerformanceStats: [],
              rankingStability: 0,
              volatilityIndex: 0,
              domainDiversity: 0,
              avgResponseTime: 0,
              newContentDiscovery: 0,
              querySuccessRate: 0,
              trendSlope: 0,
              predictedPosition: 0,
              isAnomaly: false,
            },
            lastCalculationHash: ""
          });
        }
      },
    }),
    {
      name: 'analytics-storage',
      
      // ✅ SSR-SAFE STORAGE
      storage: createStorage(),
      
      // ✅ OPTIMIZED: Only persist lightweight data
      partialize: (state) => {
        // Only persist essential, lightweight data
        const essentialData = {
          dataSource: state.dataSource,
          lastCalculationHash: state.lastCalculationHash,
          // Don't persist full analytics object to avoid quota issues
          analyticsSummary: state.analytics ? {
            rankingStability: state.analytics.rankingStability,
            volatilityIndex: state.analytics.volatilityIndex,
            domainDiversity: state.analytics.domainDiversity,
            timeRangeMs: state.analytics.timeRangeMs,
          } : null
        };
        
        return essentialData;
      },

      // ✅ HANDLE HYDRATION MISMATCH
      onRehydrateStorage: () => (state) => {
        if (state) {
          console.log('[Analytics] Store rehydrated successfully');
        }
      },
      
      // ✅ SKIP HYDRATION ON SERVER
      skipHydration: typeof window === 'undefined',
    }
  )
);

// ✅ EXPORT HOOK WITH SSR SAFETY
export const useAnalyticsStoreSSR = () => {
  // Only use the store on client-side to avoid hydration mismatches
  if (typeof window === 'undefined') {
    return {
      analytics: null,
      isLoading: false,
      error: null,
      dataSource: 'appwrite' as const,
      setDataSource: () => {},
      fetchAnalytics: async () => {},
      clearAnalytics: () => {},
      // ... other default methods
    };
  }
  
  return useAnalyticsStore();
};
