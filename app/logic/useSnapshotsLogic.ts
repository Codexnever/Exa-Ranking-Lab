// app/logic/useSnapshotsLogic.ts
import { useEffect, useState } from "react"
import { useQueriesStore } from "@/app/store"
import { useSnapshotsStore } from "@/app/store"
import { useAnalyticsStore } from "@/app/store"
import { useAuth } from "@/lib/contexts/auth-context"
import { toast } from "sonner"
import type { QueryConfig } from "@/lib/type"

export function useSnapshotsLogic() {
  // ✅ Use new store structure with separated data flows
  const paginatedSnapshots = useSnapshotsStore(state => state.paginatedSnapshots)
  const allSnapshots = useSnapshotsStore(state => state.allSnapshots)
  const pagination = useSnapshotsStore(state => state.pagination)
  const isLoadingPaginated = useSnapshotsStore(state => state.isLoadingPaginated)
  const isLoadingAnalytics = useSnapshotsStore(state => state.isLoadingAnalytics)
  const fetchPaginatedSnapshots = useSnapshotsStore(state => state.fetchPaginatedSnapshots)
  const fetchAllSnapshots = useSnapshotsStore(state => state.fetchAllSnapshots)
  const fetchSnapshotsComplete = useSnapshotsStore(state => state.fetchSnapshotsComplete)
  const setPage = useSnapshotsStore(state => state.setPage)
  const setItemsPerPage = useSnapshotsStore(state => state.setItemsPerPage)
  
  const queries = useQueriesStore(state => state.queries)
  const { analytics } = useAnalyticsStore()
  const calculateAnalytics = useAnalyticsStore(state => state.calculateAnalyticsFromSnapshots)
  const { user } = useAuth()
  
  const [filters, setFilters] = useState({
    category: "all",
    status: "all-status",
    search: "",
  })
  const [selectedQueryId, setSelectedQueryId] = useState<string>("")
  const [creating, setCreating] = useState(false)

  // ✅ Initial fetch - get both paginated and complete data
  useEffect(() => {
    if (user?.$id) {
      // Fetch first page of data AND complete dataset for analytics
      fetchSnapshotsComplete(1, pagination.itemsPerPage || 20, user.$id)
    }
  }, [user?.$id, fetchSnapshotsComplete, pagination.itemsPerPage])

  // ✅ Create snapshots with query info using PAGINATED data for display
  const snapshotsWithQueries = paginatedSnapshots.map((snapshot) => {
    const query = queries.find((q: QueryConfig) => q.id === snapshot.queryId)
    return {
      ...snapshot,
      queryInfo: query || null,
    }
  })

  // ✅ Filter the paginated snapshots for display
  const filteredSnapshots = snapshotsWithQueries.filter((snapshot) => {
    if (filters.category !== "all" && snapshot.queryInfo?.category !== filters.category) return false
    if (filters.status !== "all-status") {
      const status = snapshot.results.length > 0 ? "completed" : "failed"
      if (status !== filters.status) return false
    }
    if (filters.search && !snapshot.queryInfo?.query.toLowerCase().includes(filters.search.toLowerCase())) return false
    return true
  })

  const formatDate = (date: Date | string) => {
    const parsedDate = typeof date === 'string' ? new Date(date) : date
    const now = new Date()
    const diffMs = now.getTime() - parsedDate.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffMin = Math.floor(diffMs / (1000 * 60))

    if (diffMin < 60) {
      return `${diffMin}m ago`
    } else if (diffHours < 24) {
      return `${diffHours}h ago`
    } else {
      return parsedDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    }
  }

  const handleCreateSnapshot = async () => {
    if (creating) return // Prevent double-clicks
    
    setCreating(true)
    
    try {
      if (!user) {
        toast.error("Authentication required. Please log in to create snapshots.")
        return
      }
      
      if (!selectedQueryId) {
        toast.error("Please select a query to snapshot.")
        return
      }

      const queryConfig = queries.find((q: QueryConfig) => q.id === selectedQueryId)
      if (!queryConfig) {
        throw new Error("Query not found")
      }

      console.log('[Snapshots] Creating snapshot for query:', selectedQueryId)

      // Step 1: Run the query
      const runRes = await fetch(`/api/queries/${selectedQueryId}/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: 'include',
      })

      if (!runRes.ok) {
        if (runRes.status === 401) {
          toast.error("Session expired. Please log in again.")
          return
        }
        throw new Error(`Failed to run query: ${runRes.status} ${runRes.statusText}`)
      }

      const queryResults = await runRes.json()
      console.log('[Snapshots] Query executed successfully, creating snapshot...')

      // Step 2: Create the snapshot
      const createRes = await fetch("/api/snapshots", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: 'include',
        body: JSON.stringify({
          queryId: selectedQueryId,
          timestamp: new Date().toISOString(),
          results: queryResults.results || [],
          metadata: {
            responseTime: queryResults.responseTime || 0,
            totalResults: queryResults.totalResults || 0,
          },
        }),
      })

      if (!createRes.ok) {
        if (createRes.status === 401) {
          toast.error("Session expired. Please log in again.")
          return
        }
        const errorData = await createRes.json().catch(() => ({}))
        throw new Error(errorData.message || `Failed to create snapshot: ${createRes.status}`)
      }

      const createdSnapshot = await createRes.json()
      console.log('[Snapshots] Snapshot created successfully:', createdSnapshot)

      // ✅ Step 3: Refresh BOTH paginated and complete datasets
      await Promise.all([
        fetchPaginatedSnapshots(pagination.currentPage, pagination.itemsPerPage, user.$id),
        fetchAllSnapshots(user.$id)
      ])
      
      // ✅ Step 4: Recalculate analytics with fresh COMPLETE data
      const freshAllSnapshots = useSnapshotsStore.getState().allSnapshots
      calculateAnalytics(freshAllSnapshots) // Use complete dataset for analytics

      toast.success("Snapshot created successfully!")
      
      // Optional: Clear selection after successful creation
      // setSelectedQueryId("")
      
    } catch (error) {
      console.error('[Snapshots] Creation failed:', error)
      const message = error instanceof Error ? error.message : "Failed to create snapshot"
      toast.error(message)
    } finally {
      setCreating(false)
    }
  }

  // ✅ Pagination handlers
  const handlePageChange = (page: number) => {
    setPage(page)
  }

  const handleItemsPerPageChange = (itemsPerPage: number) => {
    setItemsPerPage(itemsPerPage)
  }

  // ✅ Filter change handler that might need to reset pagination
  const handleFiltersChange = (newFilters: typeof filters) => {
    setFilters(newFilters)
    // Optional: Reset to first page when filters change
    if (pagination.currentPage > 1) {
      setPage(1)
    }
  }

  return {
    // ✅ Paginated data for display
    snapshots: paginatedSnapshots, // Keep original name for backward compatibility
    paginatedSnapshots,
    
    // ✅ Complete data for analytics
    allSnapshots,
    
    // ✅ Loading states
    isLoading: isLoadingPaginated, // Keep original name for backward compatibility
    isLoadingPaginated,
    isLoadingAnalytics,
    
    // ✅ Pagination info
    pagination,
    
    // ✅ Other data
    queries,
    analytics,
    user,
    
    // ✅ State and handlers
    filters,
    setFilters: handleFiltersChange,
    selectedQueryId,
    setSelectedQueryId,
    creating,
    
    // ✅ Computed data
    filteredSnapshots,
    
    // ✅ Utility functions
    formatDate,
    
    // ✅ Action handlers
    handleCreateSnapshot,
    handlePageChange,
    handleItemsPerPageChange,
    
    // ✅ Direct pagination actions
    setPage,
    setItemsPerPage,
    
    // ✅ Data fetching methods
    fetchPaginatedSnapshots,
    fetchAllSnapshots,
    refreshData: () => fetchSnapshotsComplete(pagination.currentPage, pagination.itemsPerPage, user?.$id),
  }
}
