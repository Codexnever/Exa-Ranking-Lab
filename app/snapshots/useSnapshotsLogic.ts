import { useEffect, useState } from "react"
import { useSnapshots } from "@/hooks/use-snapshots"
import { useQueries } from "@/hooks/use-queries"
import { useAnalytics } from "@/hooks/use-analytics"
import { useAuth } from "@/contexts/auth-context"
import { useToast } from "@/components/ui/use-toast"
import { useSnapshotsStore, useAnalyticsStore } from "@/store"
import type { QueryConfig } from "@/lib/types"

export function useSnapshotsLogic() {
  const { snapshots, isLoading, fetchSnapshots } = useSnapshots()
  const { queries } = useQueries()
  const { analytics } = useAnalytics()
  const { user } = useAuth()
  const { toast } = useToast()
  const [filters, setFilters] = useState({
    category: "all",
    status: "all-status",
    search: "",
  })
  const [selectedQueryId, setSelectedQueryId] = useState<string>("")
  const [creating, setCreating] = useState(false)
  const snapshotsStore = useSnapshotsStore()
  const analyticsStore = useAnalyticsStore()

  useEffect(() => {
    if (user?.$id) {
      fetchSnapshots()
    }
  }, [user?.$id])

  const snapshotsWithQueries = snapshots.map((snapshot) => {
    const query = queries.find((q: QueryConfig) => q.id === snapshot.queryId)
    return {
      ...snapshot,
      queryInfo: query || null,
    }
  })

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
    if (diffHours < 24) {
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

  // Helper function to get JWT token
  const getJWTToken = () => {
    if (typeof window !== 'undefined') {
      let jwt = localStorage.getItem('appwrite_jwt')
      if (jwt) return jwt
      if (typeof document !== 'undefined') {
        const match = document.cookie.match(/(?:^|; )appwrite_jwt=([^;]*)/)
        if (match) return match[1]
      }
    }
    return null
  }

  const handleCreateSnapshot = async () => {
    if (!user) {
      toast({ title: "Authentication required", description: "Please log in to create snapshots.", variant: "destructive" })
      return
    }
    if (!selectedQueryId) {
      toast({ title: "Select a query", description: "Please select a query to snapshot.", variant: "destructive" })
      return
    }
    setCreating(true)
    try {
      const jwt = getJWTToken()
      if (!jwt) {
        toast({ title: "Authentication error", description: "No valid session found. Please log in again.", variant: "destructive" })
        return
      }
      const queryConfig = queries.find((q: QueryConfig) => q.id === selectedQueryId)
      if (!queryConfig) throw new Error("Query not found")
      const runRes = await fetch(`/api/queries/${selectedQueryId}/run`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${jwt}`,
          "Content-Type": "application/json",
        },
      })
      if (!runRes.ok) {
        if (runRes.status === 401) {
          toast({ title: "Session expired", description: "Your session has expired. Please log in again.", variant: "destructive" })
          return
        }
        throw new Error(`Failed to run query for snapshot: ${runRes.status} ${runRes.statusText}`)
      }
      const { results, responseTime, totalResults, timestamp } = await runRes.json()
      const res = await fetch("/api/snapshots", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${jwt}`,
        },
        body: JSON.stringify({
          queryId: selectedQueryId,
          timestamp: new Date(),
          results,
          metadata: {
            responseTime,
            totalResults,
          },
        }),
      })
      if (!res.ok) {
        if (res.status === 401) {
          toast({ title: "Session expired", description: "Your session has expired. Please log in again.", variant: "destructive" })
          return
        }
        throw new Error(`Failed to create snapshot: ${res.status} ${res.statusText}`)
      }
      const created = await res.json()
      const snapshotId = created.id || created.$id || Math.random().toString(36).slice(2)
      const newSnapshot = {
        id: snapshotId,
        userId: user.$id,
        queryId: selectedQueryId,
        timestamp: timestamp ? new Date(timestamp) : new Date(),
        results,
        metadata: {
          responseTime,
          totalResults,
        },
      }
      snapshotsStore.setSnapshots([newSnapshot, ...snapshotsStore.snapshots])
      analyticsStore.calculateAnalyticsFromSnapshots([newSnapshot, ...snapshotsStore.snapshots])
      analyticsStore.fetchAnalytics()
      toast({ title: "Snapshot created!", description: `Snapshot for '${queryConfig.query}' created.` })
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to create snapshot", variant: "destructive" })
    } finally {
      setCreating(false)
    }
  }

  return {
    snapshots, isLoading, queries, analytics, user, toast,
    filters, setFilters, selectedQueryId, setSelectedQueryId, creating,
    filteredSnapshots, formatDate, handleCreateSnapshot
  }
}
