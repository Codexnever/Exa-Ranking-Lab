import { useEffect, useState, useMemo, useCallback } from "react"
import { useQueriesStore, useSnapshotsStore, useAnalyticsStore } from "@/app/store"
import { useAuth } from "@/lib/contexts/auth-context"
import { toast } from "sonner"
import type { QueryConfig } from "@/lib/type"
import { useSecureApi } from "@/lib/use-secureApi"

// ✅ Moved outside to avoid recreation
const formatDate = (date: Date | string) => {
  const parsedDate = typeof date === "string" ? new Date(date) : date
  const now = new Date()
  const diffMs = now.getTime() - parsedDate.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffMin = Math.floor(diffMs / (1000 * 60))

  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  return parsedDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

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

  const queries = useQueriesStore(state => state.queries)
  const { analytics, calculateAnalyticsFromSnapshots } = useAnalyticsStore()
  const { user } = useAuth()

  const [filters, setFilters] = useState({
    category: "all",
    status: "all-status",
    search: "",
  })
  const [selectedQueryId, setSelectedQueryId] = useState<string>("")
  const [creating, setCreating] = useState(false)

  const { call, loading } = useSecureApi({
    showErrorToast: true,
    showSuccessToast: false,
  })

  // ✅ Initial fetch
  useEffect(() => {
    if (user?.$id) {
      fetchSnapshotsComplete(1, pagination.itemsPerPage || 20, user.$id)
    }
  }, [user?.$id, fetchSnapshotsComplete, pagination.itemsPerPage])

  // ✅ Combined query info with snapshots
  const snapshotsWithQueries = useMemo(
    () =>
      paginatedSnapshots.map(snapshot => ({
        ...snapshot,
        queryInfo: queries.find((q: QueryConfig) => q.id === snapshot.queryId) || null,
      })),
    [paginatedSnapshots, queries]
  )



  const filteredSnapshots = useMemo(() => {
    return snapshotsWithQueries.filter(snapshot => {
      if (filters.category !== "all" && snapshot.queryInfo?.category !== filters.category) return false
      if (filters.status !== "all-status") {
        const status = snapshot.results.length > 0 ? "completed" : "failed"
        if (status !== filters.status) return false
      }
      if (filters.search && !snapshot.queryInfo?.query.toLowerCase().includes(filters.search.toLowerCase()))
        return false
      return true
    })
  }, [snapshotsWithQueries, filters])

  const handleCreateSnapshot = useCallback(async () => {
    if (creating) return

    setCreating(true)
    try {
      if (!user) return toast.error("Please log in to create snapshots.")
      if (!selectedQueryId) return toast.error("Please select a query first.")

      const queryConfig = queries.find(q => q.id === selectedQueryId)
      if (!queryConfig) throw new Error("Query not found")

      const runResponse = await call("POST", `/queries/${selectedQueryId}/run`)
      if (!runResponse?.ok) throw new Error("Failed to run query")

      const queryResults = await runResponse.json()
      const snapshotData = {
        queryId: selectedQueryId,
        timestamp: new Date().toISOString(),
        results: queryResults.results || [],
        metadata: {
          responseTime: queryResults.responseTime || 0,
          totalResults: queryResults.totalResults || 0,
          source: "manual_creation",
        },
      }

      const createResponse = await call("POST", "/snapshots", snapshotData)
      if (!createResponse?.ok) throw new Error("Failed to create snapshot")

      const createdSnapshot = await createResponse.json()

      // Optimistic update
      useSnapshotsStore.setState(state => ({
        paginatedSnapshots: [createdSnapshot, ...state.paginatedSnapshots],
        allSnapshots: [createdSnapshot, ...state.allSnapshots],
      }))
      calculateAnalyticsFromSnapshots([createdSnapshot, ...allSnapshots])

      // Refresh in background
      fetchPaginatedSnapshots(pagination.currentPage, pagination.itemsPerPage, user.$id)
      fetchAllSnapshots(user.$id)

      toast.success("Snapshot created successfully!")
    } catch (err: any) {
      toast.error(err.message || "Snapshot creation failed")
    } finally {
      setCreating(false)
    }
  }, [creating, selectedQueryId, queries, user, call, pagination, allSnapshots, fetchPaginatedSnapshots, fetchAllSnapshots, calculateAnalyticsFromSnapshots])

  return {
    snapshots: paginatedSnapshots,
    paginatedSnapshots,
    allSnapshots,
    isLoading: isLoadingPaginated || loading,
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
    handlePageChange: setPage,
    handleItemsPerPageChange: setItemsPerPage,
    fetchPaginatedSnapshots,
    fetchAllSnapshots,
    refreshData: () => fetchSnapshotsComplete(pagination.currentPage, pagination.itemsPerPage, user?.$id),
  }
}
