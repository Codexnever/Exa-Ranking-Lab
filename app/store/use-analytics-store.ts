// hooks/use-analytics-store.ts - FIXED VERSION
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AnalyticsData, RankingSnapshot, QueryConfig } from "@/lib/type";
import { AppwriteAnalyticsService } from "@/app/services/AppwriteAnalyticsService";
import { WeaviateAnalyticsService } from "@/app/services/weaviate-analytics-service";
import { WeaviateService } from "@/app/services/weaviate-service";

interface AnalyticsState {
  analytics: AnalyticsData | null;
  isLoading: boolean;
  error: string | null;
  lastCalculationHash: string;
  dataSource: 'appwrite' | 'weaviate';
  
  // Service instances
  appwriteService: AppwriteAnalyticsService;
  weaviateService: WeaviateAnalyticsService;
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

// Initialize services
const weaviateServiceInstance = new WeaviateService();
const appwriteService = new AppwriteAnalyticsService(false);
const weaviateService = new WeaviateAnalyticsService(false, weaviateServiceInstance);

export const useAnalyticsStore = create<AnalyticsStore>()(
  persist(
    (set, get) => ({
      analytics: null,
      isLoading: false,
      error: null,
      lastCalculationHash: "",
      dataSource: 'appwrite',
      
      // Service instances
      appwriteService,
      weaviateService,

      setDataSource: (source: 'appwrite' | 'weaviate') => {
        set({ dataSource: source });
        // Clear analytics when switching to trigger fresh fetch
        if (source !== get().dataSource) {
          set({ analytics: null, lastCalculationHash: "" });
        }
      },

      fetchAnalytics: async (userId?: string, timeRangeMs?: number, queries: QueryConfig[] = [], forceRefetch = false) => {
        const { analytics, dataSource } = get();
        
        if (analytics && !forceRefetch) return;
        
        set({ isLoading: true, error: null });
        
        try {
          let analyticsData: AnalyticsData;

          if (dataSource === 'weaviate') {
            // Use Weaviate analytics service
            analyticsData = await get().getWeaviateAnalytics(userId || '', timeRangeMs, queries);
          } else {
            // Use Appwrite analytics service
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
          
          // ✅ FIXED: Proper client-side check and error handling
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

      getWeaviateAnalytics: async (userId: string, timeRangeMs: number = 30 * 24 * 60 * 60 * 1000, queries: QueryConfig[] = []) => {
        const { weaviateService } = get();
        return await weaviateService.getSemanticAnalyticsMerged(userId, timeRangeMs, queries);
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
          const analytics = appwriteService.calculateAnalyticsFromSnapshots(snapshots, queries);
          
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
      partialize: (state) => ({ 
        analytics: state.analytics,
        lastCalculationHash: state.lastCalculationHash,
        dataSource: state.dataSource
      }),
    }
  )
);
