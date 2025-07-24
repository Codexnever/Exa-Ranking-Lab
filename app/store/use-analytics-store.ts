// hooks/use-analytics-store.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { toast } from "sonner";
import type { AnalyticsData, RankingSnapshot } from "@/lib/type";
import { AnalyticsService } from "@/app/services/analytics-service";

interface AnalyticsState {
  analytics: AnalyticsData | null;
  isLoading: boolean;
  error: string | null;
  lastCalculationHash: string; // Add to prevent unnecessary recalculations
}

interface AnalyticsActions {
  fetchAnalytics: (userId?: string, forceRefetch?: boolean) => Promise<void>;
  clearAnalytics: () => void;
  calculateAnalyticsFromSnapshots: (snapshots: RankingSnapshot[]) => void;
  refetchOnFocus: () => void;
}

type AnalyticsStore = AnalyticsState & AnalyticsActions;

const analyticsService = new AnalyticsService(false);

export const useAnalyticsStore = create<AnalyticsStore>()(
  persist(
    (set, get) => ({
      analytics: null,
      isLoading: false,
      error: null,
      lastCalculationHash: "",

      fetchAnalytics: async (userId?: string, forceRefetch = false) => {
        if (get().analytics && !forceRefetch) return;
        set({ isLoading: true, error: null });
        try {
          const url = userId ? `/api/analytics?userId=${userId}` : "/api/analytics";
          const response = await fetch(url);
          if (!response.ok) throw new Error("Failed to fetch analytics");
          const analytics = await response.json();
          set({ analytics, isLoading: false, error: null });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to fetch analytics";
          set({ error: message, isLoading: false });
          toast.error(`Failed to fetch analytics: ${message}`);
          
          const localSnapshots: RankingSnapshot[] = JSON.parse(localStorage.getItem('snapshots') || '[]');
          get().calculateAnalyticsFromSnapshots(localSnapshots);
        }
      },

      clearAnalytics: () => {
        set({ analytics: null, error: null, lastCalculationHash: "" });
      },

      calculateAnalyticsFromSnapshots: (snapshots: RankingSnapshot[]) => {
        try {
          // Create a hash of snapshot IDs to prevent unnecessary recalculations
          const snapshotHash = snapshots.map(s => s.id).sort().join(',');
          const currentHash = get().lastCalculationHash;
          
          // Only recalculate if snapshots actually changed
          if (snapshotHash === currentHash && snapshots.length > 0) {
            return; // Skip calculation if data hasn't changed
          }

          const analytics = analyticsService.calculateAnalyticsFromSnapshots(snapshots);
          set({ 
            analytics, 
            lastCalculationHash: snapshotHash 
          });
          
          // Remove the excessive logging
          // console.log("[AnalyticsStore] Recalculated analytics with deduplicated data:", analytics);
        } catch (error) {
          console.error("Local calculation failed:", error);
          set({ 
            analytics: {
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

      refetchOnFocus: () => {
        const handler = () => get().fetchAnalytics(undefined, true);
        window.addEventListener('focus', handler);
        return () => window.removeEventListener('focus', handler);
      },
    }),
    {
      name: 'analytics-storage',
      partialize: (state) => ({ 
        analytics: state.analytics,
        lastCalculationHash: state.lastCalculationHash 
      }),
    }
  )
);
