import { create } from "zustand"
import { persist } from "zustand/middleware"
import { toast } from "sonner"
import type { AnalyticsData } from "@/lib/type"

interface AnalyticsState {
  analytics: AnalyticsData | null
  isLoading: boolean
  error: string | null
}

interface AnalyticsActions {
  fetchAnalytics: () => Promise<void>
  clearAnalytics: () => void
  calculateAnalyticsFromSnapshots: (snapshots: any[]) => void
}

type AnalyticsStore = AnalyticsState & AnalyticsActions

export const useAnalyticsStore = create<AnalyticsStore>()(
  persist(
    (set, get) => ({
      analytics: null,
      isLoading: false,
      error: null,

      fetchAnalytics: async () => {
        set({ isLoading: true, error: null })
        try {
          let url = "/api/analytics"
          const response = await fetch(url)
          if (!response.ok) throw new Error("Failed to fetch analytics")
          const analytics = await response.json()
          set({ analytics, isLoading: false, error: null })
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to fetch analytics"
          set({ error: message, isLoading: false })
          toast.error(`Failed to fetch analytics: ${message}`)
        }
      },

      clearAnalytics: () => {
        set({ analytics: null, error: null })
      },

      // NEW: Calculate analytics from local snapshots for instant UI update
      calculateAnalyticsFromSnapshots: (snapshots: import("@/lib/type").RankingSnapshot[]) => {
        if (!snapshots || snapshots.length === 0) {
          set({ analytics: {
            rankingStability: 0,
            volatilityIndex: 0,
            domainDiversity: 0,
            avgResponseTime: 0,
            newContentDiscovery: 0,
            querySuccessRate: 0,
          } })
          return
        }
        const snapshotsByQuery: Record<string, import("@/lib/type").RankingSnapshot[]> = {};
        const seenUrls = new Set<string>();
        let totalResponseTime = 0;
        let successCount = 0;
        const domainSet = new Set<string>();
        for (const snap of snapshots) {
          if (!snap.queryId) continue;
          if (!snap.results || !Array.isArray(snap.results)) continue;
          if (!snap.metadata || typeof snap.metadata.responseTime !== "number") continue;
          if (!snapshotsByQuery[snap.queryId]) snapshotsByQuery[snap.queryId] = [];
          snapshotsByQuery[snap.queryId].push(snap);
          totalResponseTime += snap.metadata.responseTime;
          if (snap.results.length > 0) successCount++;
          for (const result of snap.results) {
            try {
              const domain = new URL(result.url).hostname;
              domainSet.add(domain);
              seenUrls.add(result.url);
            } catch {}
          }
        }
        const avgResponseTime = totalResponseTime / snapshots.length;
        const querySuccessRate = (successCount / snapshots.length) * 100;
        let totalRankChanges = 0;
        let totalComparisons = 0;
        Object.values(snapshotsByQuery).forEach((snaps) => {
          (snaps as import("@/lib/type").RankingSnapshot[]).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
          for (let i = 1; i < snaps.length; i++) {
            const prev = snaps[i - 1].results?.map((r: any) => r.url) || [];
            const curr = snaps[i].results?.map((r: any) => r.url) || [];
            const maxLength = Math.max(prev.length, curr.length);
            for (let j = 0; j < maxLength; j++) {
              const prevUrl = prev[j] || null;
              const currUrl = curr[j] || null;
              if (prevUrl && currUrl) {
                if (prevUrl !== currUrl) totalRankChanges++;
              } else {
                totalRankChanges++;
              }
              totalComparisons++;
            }
          }
        });
        const stabilityScore = totalComparisons > 0 ? 100 - (totalRankChanges / totalComparisons) * 100 : 100;
        const volatilityIndex = totalComparisons > 0 ? (totalRankChanges / totalComparisons) * 10 : 0;
        const averageNewContentPerSnapshot = seenUrls.size / snapshots.length;
        set({ analytics: {
          rankingStability: parseFloat(stabilityScore.toFixed(2)),
          volatilityIndex: parseFloat(volatilityIndex.toFixed(2)),
          domainDiversity: domainSet.size,
          avgResponseTime: parseFloat(avgResponseTime.toFixed(2)),
          newContentDiscovery: parseFloat(averageNewContentPerSnapshot.toFixed(2)),
          querySuccessRate: parseFloat(querySuccessRate.toFixed(2)),
        } })
      },
    }),
    {
      name: 'analytics-storage',
      partialize: (state) => ({ analytics: state.analytics }),
    }
  )
)