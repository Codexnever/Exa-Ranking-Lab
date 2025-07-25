// app/page.tsx
"use client"

import dynamic from "next/dynamic"
import { useQueriesStore } from "@/app/store"
import { useAnalyticsStore } from "@/app/store"
import { useSnapshotsStore } from "@/app/store"
import { useAuth } from "@/lib/contexts/auth-context"
import { useState, useEffect, useMemo } from "react"
import { toast } from "sonner"

const DashboardStats = dynamic(() => import("@/components/dashboard/DashboardStats"), { ssr: false })
const RecentQueryActivity = dynamic(() => import("@/components/dashboard/RecentQueryActivity"), { ssr: false })
const ActiveQueries = dynamic(() => import("@/components/dashboard/ActiveQueries"), { ssr: false })
const PerformanceOverview = dynamic(() => import("@/components/dashboard/PerformanceOverview"), { ssr: false })

export default function Dashboard() {
  const { user, loading } = useAuth()
  
  // ✅ Individual selectors for queries
  const queries = useQueriesStore(state => state.queries)
  const runQuery = useQueriesStore(state => state.runQuery)
  const fetchQueries = useQueriesStore(state => state.fetchQueries)
  const queriesLoading = useQueriesStore(state => state.isLoading)
  
  // ✅ Use new store structure - separate paginated and complete data
  const allSnapshots = useSnapshotsStore(state => state.allSnapshots) // ✅ Complete dataset for analytics
  const paginatedSnapshots = useSnapshotsStore(state => state.paginatedSnapshots) // ✅ For any paginated display
  const pagination = useSnapshotsStore(state => state.pagination)
  const fetchAllSnapshots = useSnapshotsStore(state => state.fetchAllSnapshots) // ✅ For analytics
  const fetchSnapshotsComplete = useSnapshotsStore(state => state.fetchSnapshotsComplete) // ✅ For both datasets
  const isLoadingPaginated = useSnapshotsStore(state => state.isLoadingPaginated)
  const isLoadingAnalytics = useSnapshotsStore(state => state.isLoadingAnalytics)
  
  // ✅ Individual selectors for analytics
  const analytics = useAnalyticsStore(state => state.analytics)
  const fetchAnalytics = useAnalyticsStore(state => state.fetchAnalytics)
  const calculateAnalytics = useAnalyticsStore(state => state.calculateAnalyticsFromSnapshots)
  const analyticsLoading = useAnalyticsStore(state => state.isLoading)
  
  const [runningQueries, setRunningQueries] = useState<Set<string>>(new Set())
  const [isInitialized, setIsInitialized] = useState(false)

  // ✅ Use complete dataset for recent snapshots (more accurate)
  const recentSnapshots = useMemo(() => {
    if (!Array.isArray(allSnapshots)) return []
    
    return allSnapshots
      .filter(snapshot => snapshot && snapshot.timestamp) // Filter out invalid snapshots
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 5)
  }, [allSnapshots]) // ✅ Use complete dataset

  // ✅ Enhanced query execution with proper data refresh
  const handleRunQuery = async (queryId: string) => {
    if (runningQueries.has(queryId)) {
      toast.info("Query is already running")
      return
    }

    setRunningQueries((prev) => new Set(prev).add(queryId))
    
    try {
      console.log('[Dashboard] Running query:', queryId)
      await runQuery(queryId)
      toast.success("Query executed successfully!")
      
      // ✅ Refresh both paginated and complete datasets after query run
      if (user?.$id) {
        await fetchSnapshotsComplete(
          pagination.currentPage || 1, 
          pagination.itemsPerPage || 20, 
          user.$id
        )
        
        // ✅ Recalculate analytics with fresh complete dataset
        const freshAllSnapshots = useSnapshotsStore.getState().allSnapshots
        calculateAnalytics(freshAllSnapshots)
      }
    } catch (error) {
      console.error("Query execution failed:", error)
      
      if (error instanceof Error) {
        // ✅ Enhanced error handling with specific messages
        if (error.message.includes("401") || error.message.includes("Unauthorized")) {
          toast.error("Session expired. Please log in again.")
        } else if (error.message.includes("Exa API Error")) {
          toast.error("Exa API Error: Please check your API key and try again")
        } else if (error.message.includes("Failed to fetch") || error.message.includes("NetworkError")) {
          toast.error("Network error: Please check your connection")
        } else if (error.message.includes("404")) {
          toast.error("Query not found. Please refresh the page.")
        } else {
          toast.error(`Query failed: ${error.message}`)
        }
      } else {
        toast.error("Failed to execute query")
      }
    } finally {
      setRunningQueries((prev) => {
        const newSet = new Set(prev)
        newSet.delete(queryId)
        return newSet
      })
    }
  }

  // ✅ Session verification effect (optimized)
  useEffect(() => {
    if (loading) return

    const verifySession = async () => {
      try {
        const res = await fetch('/api/verify-session', {
          credentials: 'include',
        })
        
        if (!res.ok) {
          console.warn('[Dashboard] Session verification failed, redirecting to auth')
          window.location.href = '/auth'
          return
        }
        
        console.log('[Dashboard] Session verified successfully')
      } catch (error) {
        console.error('[Dashboard] Session verification error:', error)
        window.location.href = '/auth'
      }
    }

    verifySession()
  }, [loading])

  // ✅ Combined data fetching effect with new store methods
  useEffect(() => {
    if (!user?.$id || loading || isInitialized) return

    const initializeDashboard = async () => {
      try {
        console.log('[Dashboard] Initializing dashboard for user:', user.$id)
        
        // ✅ Fetch all data in parallel using new store methods
        const promises = []
        
        // Fetch queries
        if (fetchQueries) promises.push(fetchQueries(user.$id))
        
        // Fetch complete snapshots for analytics
        if (fetchAllSnapshots) promises.push(fetchAllSnapshots(user.$id))
        
        // Fetch analytics data
        if (fetchAnalytics) promises.push(fetchAnalytics(user.$id))
        
        await Promise.allSettled(promises) // Use allSettled to not fail if one request fails
        
        // ✅ Initialize paginated data for any components that might need it
        // This is optional since dashboard doesn't show paginated table, but good for consistency
        const { fetchPaginatedSnapshots } = useSnapshotsStore.getState()
        if (fetchPaginatedSnapshots) {
          await fetchPaginatedSnapshots(1, 20, user.$id).catch(error => {
            console.warn('[Dashboard] Paginated fetch failed (non-critical):', error)
          })
        }
        
        setIsInitialized(true)
        console.log('[Dashboard] Dashboard initialized successfully')
      } catch (error) {
        console.error('[Dashboard] Failed to initialize dashboard:', error)
        toast.error("Failed to load dashboard data")
      }
    }

    initializeDashboard()
  }, [user?.$id, loading, isInitialized, fetchQueries, fetchAllSnapshots, fetchAnalytics])

  // ✅ Analytics calculation effect - use complete dataset
  useEffect(() => {
    if (!allSnapshots.length || !calculateAnalytics) return

    try {
      console.log('[Dashboard] Recalculating analytics with', allSnapshots.length, 'complete snapshots')
      calculateAnalytics(allSnapshots) // ✅ Use complete dataset
    } catch (error) {
      console.error('[Dashboard] Analytics calculation failed:', error)
    }
  }, [allSnapshots, calculateAnalytics]) // ✅ Use complete dataset

  // ✅ Loading state - account for new loading states
  const isLoading = loading || queriesLoading || isLoadingAnalytics || analyticsLoading || !isInitialized

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dashboard...</p>
          <p className="text-xs text-gray-500 mt-1">
            {isLoadingAnalytics ? 'Loading analytics data...' : 'Fetching your ranking data...'}
          </p>
        </div>
      </div>
    )
  }

  // ✅ No user state
  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <h3 className="text-lg font-medium text-gray-900 mb-2">Authentication Required</h3>
          <p className="text-gray-500 mb-4">Please log in to view your dashboard</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-1">Monitor search ranking performance and quality metrics</p>
          
          {/* ✅ Show data freshness and stats */}
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
            {recentSnapshots.length > 0 && (
              <span>Latest: {new Date(recentSnapshots[0].timestamp).toLocaleString()}</span>
            )}
            <span>{queries.length} queries</span>
            <span>{allSnapshots.length} total snapshots</span>
            {pagination.totalItems > 0 && (
              <span>({pagination.totalItems} in current view)</span>
            )}
          </div>
        </div>
        
        {/* ✅ Optional: Add refresh button */}
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              if (user?.$id) {
                await fetchAllSnapshots(user.$id)
                const freshSnapshots = useSnapshotsStore.getState().allSnapshots
                calculateAnalytics(freshSnapshots)
              }
            }}
            disabled={isLoadingAnalytics}
            className="px-3 py-1 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50"
          >
            {isLoadingAnalytics ? 'Refreshing...' : 'Refresh Data'}
          </button>
        </div>
      </div>

      {/* ✅ Enhanced stats with loading states and complete data */}
      <DashboardStats 
        queries={queries} 
        analytics={analytics}
        isLoading={isLoading}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <RecentQueryActivity 
          recentSnapshots={recentSnapshots} // ✅ Based on complete dataset
          queries={queries}
          isLoading={isLoadingAnalytics}
        />
        
        <ActiveQueries 
          queries={queries} 
          runningQueries={runningQueries} 
          handleRunQuery={handleRunQuery}
          isLoading={queriesLoading}
        />
      </div>

      <PerformanceOverview 
        analytics={analytics}
        snapshots={allSnapshots} // ✅ Pass complete dataset for accurate analysis
        isLoading={analyticsLoading}
      />
      
      {/* ✅ Debug info (remove in production) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="text-xs text-gray-400 bg-gray-50 p-3 rounded">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <strong>Complete Dataset:</strong> {allSnapshots.length} snapshots
            </div>
            <div>
              <strong>Paginated Dataset:</strong> {paginatedSnapshots.length} snapshots
            </div>
            <div>
              <strong>Recent Activity:</strong> {recentSnapshots.length} recent snapshots
            </div>
            <div>
              <strong>Analytics Status:</strong> {analyticsLoading ? 'Loading' : 'Ready'}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
