"use client"

import dynamic from "next/dynamic"
import { useQueriesStore } from "@/app/store"
import { useAnalyticsStore } from "@/app/store"
import { useSnapshotsStore } from "@/app/store"
import { useAuth } from "@/lib/middleware/authentication/auth-context"
import { useState, useEffect, useMemo, useCallback } from "react"
import { toast } from "sonner"

const DashboardStats = dynamic(() => import("@/components/dashboard/DashboardStats"), { ssr: false })
const RecentQueryActivity = dynamic(() => import("@/components/dashboard/RecentQueryActivity"), { ssr: false })
const ActiveQueries = dynamic(() => import("@/components/dashboard/ActiveQueries"), { ssr: false })
const PerformanceOverview = dynamic(() => import("@/components/dashboard/PerformanceOverview"), { ssr: false })

export default function Dashboard() {
  // ✅ initializing = first session check not yet complete
  // ✅ loading     = login/logout/register action in-flight
  // Never gate page renders on `loading` — only on `initializing`
  const { user, initializing } = useAuth()

  // ─── Store selectors ────────────────────────────────────────────────────────
  const queries           = useQueriesStore(state => state.queries)
  const runQuery          = useQueriesStore(state => state.runQuery)
  const fetchQueries      = useQueriesStore(state => state.fetchQueries)
  const queriesLoading    = useQueriesStore(state => state.isLoading)

  const allSnapshots            = useSnapshotsStore(state => state.allSnapshots)
  const paginatedSnapshots      = useSnapshotsStore(state => state.paginatedSnapshots)
  const pagination              = useSnapshotsStore(state => state.pagination)
  const fetchAllSnapshots       = useSnapshotsStore(state => state.fetchAllSnapshots)
  const fetchSnapshotsComplete  = useSnapshotsStore(state => state.fetchSnapshotsComplete)
  const isLoadingPaginated      = useSnapshotsStore(state => state.isLoadingPaginated)
  const isLoadingAnalytics      = useSnapshotsStore(state => state.isLoadingAnalytics)

  const analytics          = useAnalyticsStore(state => state.analytics)
  const fetchAnalytics     = useAnalyticsStore(state => state.fetchAnalytics)
  const calculateAnalytics = useAnalyticsStore(state => state.calculateAnalyticsFromSnapshots)
  const analyticsLoading   = useAnalyticsStore(state => state.isLoading)

  const [runningQueries, setRunningQueries] = useState<Set<string>>(new Set())

  // ─── Derived ────────────────────────────────────────────────────────────────
  // Zustand persists to localStorage — if data exists, render it immediately
  // while the background refresh runs. No unnecessary full-page spinner.
  const hasCachedData = queries.length > 0 || allSnapshots.length > 0

  const recentSnapshots = useMemo(() => {
    if (!Array.isArray(allSnapshots)) return []
    return allSnapshots
      .filter(s => s?.timestamp)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 5)
  }, [allSnapshots])

  // ─── Background data refresh ────────────────────────────────────────────────
  // Runs once auth is confirmed. If Zustand already has cached data it renders
  // immediately — this just silently updates it in the background.
  const refreshDashboard = useCallback(async (userId: string) => {
    try {
      await Promise.allSettled([
        fetchQueries(userId),
        fetchAllSnapshots(userId),
        fetchAnalytics(userId),
      ])
    } catch (error) {
      // allSettled won't throw but guard anyway
      console.error("[Dashboard] Background refresh error:", error)
    }
  }, [fetchQueries, fetchAllSnapshots, fetchAnalytics])

  useEffect(() => {
    // Wait until auth is confirmed AND we have a userId
    if (initializing || !user?.$id) return
    refreshDashboard(user.$id)
    // Only re-run when the userId changes (login as different user)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initializing, user?.$id])

  // ─── Reactive analytics recalculation ──────────────────────────────────────
  // Runs whenever allSnapshots changes (after fetchAllSnapshots resolves)
  useEffect(() => {
    if (!allSnapshots.length || !calculateAnalytics) return
    calculateAnalytics(allSnapshots)
  }, [allSnapshots, calculateAnalytics])

  // ─── Query execution ────────────────────────────────────────────────────────
  const handleRunQuery = useCallback(async (queryId: string) => {
    if (runningQueries.has(queryId)) {
      toast.info("Query is already running")
      return
    }

    setRunningQueries(prev => new Set(prev).add(queryId))

    try {
      await runQuery(queryId)
      toast.success("Query executed successfully!")

      if (user?.$id) {
        // Refresh snapshot data — allSnapshots selector updates reactively
        await fetchSnapshotsComplete(
          pagination.currentPage || 1,
          pagination.itemsPerPage || 20,
          user.$id
        )
      }
    } catch (error) {
      if (error instanceof Error) {
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
      setRunningQueries(prev => {
        const next = new Set(prev)
        next.delete(queryId)
        return next
      })
    }
  }, [runningQueries, runQuery, user?.$id, fetchSnapshotsComplete, pagination])

  // ─── Render guards ──────────────────────────────────────────────────────────

  // Block ONLY during the initial auth check (typically <300ms on first load,
  // instant on subsequent navigations once AuthProvider has run).
  // Do NOT block on data loading — show cached data + per-component skeletons instead.
  if (initializing) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  // AuthGate in the layout handles the redirect — this is just a render safeguard
  // in case someone renders Dashboard outside the protected layout.
  if (!user) return null

  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-1">
            Monitor search ranking performance and quality metrics
          </p>
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
            {recentSnapshots[0] && (
              <span>
                Latest: {new Date(recentSnapshots[0].timestamp).toLocaleString()}
              </span>
            )}
            <span>{queries.length} queries</span>
            <span>{allSnapshots.length} total snapshots</span>
          </div>
        </div>

        <button
          onClick={() => user.$id && refreshDashboard(user.$id)}
          disabled={isLoadingAnalytics}
          className="px-3 py-1 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50 transition-opacity"
        >
          {isLoadingAnalytics ? "Refreshing..." : "Refresh Data"}
        </button>
      </div>

      {/* ── Stats ──────────────────────────────────────────────────────────── */}
      {/* isLoading passed per-component so each card shows its own skeleton */}
      <DashboardStats
        queries={queries}
        analytics={analytics}
        isLoading={analyticsLoading}
      />

      {/* ── Activity + Active Queries ──────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-3">
        <RecentQueryActivity
          recentSnapshots={recentSnapshots}
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

      {/* ── Performance Overview ───────────────────────────────────────────── */}
      <PerformanceOverview
        analytics={analytics}
        snapshots={allSnapshots}
        isLoading={analyticsLoading}
      />

      {/* ── Dev debug panel (stripped in production) ──────────────────────── */}
      {process.env.NODE_ENV === "development" && (
        <div className="text-xs text-gray-400 bg-gray-50 p-3 rounded grid grid-cols-2 gap-4">
          <div><strong>All Snapshots:</strong> {allSnapshots.length}</div>
          <div><strong>Paginated Snapshots:</strong> {paginatedSnapshots.length}</div>
          <div><strong>Queries:</strong> {queries.length}</div>
          <div><strong>Analytics:</strong> {analyticsLoading ? "Loading" : "Ready"}</div>
          <div><strong>Has Cached Data:</strong> {String(hasCachedData)}</div>
          <div><strong>Auth Initializing:</strong> {String(initializing)}</div>
        </div>
      )}

    </div>
  )
}