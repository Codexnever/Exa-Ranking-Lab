// components/dashboard/DashboardStats.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { BarChart3, TrendingUp, TrendingDown, Clock, Globe, CheckCircle } from "lucide-react"
import { formatResponseTime } from "@/hooks/format-response-time"
import React from "react"
import { useAvgResponseTimeImprovement } from "@/app/logic/useAvgResponseTimeImprovement"
import { useSnapshotsStore } from "@/app/store"
import type { QueryConfig, AnalyticsData } from "@/lib/type"

// ✅ Updated interface to include new props
interface DashboardStatsProps {
  queries: QueryConfig[]
  analytics: AnalyticsData | null
  isLoading?: boolean // ✅ Add missing isLoading prop
}

export default function DashboardStats({ 
  queries, 
  analytics, 
  isLoading = false 
}: DashboardStatsProps) {
  // ✅ Use allSnapshots instead of snapshots
  const allSnapshots = useSnapshotsStore(state => state.allSnapshots)
  const { improvementMs, prevAvg, currAvg } = useAvgResponseTimeImprovement(allSnapshots, 5)

  // Show loading skeleton if data is loading
  if (isLoading) {
    return (
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <div className="h-4 w-24 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-4 w-4 bg-gray-200 rounded animate-pulse"></div>
            </CardHeader>
            <CardContent>
              <div className="h-8 w-16 bg-gray-200 rounded animate-pulse mb-1"></div>
              <div className="h-3 w-32 bg-gray-200 rounded animate-pulse"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
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
            {queries.filter((q) => q.schedule?.enabled).length} scheduled
          </p>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
          <CardTitle className="text-sm font-medium text-gray-600">Ranking Stability</CardTitle>
          <CheckCircle className="w-4 h-4 text-emerald-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-gray-900">
            {analytics?.rankingStability?.toFixed(1) || "0.0"}%
          </div>
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
          <div className="text-2xl font-bold text-gray-900">
            {formatResponseTime(analytics?.avgResponseTime ?? 0)}
          </div>
          <p className={`text-xs flex items-center gap-1 mt-1 ${
            improvementMs > 0 ? 'text-emerald-600' : 
            improvementMs < 0 ? 'text-rose-600' : 'text-gray-400'
          }`}> 
            {improvementMs > 0 ? (
              <TrendingDown className="w-3 h-3" />
            ) : improvementMs < 0 ? (
              <TrendingUp className="w-3 h-3" />
            ) : (
              <Clock className="w-3 h-3" />
            )} 
            {improvementMs > 0 
              ? `-${Math.abs(Math.round(improvementMs))}ms improvement` 
              : improvementMs < 0 
                ? `+${Math.abs(Math.round(improvementMs))}ms slower` 
                : 'No change'
            }
            <span className="ml-2 text-gray-400">
              (Prev: {formatResponseTime(prevAvg)}, Now: {formatResponseTime(currAvg)})
            </span>
          </p>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
          <CardTitle className="text-sm font-medium text-gray-600">Domain Diversity</CardTitle>
          <Globe className="w-4 h-4 text-amber-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-gray-900">
            {analytics?.domainDiversity || 0}
          </div>
          <p className="text-xs text-gray-500">Unique domains tracked</p>
        </CardContent>
      </Card>
    </div>
  )
}
