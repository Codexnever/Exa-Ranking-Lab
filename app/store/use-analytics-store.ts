// app/store/use-analytics-store.ts
import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import { toast } from "sonner"                          // ✅ static import, not dynamic
import type { AnalyticsData, RankingSnapshot, QueryConfig } from "@/types/type"
import { AppwriteAnalyticsService } from "@/app/services/appwrite/analytics/AppwriteAnalyticsService"
import { analyticsCalculations } from "@/app/logic/analyticsLogic"

// ─── Types ────────────────────────────────────────────────────────────────────

interface AnalyticsState {
  analytics:            AnalyticsData | null
  isLoading:            boolean
  error:                string | null
  lastCalculationHash:  string
  dataSource:           "appwrite" | "weaviate"
}

interface AnalyticsActions {
  fetchAnalytics: (
    userId?:        string,
    timeRangeMs?:   number,
    queries?:       QueryConfig[],
    forceRefresh?:  boolean           // ✅ consistent param name
  ) => Promise<void>

  clearAnalytics:                  () => void
  setDataSource:                   (source: "appwrite" | "weaviate") => void

  calculateAnalyticsFromSnapshots: (
    snapshots: RankingSnapshot[],
    queries?:  QueryConfig[]
  ) => void

  // Internal helpers (not exposed on hook but needed by actions)
  _getAppwriteAnalytics: (userId: string, timeRangeMs?: number, queries?: QueryConfig[]) => Promise<AnalyticsData>
  _getWeaviateAnalytics: (userId: string, timeRangeMs?: number, queries?: QueryConfig[]) => Promise<AnalyticsData>
}

type AnalyticsStore = AnalyticsState & AnalyticsActions

// ─── Service singleton (module-level, not in store state) ─────────────────────
// Keeping service outside store state avoids serialization issues with persist.
const appwriteService = new AppwriteAnalyticsService(false)

// ─── Snapshot hash ────────────────────────────────────────────────────────────
// Include both id and timestamp for stable dedup — id alone may not be unique.
function makeSnapshotHash(snapshots: RankingSnapshot[]): string {
  return snapshots
    .map(s => `${s.id}:${s.timestamp}`)
    .sort()
    .join("|")
}

// ─── SSR-safe localStorage storage for zustand persist ───────────────────────
// createJSONStorage handles JSON serialization correctly.
// The lambda defers window access until runtime (not module eval time).
const storage = createJSONStorage(() => {
  if (typeof window === "undefined") {
    // Server: no-op storage — nothing persists, nothing throws
    return {
      getItem:    ()  => null,
      setItem:    ()  => {},
      removeItem: ()  => {},
    } as unknown as Storage
  }

  // Client: safe localStorage wrapper with size guard
  return {
    getItem: (key: string) => {
      try { return localStorage.getItem(key) }
      catch { return null }
    },
    setItem: (key: string, value: string) => {
      try {
        const sizeKB = new Blob([value]).size / 1024
        if (sizeKB > 4500) {
          console.warn(`[AnalyticsStore] Skipping persist — data too large (${sizeKB.toFixed(0)}KB)`)
          return
        }
        localStorage.setItem(key, value)
      } catch (err) {
        console.warn("[AnalyticsStore] localStorage.setItem failed:", err)
        // Attempt to clear stale keys and retry once
        try {
          localStorage.removeItem(key)
          localStorage.setItem(key, value)
        } catch { /* give up silently */ }
      }
    },
    removeItem: (key: string) => {
      try { localStorage.removeItem(key) }
      catch { /* ignore */ }
    },
  } as Storage
})

// ─── Store ────────────────────────────────────────────────────────────────────

export const useAnalyticsStore = create<AnalyticsStore>()(
  persist(
    (set, get) => ({
      // ── State ──────────────────────────────────────────────────────────────
      analytics:           null,
      isLoading:           false,
      error:               null,
      lastCalculationHash: "",
      dataSource:          "appwrite",

      // ── Actions ────────────────────────────────────────────────────────────

      setDataSource: (source) => {
        const current = get().dataSource
        if (source === current) return
        console.log(`[AnalyticsStore] Switching source: ${current} → ${source}`)
        set({ dataSource: source, analytics: null, lastCalculationHash: "" })
      },

      fetchAnalytics: async (
        userId?,
        timeRangeMs?,
        queries = [],
        forceRefresh = false
      ) => {
        const { analytics, dataSource } = get()

        // Skip if we already have data and no force refresh requested
        if (analytics && !forceRefresh) return

        if (!userId?.trim()) {
          console.error("[AnalyticsStore] fetchAnalytics: invalid userId", userId)
          set({ error: "Valid userId is required", isLoading: false })
          return
        }

        set({ isLoading: true, error: null })

        try {
          const data =
            dataSource === "weaviate"
              ? await get()._getWeaviateAnalytics(userId, timeRangeMs, queries)
              : await get()._getAppwriteAnalytics(userId, timeRangeMs, queries)

          set({ analytics: data, isLoading: false, error: null })
        } catch (err) {
          const message = err instanceof Error ? err.message : "Failed to fetch analytics"
          console.error("[AnalyticsStore] fetchAnalytics failed:", err)
          set({ error: message, isLoading: false })
          toast.error(`Analytics error: ${message}`)

          // Graceful fallback: recalculate from whatever snapshots are available
          try {
            const cached: RankingSnapshot[] = JSON.parse(
              localStorage.getItem("snapshots") ?? "[]"
            )
            if (cached.length > 0) {
              get().calculateAnalyticsFromSnapshots(cached, queries)
            }
          } catch { /* localStorage unavailable or malformed — ignore */ }
        }
      },

      // ✅ Uses analyticsLogic directly — no appwriteService dependency,
      //    queries param is actually used
      calculateAnalyticsFromSnapshots: (snapshots, queries = []) => {
        if (!Array.isArray(snapshots)) return

        // Skip if data hasn't changed
        const hash = makeSnapshotHash(snapshots)
        if (hash === get().lastCalculationHash && snapshots.length > 0) return

        try {
          const result = analyticsCalculations(queries, snapshots, "30d")
          set({
            analytics:           result as unknown as AnalyticsData,
            lastCalculationHash: hash,
          })
        } catch (err) {
          console.error("[AnalyticsStore] Local calculation failed:", err)
          set({
            error:               "Analytics calculation failed",
            lastCalculationHash: "",
          })
        }
      },

      clearAnalytics: () =>
        set({ analytics: null, error: null, lastCalculationHash: "" }),

      // ── Internal helpers ──────────────────────────────────────────────────

      _getAppwriteAnalytics: async (
        userId,
        timeRangeMs = 30 * 24 * 60 * 60 * 1000,
        queries = []
      ) => {
        return appwriteService.getAnalytics(userId, timeRangeMs, queries)
      },

      _getWeaviateAnalytics: async (
        userId,
        timeRangeMs = 30 * 24 * 60 * 60 * 1000,
        queries = []
      ) => {
        if (!userId?.trim()) {
          throw new Error("Valid userId is required for Weaviate analytics")
        }

        const response = await fetch("/api/weaviate", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ userId, timeRangeMs, queries }),
        })

        const result = await response.json()

        if (!response.ok || !result.success || !result.data) {
          throw new Error(result.error ?? `Weaviate API error: ${response.status}`)
        }

        return result.data
      },
    }),

    {
      name: "analytics-storage",
      storage,

      // ✅ Only persist lightweight metadata — never persist large data arrays
      partialize: (state): Partial<AnalyticsStore> => ({
        dataSource:          state.dataSource,
        lastCalculationHash: state.lastCalculationHash,
      }),

      onRehydrateStorage: () => (state) => {
        if (state) {
          console.log("[AnalyticsStore] Rehydrated from storage")
        }
      },
    }
  )
)