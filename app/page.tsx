"use client"

import dynamic from "next/dynamic"
import { useQueries } from "@/hooks/use-queries"
import { useAnalytics } from "@/hooks/use-analytics"
import { useSnapshots } from "@/hooks/use-snapshots"
import { useAuth } from "@/contexts/auth-context"
import { useState, useEffect } from "react"
import { toast } from "sonner"
import { useAnalyticsStore } from "@/store"

const DashboardStats = dynamic(() => import("@/components/dashboard/DashboardStats"), { ssr: false })
const RecentQueryActivity = dynamic(() => import("@/components/dashboard/RecentQueryActivity"), { ssr: false })
const ActiveQueries = dynamic(() => import("@/components/dashboard/ActiveQueries"), { ssr: false })
const PerformanceOverview = dynamic(() => import("@/components/dashboard/PerformanceOverview"), { ssr: false })

export default function Dashboard() {
  const { user, loading } = useAuth()
  const { queries, runQuery, fetchQueries } = useQueries()
  const { analytics, fetchAnalytics } = useAnalytics()
  const { snapshots, fetchSnapshots } = useSnapshots()
  const [runningQueries, setRunningQueries] = useState<Set<string>>(new Set())

  const handleRunQuery = async (queryId: string) => {
    setRunningQueries((prev) => new Set(prev).add(queryId))
    try {
      await runQuery(queryId)
      toast.success("Query executed successfully!")
    } catch (error) {
      console.error("Query execution failed:", error)
      if (error instanceof Error) {
        if (error.message.includes("Exa API Error")) {
          toast.error("Exa API Error: Please check your API key and try again")
        } else if (error.message.includes("Failed to fetch")) {
          toast.error("Network error: Please check your connection")
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

  const recentSnapshots = snapshots
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 5)

  useEffect(() => {
    useAnalyticsStore.getState().calculateAnalyticsFromSnapshots(snapshots)
  }, [])

  useEffect(() => {
    if (loading) return
    const verifySession = async () => {
      const res = await fetch('/api/verify-session', {
        credentials: 'include',
      })
      if (!res.ok) {
        window.location.href = '/auth'
        return
      }
    }
    verifySession()
  }, [user, loading])

  useEffect(() => {
    if (user && !loading) {
      fetchQueries()
      fetchAnalytics()
      fetchSnapshots()
    }
  }, [user, loading])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-1">Monitor search ranking performance and quality metrics</p>
        </div>
      </div>
      <DashboardStats queries={queries} analytics={analytics} />
      <div className="grid gap-6 lg:grid-cols-3">
        <RecentQueryActivity recentSnapshots={recentSnapshots} queries={queries} />
        <ActiveQueries queries={queries} runningQueries={runningQueries} handleRunQuery={handleRunQuery} />
      </div>
      <PerformanceOverview analytics={analytics} />
    </div>
  )
}
