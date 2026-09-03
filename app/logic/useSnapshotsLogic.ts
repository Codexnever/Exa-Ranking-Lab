// hooks/use-snapshots-logic.ts  (or lib/hooks/use-snapshots-logic.ts)
"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
import { useQueriesStore, useSnapshotsStore, useAnalyticsStore } from "@/app/store"
import { useAuth } from "@/lib/middleware/authentication/auth-context"
import { toast } from "sonner"
import type { QueryConfig } from "@/types/type"
import { useSecureApi } from "@/lib/api/use-secureApi"

interface QueryRunResponse {
  success: boolean
  snapshotId: string
}

// ─── Pure helpers (stable references — defined outside the hook) ──────────────

export const formatDate = (date: Date | string): string => {
  const d    = typeof date === "string" ? new Date(date) : date
  const now  = Date.now()
  const diff = now - d.getTime()
  const min  = Math.floor(diff / 60_000)
  const hr   = Math.floor(diff / 3_600_000)

  if (min < 60)  return `${min}m ago`
  if (hr  < 24)  return `${hr}h ago`
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSnapshotsLogic() {
  const {
    paginatedSnapshots,
    allSnapshots,
    pagination,
    isLoadingPaginated,
    isLoadingAnalytics,
    fetchPaginatedSnapshots,
    fetchAllSnapshots,
    fetchSnapshotsComplete,
    setPage,
    setItemsPerPage,
  } = useSnapshotsStore()

  const queries                       = useQueriesStore(state => state.queries)
  const { analytics } = useAnalyticsStore()
  const { user }                      = useAuth()

  const [filters, setFilters] = useState({
    category:  "all",
    status:    "all-status",
    search:    "",
  })
  const [selectedQueryId, setSelectedQueryId] = useState<string>("")
  const [creating, setCreating]               = useState(false)

  const { call, loading } = useSecureApi({ showErrorToast: true, showSuccessToast: false })

  // ── Initial data fetch ────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.$id) return
    fetchSnapshotsComplete(1, pagination.itemsPerPage || 20, user.$id)
    // Run once when userId is known — intentionally excludes fetchSnapshotsComplete
    // and pagination.itemsPerPage from deps to avoid re-fetching on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.$id])

  // ── Derived data ──────────────────────────────────────────────────────────

  const snapshotsWithQueries = useMemo(
    () => paginatedSnapshots.map(s => ({
      ...s,
      queryInfo: queries.find((q: QueryConfig) => q.id === s.queryId) ?? null,
    })),
    [paginatedSnapshots, queries]
  )

  const filteredSnapshots = useMemo(
    () => snapshotsWithQueries.filter(s => {
      if (filters.category !== "all" && s.queryInfo?.category !== filters.category) return false
      if (filters.status   !== "all-status") {
        const status = s.results.length > 0 ? "completed" : "failed"
        if (status !== filters.status) return false
      }
      if (filters.search && !s.queryInfo?.query.toLowerCase().includes(filters.search.toLowerCase()))
        return false
      return true
    }),
    [snapshotsWithQueries, filters]
  )

  // ── Create snapshot ───────────────────────────────────────────────────────

  const handleCreateSnapshot = useCallback(async () => {
    if (creating) return

    // ✅ Guard before setting creating=true so we don't show spinner unnecessarily
    if (!user) { toast.error("Please log in to create snapshots."); return }
    if (!selectedQueryId) { toast.error("Please select a query first."); return }

    const queryConfig = queries.find(q => q.id === selectedQueryId)
    if (!queryConfig) { toast.error("Query not found"); return }

    setCreating(true)
    try {
      // `call` returns parsed JSON. The run route already persists the
      // snapshot, so the UI must refresh it rather than create a duplicate.
      const runResult = await call<QueryRunResponse>("POST", `/queries/${selectedQueryId}/run`)
      if (!runResult.success || !runResult.snapshotId) throw new Error("Failed to run query")

      //  Use store action instead of direct setState — respects persist middleware
      await fetchSnapshotsComplete(
        pagination.currentPage,
        pagination.itemsPerPage,
        user.$id,
      )

      toast.success("Snapshot created successfully!")
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Snapshot creation failed")
    } finally {
      setCreating(false)
    }
  }, [
    creating, user, selectedQueryId, queries, call,
    pagination, fetchSnapshotsComplete,
  ])

  // ── Pagination handlers (pass userId through) ─────────────────────────────

  const handlePageChange = useCallback(
    (page: number) => setPage(page, user?.$id),
    [setPage, user?.$id]
  )

  const handleItemsPerPageChange = useCallback(
    (limit: number) => setItemsPerPage(limit, user?.$id),
    [setItemsPerPage, user?.$id]
  )

  // ── Refresh ───────────────────────────────────────────────────────────────

  //  Guard — don't call without userId
  const refreshData = useCallback(() => {
    if (!user?.$id) return
    fetchSnapshotsComplete(pagination.currentPage, pagination.itemsPerPage, user.$id)
  }, [user?.$id, pagination.currentPage, pagination.itemsPerPage, fetchSnapshotsComplete])

  // ── Return ────────────────────────────────────────────────────────────────

  return {
    snapshots:                paginatedSnapshots,
    paginatedSnapshots,
    allSnapshots,
    isLoading:                isLoadingPaginated || loading,
    isLoadingPaginated,
    isLoadingAnalytics,
    pagination,
    queries,
    analytics,
    user,
    filters,
    setFilters,
    selectedQueryId,
    setSelectedQueryId,
    creating,
    filteredSnapshots,
    formatDate,
    handleCreateSnapshot,
    handlePageChange,
    handleItemsPerPageChange,
    fetchPaginatedSnapshots,
    fetchAllSnapshots,
    refreshData,
  }
}
