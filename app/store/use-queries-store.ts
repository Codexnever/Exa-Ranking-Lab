// app/store/use-queries-store.ts
import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import { toast } from "sonner"
import type { QueryConfig } from "@/types/type"

// ─── SSR-safe storage ─────────────────────────────────────────────────────────

const safeStorage = createJSONStorage(() => {
  if (typeof window === "undefined") {
    return { getItem: () => null, setItem: () => {}, removeItem: () => {} } as Storage
  }
  return {
    getItem: (key: string) => {
      try { return localStorage.getItem(key) } catch { return null }
    },
    setItem: (key: string, value: string) => {
      try {
        const kb = new Blob([value]).size / 1024
        if (kb > 4500) {
          console.warn(`[QueriesStore] Skipping persist — too large (${kb.toFixed(0)}KB)`)
          return
        }
        localStorage.setItem(key, value)
      } catch (err) {
        console.warn("[QueriesStore] localStorage.setItem failed:", err)
      }
    },
    removeItem: (key: string) => {
      try { localStorage.removeItem(key) } catch { /* ignore */ }
    },
  } as Storage
})

// ─── Cache TTL ────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000  // 5 minutes

// ─── Types ────────────────────────────────────────────────────────────────────

interface QueriesState {
  queries:       QueryConfig[]
  isLoading:     boolean
  error:         string | null
  lastFetch:     number | null
  currentUserId: string | null
}

interface QueriesActions {
  fetchQueries:        (userId?: string, forceRefresh?: boolean) => Promise<void>
  createQuery:         (query: Omit<QueryConfig, "id" | "createdAt">) => Promise<QueryConfig>
  runQuery:            (queryId: string) => Promise<any>
  updateQuery:         (queryId: string, query: Partial<QueryConfig>) => Promise<void>
  deleteQuery:         (queryId: string) => Promise<void>
  clearQueries:        () => void
  getScheduledQueries: (userId?: string) => Promise<QueryConfig[]>
  getDueQueries:       (userId?: string) => Promise<QueryConfig[]>
  batchRunQueries:     (queryIds: string[]) => Promise<any[]>
  getQueriesByCategory:(category: string) => QueryConfig[]
  getRecentQueries:    (limit?: number) => QueryConfig[]
  syncWithWeaviate:    (userId: string) => Promise<void>
}

type QueriesStoreType = QueriesState & QueriesActions

// ─── Store ────────────────────────────────────────────────────────────────────

export const useQueriesStore = create<QueriesStoreType>()(
  persist(
    (set, get) => ({
      // ── State ──────────────────────────────────────────────────────────────
      queries:       [],
      isLoading:     false,
      error:         null,
      lastFetch:     null,
      currentUserId: null,

      // ── Fetch ──────────────────────────────────────────────────────────────

      fetchQueries: async (userId?, forceRefresh = false) => {
        const { lastFetch, currentUserId, queries, isLoading } = get()
        const now = Date.now()
        const safe = Array.isArray(queries) ? queries : []

        // ✅ Cache check includes TTL — don't serve indefinitely stale data
        const isFresh  = lastFetch !== null && now - lastFetch < CACHE_TTL_MS
        const sameUser = userId === currentUserId
        if (!forceRefresh && safe.length > 0 && sameUser && isFresh) {
          console.log("[QueriesStore] Using cached queries (fresh)")
          return
        }

        if (isLoading) {
          console.log("[QueriesStore] Already loading, skipping")
          return
        }

        set({ isLoading: true, error: null })

        try {
          let url = "/api/queries"
          if (userId) url += `?userId=${encodeURIComponent(userId)}`

          const res = await fetch(url, {
            headers:     { "Content-Type": "application/json" },
            credentials: "include",
          })

          if (res.status === 401) {
            // ✅ Preserve existing queries on auth error — don't wipe cache
            set({ isLoading: false })
            throw new Error("Please log in to access your queries")
          }

          if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            throw new Error(err.details ?? "Failed to fetch queries")
          }

          const fetched = await res.json() as QueryConfig[]
          const sorted  = (Array.isArray(fetched) ? fetched : []).sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )

          set({
            queries:       sorted,
            isLoading:     false,
            error:         null,
            lastFetch:     now,
            currentUserId: userId ?? null,
          })
          console.log(`[QueriesStore] Fetched ${sorted.length} queries`)
        } catch (err) {
          const message = err instanceof Error ? err.message : "Failed to fetch queries"
          console.error("[QueriesStore] fetchQueries error:", err)
          // ✅ Preserve existing queries on transient error (network blip, 500)
          set({ error: message, isLoading: false })
          toast.error(message)
        }
      },

      // ── Create ─────────────────────────────────────────────────────────────

      createQuery: async (query) => {
        set({ isLoading: true, error: null })
        try {
          const res = await fetch("/api/queries", {
            method:      "POST",
            headers:     { "Content-Type": "application/json" },
            credentials: "include",
            body:        JSON.stringify(query),
          })

          if (res.status === 401) throw new Error("Session expired. Please log in again")
          if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            throw new Error(err.details ?? "Failed to create query")
          }

          const newQuery = await res.json() as QueryConfig
          // ✅ No explicit return type on setter — avoids type mismatch
          set(state => ({
            queries:   [newQuery, ...state.queries],
            isLoading: false,
            error:     null,
          }))
          toast.success(`Query "${newQuery.name}" created successfully`)
          return newQuery
        } catch (err) {
          const message = err instanceof Error ? err.message : "Failed to create query"
          set({ error: message, isLoading: false })
          toast.error(message)
          throw err
        }
      },

      // ── Run ────────────────────────────────────────────────────────────────

      runQuery: async (queryId) => {
        set({ isLoading: true, error: null })
        try {
          const local = get().queries.find(q => q.id === queryId)
          if (!local) throw new Error("Query not found")

          const res = await fetch(`/api/queries/${encodeURIComponent(queryId)}/run`, {
            method:      "POST",
            headers:     { "Content-Type": "application/json" },
            credentials: "include",
            // ✅ Send full query config — API needs it to execute the search
            body:        JSON.stringify(local),
          })

          if (res.status === 401) throw new Error("Please log in to run queries")

          if (res.status === 404) {
            set(state => ({
              queries:   state.queries.filter(q => q.id !== queryId),
              isLoading: false,
              error:     null,
            }))
            throw new Error("Query not found")
          }

          if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            throw new Error(err.details ?? "Failed to run query")
          }

          const result = await res.json()
          set(state => ({
            queries:   state.queries.map(q => q.id === queryId ? { ...q, lastRun: new Date() } : q),
            isLoading: false,
            error:     null,
          }))
          toast.success(`Query "${local.name}" executed successfully`)
          return result
        } catch (err) {
          const message = err instanceof Error ? err.message : "Failed to run query"
          set({ error: message, isLoading: false })
          toast.error(`Failed to run query: ${message}`)
          throw err
        }
      },

      // ── Update ─────────────────────────────────────────────────────────────

      updateQuery: async (queryId, query) => {
        set({ isLoading: true, error: null })
        try {
          const res = await fetch(`/api/queries/${queryId}`, {
            method:      "PATCH",
            headers:     { "Content-Type": "application/json" },
            credentials: "include",
            body:        JSON.stringify(query),
          })
          if (!res.ok) throw new Error("Failed to update query")
          const updated = await res.json()
          set(state => ({
            queries:   state.queries.map(q => q.id === queryId ? { ...q, ...updated } : q),
            isLoading: false,
            error:     null,
          }))
          toast.success("Query updated successfully")
        } catch (err) {
          const message = err instanceof Error ? err.message : "Failed to update query"
          set({ error: message, isLoading: false })
          toast.error(message)
          throw err
        }
      },

      // ── Delete ─────────────────────────────────────────────────────────────

      deleteQuery: async (queryId) => {
        set({ isLoading: true, error: null })
        try {
          const res = await fetch(`/api/queries/${queryId}`, {
            method:      "DELETE",
            headers:     { "Content-Type": "application/json" },
            credentials: "include",
          })
          if (res.status === 401) throw new Error("Unauthorized")
          if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            throw new Error(err.details ?? "Failed to delete query")
          }
          const deleted = get().queries.find(q => q.id === queryId)
          set(state => ({
            queries:   state.queries.filter(q => q.id !== queryId),
            isLoading: false,
            error:     null,
          }))
          toast.success(`Query "${deleted?.name}" deleted successfully`)
        } catch (err) {
          const message = err instanceof Error ? err.message : "Failed to delete query"
          set({ error: message, isLoading: false })
          toast.error(message)
          throw err
        }
      },

      clearQueries: () =>
        set({ queries: [], error: null, lastFetch: null, currentUserId: null }),

      // ── Scheduled / due queries ────────────────────────────────────────────

      getScheduledQueries: async (userId?) => {
        try {
          const { queries } = get()
          const safe = Array.isArray(queries) ? queries : []
          if (safe.length === 0) await get().fetchQueries(userId)
          return get().queries.filter(
            q => q.schedule?.enabled && (!userId || q.userId === userId)
          )
        } catch (err) {
          console.error("[QueriesStore] getScheduledQueries failed:", err)
          return []
        }
      },

      getDueQueries: async (userId?) => {
        try {
          const scheduled = await get().getScheduledQueries(userId)
          const now = Date.now()
          return scheduled.filter(q => {
            if (!q.lastRun) return true
            const diff = now - new Date(q.lastRun).getTime()
            switch (q.schedule?.frequency) {
              case "hourly":  return diff >= 60 * 60 * 1000
              case "daily":   return diff >= 24 * 60 * 60 * 1000
              case "weekly":  return diff >= 7 * 24 * 60 * 60 * 1000
              default:        return false
            }
          })
        } catch (err) {
          console.error("[QueriesStore] getDueQueries failed:", err)
          return []
        }
      },

      // ✅ Parallel execution with Promise.allSettled
      batchRunQueries: async (queryIds) => {
        const results = await Promise.allSettled(
          queryIds.map(id => get().runQuery(id))
        )
        return results.map((r, i) =>
          r.status === "fulfilled"
            ? { queryId: queryIds[i], status: "success", result: r.value }
            : { queryId: queryIds[i], status: "error",   error: r.reason instanceof Error ? r.reason.message : "Unknown error" }
        )
      },

      // ── Read-only helpers ──────────────────────────────────────────────────

      getQueriesByCategory: (category) => {
        const { queries } = get()
        return Array.isArray(queries) ? queries.filter(q => q.category === category) : []
      },

      /**
       * ✅ Queries are already sorted newest-first on fetch.
       * Just slice — no re-sort on every call.
       */
      getRecentQueries: (limit = 5) => {
        const { queries } = get()
        return Array.isArray(queries) ? queries.slice(0, limit) : []
      },

      // ── Weaviate sync ──────────────────────────────────────────────────────

      syncWithWeaviate: async (userId) => {
        try {
          console.log("[QueriesStore] Weaviate sync for user:", userId)
          const res = await fetch("/api/weaviate/sync-queries", {
            method:      "POST",
            headers:     { "Content-Type": "application/json" },
            credentials: "include",
            body:        JSON.stringify({ userId }),
          })
          if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            throw new Error(err.error ?? "Failed to sync with Weaviate")
          }
          const result = await res.json()
          if (result.success) {
            toast.success(`Synced ${result.synced} queries with AI database`)
            // ✅ Weaviate sync doesn't change client-visible query data — no refetch needed
          } else {
            throw new Error(result.message ?? "Sync failed")
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : "Failed to sync with AI database"
          console.error("[QueriesStore] syncWithWeaviate failed:", err)
          toast.error(message)
          throw err
        }
      },
    }),

    {
      name:    "queries-storage",
      storage: safeStorage,

      // ✅ Persist lightweight metadata only — queries array can be large
      // Fresh fetch happens on mount; lastFetch drives the 5-min cache TTL
      partialize: (state) => ({
        queries:       state.queries.slice(0, 100), // cap at 100 for quota safety
        lastFetch:     state.lastFetch,
        currentUserId: state.currentUserId,
      }),
    }
  )
)