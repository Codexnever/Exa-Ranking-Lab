"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { BarChart3, TrendingUp, TrendingDown, Clock, Globe, CheckCircle, Play } from "lucide-react"
import Link from "next/link"
import { useQueries } from "@/hooks/use-queries"
import { useAnalytics } from "@/hooks/use-analytics"
import { useSnapshots } from "@/hooks/use-snapshots"
import { useAuth } from "@/contexts/auth-context"
import { useState, useEffect } from "react"
import { toast } from "sonner"
import { useAnalyticsStore } from "@/store"

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

  const formatTimeAgo = (date: Date | string) => {
    const now = new Date()
    const past = new Date(date)
    const diffMs = now.getTime() - past.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))

    if (diffHours < 1) return "Just now"
    if (diffHours < 24) return `${diffHours}h ago`
    return `${Math.floor(diffHours / 24)}d ago`
  }
    // Recalculate analytics from current snapshots and persist in localStorage
  useEffect(() => {
      console.log("Calculating analytics from of BIG:")
    useAnalyticsStore.getState().calculateAnalyticsFromSnapshots(snapshots)
  }, [])
  useEffect(() => {
    if (loading) return
    const verifySession = async () => {
      let jwt = ''
      if (typeof window !== 'undefined') {
        jwt = localStorage.getItem('appwrite_jwt') || ''
        if (!jwt && typeof document !== 'undefined') {
          const match = document.cookie.match(/(?:^|; )appwrite_jwt=([^;]*)/)
          if (match) jwt = match[1]
        }
      }
      if (!jwt) {
        window.location.href = '/auth'
        return
      }
      const res = await fetch('/api/verify-session', {
        headers: { Authorization: `Bearer ${jwt}` },
      })
      if (!res.ok) {
        window.location.href = '/auth'
        return
      }
      // Optionally: hydrate user context here if needed
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
        <Link href="/query-builder">
          <Button className="bg-blue-600 hover:bg-blue-700">New Query</Button>
        </Link>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-gray-600">Active Queries</CardTitle>
            <BarChart3 className="w-4 h-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{queries.length}</div>
            <p className="text-xs text-emerald-600 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              {queries.filter((q) => q.schedule.enabled).length} scheduled
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-gray-600">Ranking Stability</CardTitle>
            <CheckCircle className="w-4 h-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{analytics?.rankingStability.toFixed(1)}%</div>
            <Progress value={analytics?.rankingStability || 0} className="mt-2" />
            <p className="text-xs text-gray-500 mt-1">Results maintaining position</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-gray-600">Avg Response Time</CardTitle>
            <Clock className="w-4 h-4 text-violet-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{analytics?.avgResponseTime != null ? analytics.avgResponseTime.toFixed(1) : "0.0"}s</div>
            <p className="text-xs text-emerald-600 flex items-center gap-1">
              <TrendingDown className="w-3 h-3" />
              -200ms improvement
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-gray-600">Domain Diversity</CardTitle>
            <Globe className="w-4 h-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{analytics?.domainDiversity}</div>
            <p className="text-xs text-gray-500">Unique domains tracked</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Query Activity */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-gray-900">Recent Query Activity</CardTitle>
            <CardDescription>Latest ranking snapshots and changes</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentSnapshots.length > 0 ? (
                recentSnapshots.map((snapshot) => {
                  const query = queries.find((q) => q.id === snapshot.queryId)
                  return (
                    <div
                      key={snapshot.id}
                      className="flex items-center gap-4 p-3 rounded-lg border border-gray-100 hover:border-gray-200 transition-colors"
                    >
                      <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{query?.name || "Unknown Query"}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">
                            {query?.category || "web"}
                          </Badge>
                          <span className="text-xs text-gray-500">{formatTimeAgo(snapshot.timestamp)}</span>
                          <span className="text-xs text-gray-500">{snapshot.results.length} results</span>
                        </div>
                      </div>
                      <div className="text-sm font-medium text-gray-500">
                        {snapshot.metadata.responseTime.toFixed(1)}s
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p>No recent activity</p>
                  <p className="text-xs mt-1">Run some queries to see activity here</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Active Queries */}
        <Card>
          <CardHeader>
            <CardTitle className="text-gray-900 flex items-center gap-2">
              <Play className="w-4 h-4 text-blue-500" />
              Active Queries
            </CardTitle>
            <CardDescription>Quick actions for your queries</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {queries.slice(0, 5).map((query) => (
                <div key={query.id} className="flex items-center gap-3 p-2 rounded border border-gray-100">
                  <div className="flex-1">
                    <p className="text-xs font-medium text-gray-900">{query.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">
                        {query.category}
                      </Badge>
                      {query.lastRun && (
                        <span className="text-xs text-gray-500">Last: {formatTimeAgo(query.lastRun)}</span>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRunQuery(query.id)}
                    disabled={runningQueries.has(query.id)}
                  >
                    <Play className="w-3 h-3" />
                  </Button>
                </div>
              ))}
              {queries.length === 0 && (
                <div className="text-center py-4 text-gray-500">
                  <p className="text-sm">No queries yet</p>
                  <Link href="/query-builder">
                    <Button size="sm" className="mt-2">
                      Create First Query
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Performance Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-gray-900">Performance Overview</CardTitle>
          <CardDescription>Key metrics and trends over the last 30 days</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Volatility Index</span>
                <span className="text-sm font-medium text-gray-900">{analytics?.volatilityIndex.toFixed(1)}</span>
              </div>
              <Progress value={(analytics?.volatilityIndex || 0) * 10} className="h-2" />
              <p className="text-xs text-gray-500">Low volatility indicates stable rankings</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">New Content Discovery</span>
                <span className="text-sm font-medium text-gray-900">{analytics?.newContentDiscovery.toFixed(1)}%</span>
              </div>
              <Progress value={analytics?.newContentDiscovery || 0} className="h-2" />
              <p className="text-xs text-gray-500">Fresh URLs in top 10 results</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Query Success Rate</span>
                <span className="text-sm font-medium text-gray-900">{analytics?.querySuccessRate.toFixed(1)}%</span>
              </div>
              <Progress value={analytics?.querySuccessRate || 0} className="h-2" />
              <p className="text-xs text-gray-500">Successful API responses</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
