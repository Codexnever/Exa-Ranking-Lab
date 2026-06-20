// components/dashboard/DashboardStats.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { BarChart3, TrendingUp, TrendingDown, Clock, Globe, CheckCircle } from "lucide-react"
import { formatResponseTime } from "@/hooks/format-response-time"
import React, { useMemo } from "react"
import { useAvgResponseTimeImprovement } from "@/app/logic/useAvgResponseTimeImprovement"
import { useSnapshotsStore } from "@/app/store"
import type { QueryConfig, AnalyticsData, RankingSnapshot } from "@/types/type"

interface DashboardStatsProps {
  queries?: QueryConfig[]
  analytics: AnalyticsData | null
  isLoading?: boolean
}

/**
 * ✅ Computes average response time directly from raw snapshots, the
 * same source useAvgResponseTimeImprovement already correctly uses below.
 *
 * Root cause this avoids: neither analyticsLogic.ts (Traditional mode)
 * nor WeaviateAnalyticsService.ts (AI mode) ever write a top-level
 * `avgResponseTime` field onto the analytics object — it was only ever
 * computed locally inside analytics-page.tsx's performanceSummary
 * useMemo and never shared. `analytics?.avgResponseTime` here always
 * read undefined/0. Same root bug found and fixed in AnalyticsAPIs.tsx.
 *
 * Deriving from `allSnapshots` (rather than patching the analytics
 * object again) also fixes a SECOND issue: it makes the headline number
 * and the improvementMs trend indicator below it share the exact same
 * data source, so they can never silently disagree with each other.
 */
function calculateAvgResponseTime(snapshots: RankingSnapshot[]): number {
  if (!Array.isArray(snapshots) || snapshots.length === 0) return 0
  const valid = snapshots.filter(
    (s): s is RankingSnapshot & { metadata: { responseTime: number } } =>
      typeof s?.metadata?.responseTime === "number" && s.metadata.responseTime > 0
  )
  if (valid.length === 0) return 0
  return valid.reduce((sum, s) => sum + s.metadata.responseTime, 0) / valid.length
}

export default function DashboardStats({
  queries = [],
  analytics,
  isLoading = false
}: DashboardStatsProps) {
  const allSnapshots = useSnapshotsStore(state => state.allSnapshots)
  // ✅ Defensive default — guards against a transient undefined store value
  const safeAllSnapshots = Array.isArray(allSnapshots) ? allSnapshots : []

  const { improvementMs, prevAvg, currAvg } = useAvgResponseTimeImprovement(safeAllSnapshots, 5)

  // ✅ Array.isArray guard on queries — no default param previously,
  // so an explicit undefined/null from a caller would crash on
  // `.length`/`.filter()` below. Now has both a default param AND this
  // guard for explicit-null safety.
  const safeQueries = Array.isArray(queries) ? queries : []

  // ✅ Real, derived avgResponseTime — replaces the broken
  // analytics?.avgResponseTime field read (see function doc above).
  const avgResponseTime = useMemo(
    () => calculateAvgResponseTime(safeAllSnapshots),
    [safeAllSnapshots]
  )

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

  // ✅ Single derived value, using ?? consistently (not || ) so a
  // legitimate 0 reading is never confused with "missing data"
  const rankingStability = analytics?.rankingStability ?? 0
  const domainDiversity = analytics?.domainDiversity ?? 0

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
          <CardTitle className="text-sm font-medium text-gray-600">Active Queries</CardTitle>
          <BarChart3 className="w-4 h-4 text-blue-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-gray-900">{safeQueries.length}</div>
          <p className="text-xs text-emerald-600 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />
            {safeQueries.filter((q) => q.schedule?.enabled).length} scheduled
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
            {rankingStability.toFixed(1)}%
          </div>
          <Progress value={rankingStability} className="mt-2" />
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
            {/* ✅ Now shows a real value derived from actual snapshots,
                not a permanently-zero phantom field */}
            {formatResponseTime(avgResponseTime)}
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
            {domainDiversity.toFixed(1)}
          </div>
          {/*  FIX: label corrected — this is a Shannon-entropy-based
              0-100 score (WeaviateAnalyticsService.computeDomainDiversity),
              not a raw count of unique domains. Same mislabeling issue
              found and fixed in AnalyticsAPIs.tsx. */}
          <p className="text-xs text-gray-500">Domain distribution evenness (0–100)</p>
        </CardContent>
      </Card>
    </div>
  )
}