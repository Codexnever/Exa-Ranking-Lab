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
        set({ analytics: null, error: null });
      },

      calculateAnalyticsFromSnapshots: (snapshots: RankingSnapshot[]) => {
        try {
          const analytics = analyticsService.calculateAnalyticsFromSnapshots(snapshots);
          set({ analytics });
        } catch (error) {
          console.error("Local calculation failed:", error);
          set({ analytics: { 
            rankingStability: 0,
            volatilityIndex: 0,
            domainDiversity: 0,
            avgResponseTime: 0,
            newContentDiscovery: 0,
            querySuccessRate: 0,
          } });
        }
      },

      refetchOnFocus: () => {
        window.addEventListener('focus', () => get().fetchAnalytics(undefined, true));
        return () => window.removeEventListener('focus', () => {});
      },
    }),
    {
      name: 'analytics-storage',
      partialize: (state) => ({ analytics: state.analytics }),
    }
  )
);
