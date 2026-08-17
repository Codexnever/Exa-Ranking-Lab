// app/store/use-snapshots-store.ts
import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import { toast } from "sonner"
import type { RankingSnapshot, RankingChange } from "@/types/type"

// ─── SSR-safe storage ─────────────────────────────────────────────────────────

const safeStorage = createJSONStorage(() => {
  if (typeof window === "undefined") {
    return { getItem: () => null, setItem: () => {}, removeItem: () => {} } as unknown as Storage
  }
  return {
    getItem: (key: string) => {
      try { return localStorage.getItem(key) } catch { return null }
    },
    setItem: (key: string, value: string) => {
      try {
        // Size guard — snapshots can be large
        const kb = new Blob([value]).size / 1024
        if (kb > 4500) {
          console.warn(`[SnapshotsStore] Skipping persist — too large (${kb.toFixed(0)}KB)`)
          return
        }
        localStorage.setItem(key, value)
      } catch (err) {
        console.warn("[SnapshotsStore] localStorage.setItem failed:", err)
      }
    },
    removeItem: (key: string) => {
      try { localStorage.removeItem(key) } catch { /* ignore */ }
    },
  } as Storage
})

// ─── Types ────────────────────────────────────────────────────────────────────

interface SnapshotsState {
  paginatedSnapshots: RankingSnapshot[]
  pagination: {
    currentPage:  number
    totalPages:   number
    totalItems:   number
    itemsPerPage: number
  }
  allSnapshots:       RankingSnapshot[]
  isLoadingPaginated: boolean
  isLoadingAnalytics: boolean
  isLoadingCompare:   boolean   // ✅ dedicated flag for compareSnapshots
  error:              string | null
  lastFetch:          number | null
  isHydrated:         boolean
  lastUserId:         string | null
}

interface SnapshotsActions {
  fetchPaginatedSnapshots: (page: number, limit: number, userId?: string, queryId?: string) => Promise<void>
  fetchAllSnapshots:       (userId?: string, queryId?: string) => Promise<void>
  fetchSnapshotsComplete:  (page: number, limit: number, userId?: string) => Promise<void>
  forceRefresh:            (userId: string) => Promise<void>
  setPage:                 (page: number, userId?: string) => void
  setItemsPerPage:         (limit: number, userId?: string) => void
  addSnapshot:             (snapshot: RankingSnapshot) => void
  setSnapshots:            (snapshots: RankingSnapshot[]) => void
  getSnapshot:             (id: string) => Promise<RankingSnapshot | undefined>
  compareSnapshots:        (snapshotIds: string[]) => Promise<RankingChange[]>
  clearSnapshots:          () => void
  setHydrated:             () => void
  checkAndRefreshIfEmpty:  (userId: string) => Promise<void>
}

type SnapshotsStore = SnapshotsState & SnapshotsActions

// ─── Store ────────────────────────────────────────────────────────────────────

export const useSnapshotsStore = create<SnapshotsStore>()(
  persist(
    (set, get) => ({
      // ── State ──────────────────────────────────────────────────────────────
      paginatedSnapshots: [],
      pagination: { currentPage: 1, totalPages: 0, totalItems: 0, itemsPerPage: 20 },
      allSnapshots:       [],
      isLoadingPaginated: false,
      isLoadingAnalytics: false,
      isLoadingCompare:   false,
      error:              null,
      lastFetch:          null,
      isHydrated:         false,
      lastUserId:         null,

      // ── Hydration ──────────────────────────────────────────────────────────

      setHydrated: () => set({ isHydrated: true }),

      checkAndRefreshIfEmpty: async (userId: string) => {
        const { allSnapshots, lastUserId, isHydrated } = get()
        if (!isHydrated || allSnapshots.length === 0 || lastUserId !== userId) {
          await get().forceRefresh(userId)
        }
      },

      // ── Force refresh ──────────────────────────────────────────────────────

      /**
       * Keeps existing data visible while refreshing (optimistic).
       * Only clears allSnapshots if the fetch succeeds.
       */
      forceRefresh: async (userId: string) => {
        console.log("[SnapshotsStore] Force refresh for user:", userId)
        set({ isLoadingAnalytics: true, error: null, lastUserId: userId })
        try {
          await get().fetchAllSnapshots(userId)
          set({ isHydrated: true })
          console.log("[SnapshotsStore] Force refresh complete")
        } catch (err) {
          const message = err instanceof Error ? err.message : "Failed to refresh data"
          console.error("[SnapshotsStore] Force refresh failed:", err)
          set({ error: message, isLoadingAnalytics: false })
          toast.error(message)
        }
      },

      // ── Paginated fetch ────────────────────────────────────────────────────

      fetchPaginatedSnapshots: async (page, limit, userId?, queryId?) => {
        set({ isLoadingPaginated: true, error: null })
        try {
          let url = `/api/snapshots/paginated?page=${page}&limit=${limit}`
          if (userId)  url += `&userId=${encodeURIComponent(userId)}`
          if (queryId) url += `&queryId=${encodeURIComponent(queryId)}`

          const res = await fetch(url, { credentials: "include" })
          if (!res.ok) throw new Error(`Paginated fetch failed: ${res.status}`)

          const result = await res.json()
          set({
            paginatedSnapshots: result.data ?? [],
            pagination: {
              currentPage:  result.pagination?.page       ?? page,
              totalPages:   result.pagination?.totalPages ?? 0,
              totalItems:   result.pagination?.total      ?? 0,
              itemsPerPage: result.pagination?.limit      ?? limit,
            },
            isLoadingPaginated: false,
            error: null,
          })
        } catch (err) {
          const message = err instanceof Error ? err.message : "Failed to fetch paginated snapshots"
          console.error("[SnapshotsStore] Paginated fetch error:", err)
          set({ error: message, isLoadingPaginated: false, paginatedSnapshots: [] })
          toast.error(message)
        }
      },

      // ── Analytics fetch ────────────────────────────────────────────────────

      fetchAllSnapshots: async (userId?, queryId?) => {
        set({ isLoadingAnalytics: true, error: null })
        //  Snapshot existing data for rollback on error
        const previous = get().allSnapshots
        try {
          let url = "/api/snapshots/analytics"
          const params: string[] = []
          if (userId)  params.push(`userId=${encodeURIComponent(userId)}`)
          if (queryId) params.push(`queryId=${encodeURIComponent(queryId)}`)
          if (params.length) url += `?${params.join("&")}`

          const res = await fetch(url, { credentials: "include" })
          if (!res.ok) throw new Error(`Analytics fetch failed: ${res.status}`)

          const raw = await res.json()
          const valid = Array.isArray(raw)
            ? raw.filter(s => s?.id && s?.timestamp)
            : []
          const sorted = valid.sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          )

          set({
            allSnapshots:       sorted,
            isLoadingAnalytics: false,
            error:              null,
            lastFetch:          Date.now(),
            lastUserId:         userId ?? null,
          })
          console.log(`[SnapshotsStore] Stored ${sorted.length} snapshots`)
        } catch (err) {
          const message = err instanceof Error ? err.message : "Failed to fetch analytics snapshots"
          console.error("[SnapshotsStore] Analytics fetch error:", err)
          // ✅ Restore previous data on error — don't leave the store empty
          set({ error: message, isLoadingAnalytics: false, allSnapshots: previous })
          toast.error(message)
        }
      },

      // ── Combined fetch ─────────────────────────────────────────────────────

      fetchSnapshotsComplete: async (page, limit, userId?) => {
        // allSettled — both run independently, errors handled inside each
        const results = await Promise.allSettled([
          get().fetchPaginatedSnapshots(page, limit, userId),
          get().fetchAllSnapshots(userId),
        ])
        // Surface any unhandled rejection (shouldn't happen, but guard anyway)
        for (const r of results) {
          if (r.status === "rejected") {
            console.error("[SnapshotsStore] fetchSnapshotsComplete partial failure:", r.reason)
          }
        }
      },

      // ── Pagination controls ────────────────────────────────────────────────

      // ✅ userId passed as parameter — no more localStorage.getItem('currentUserId')
      setPage: (page: number, userId?: string) => {
        const { pagination } = get()
        if (page !== pagination.currentPage && page >= 1 && page <= pagination.totalPages) {
          get().fetchPaginatedSnapshots(page, pagination.itemsPerPage, userId)
        }
      },

      setItemsPerPage: (limit: number, userId?: string) => {
        const { pagination } = get()
        if (limit !== pagination.itemsPerPage) {
          get().fetchPaginatedSnapshots(1, limit, userId)
        }
      },

      // ── Legacy helpers ─────────────────────────────────────────────────────

      addSnapshot: (snapshot: RankingSnapshot) => {
        const { allSnapshots } = get()
        if (allSnapshots.find(s => s.id === snapshot.id)) return
        const updated = [snapshot, ...allSnapshots].sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        )
        set({ allSnapshots: updated })
      },

      setSnapshots: (snapshots: RankingSnapshot[]) => {
        const sorted = [...snapshots].sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        )
        set({ allSnapshots: sorted })
      },

      getSnapshot: async (id: string) => {
        const { paginatedSnapshots, allSnapshots } = get()
        return paginatedSnapshots.find(s => s.id === id) ?? allSnapshots.find(s => s.id === id)
      },

      // ✅ Uses dedicated isLoadingCompare flag
      compareSnapshots: async (snapshotIds: string[]) => {
        set({ isLoadingCompare: true, error: null })
        try {
          const res = await fetch("/api/snapshots/compare", {
            method:      "POST",
            headers:     { "Content-Type": "application/json" },
            credentials: "include",
            body:        JSON.stringify({ snapshotIds }),
          })
          if (!res.ok) throw new Error("Failed to compare snapshots")
          const changes = await res.json()
          set({ isLoadingCompare: false, error: null })
          return changes
        } catch (err) {
          const message = err instanceof Error ? err.message : "Failed to compare snapshots"
          set({ error: message, isLoadingCompare: false })
          toast.error(message)
          throw err
        }
      },

      clearSnapshots: () =>
        set({
          paginatedSnapshots: [],
          allSnapshots:       [],
          pagination:         { currentPage: 1, totalPages: 0, totalItems: 0, itemsPerPage: 20 },
          error:              null,
          lastFetch:          null,
          lastUserId:         null,
        }),
    }),

    {
      name:    "snapshots-storage",
      storage: safeStorage,

      // ✅ Persist ONLY lightweight metadata — not the full snapshot array
      // Full data is always fetched fresh; we only need to know who last used the store
      partialize: (state) => ({
        pagination: {
          currentPage:  1,
          totalPages:   0,
          totalItems:   0,
          itemsPerPage: state.pagination.itemsPerPage,
        },
        lastFetch:  state.lastFetch,
        lastUserId: state.lastUserId,
        // Persist a capped subset for instant UI render before fresh fetch
        allSnapshots: state.allSnapshots.slice(0, 50),
      }),

      onRehydrateStorage: () => (state) => {
        console.log("[SnapshotsStore] Rehydrated:", {
          snapshots: state?.allSnapshots?.length ?? 0,
          lastUserId: state?.lastUserId,
        })
        // ✅ Guard — setHydrated may not exist on malformed persisted state
        if (state && typeof state.setHydrated === "function") {
          state.setHydrated()
        }
      },
    }
  )
)
