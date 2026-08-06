// components/dashboard/PerformanceOverview.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { BarChart3, TrendingUp, TrendingDown, Clock, Target } from "lucide-react"
import type { AnalyticsData, RankingSnapshot } from "@/types/type"
import { useMemo } from "react"
import { formatResponseTime } from "@/hooks/format-response-time"

interface PerformanceOverviewProps {
  analytics: AnalyticsData | null
  snapshots?: RankingSnapshot[]
  isLoading?: boolean
}

/**
 * ✅ Shared, defensive position extraction — replaces the same logic that
 * was previously duplicated (with slightly different styling) inside both
 * the avgPosition useMemo and positionChange's local calculateAvgPosition
 * helper. A single implementation means the "what counts as a valid
 * position" rule only needs to be correct in one place.
 *
 * ✅ Guards snapshot.results being undefined/non-array — the original
 * code called `.forEach` directly on `snapshot.results` in three separate
 * places, each of which would throw and crash the ENTIRE component if any
 * single snapshot had malformed/missing results.
 */
function calculateAvgPositionSafe(snaps: RankingSnapshot[]): number {
  let totalPos = 0
  let count = 0
  for (const snap of snaps) {
    if (!Array.isArray(snap?.results)) continue
    for (const result of snap.results) {
      if (typeof result?.position === "number" && result.position > 0) {
        totalPos += result.position
        count++
      }
    }
  }
  return count > 0 ? totalPos / count : 0
}

export default function PerformanceOverview({
  analytics,
  snapshots = [],
  isLoading = false
}: PerformanceOverviewProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Performance Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="text-center p-4 border rounded-lg">
                <div className="h-8 w-16 bg-gray-200 rounded animate-pulse mx-auto mb-2"></div>
                <div className="h-4 w-24 bg-gray-200 rounded animate-pulse mx-auto mb-1"></div>
                <div className="h-3 w-32 bg-gray-200 rounded animate-pulse mx-auto"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  // ✅ Array.isArray guard — the default param only covers explicit
  // `undefined`; an explicit `null` passed by a caller would bypass it
  // and crash every computation below.
  const safeSnapshots = Array.isArray(snapshots) ? snapshots : []

  const totalSnapshots = safeSnapshots.length
  // ✅ `s.results.length` guarded — a malformed snapshot with missing
  // `results` previously threw here and crashed the whole component.
  const successfulSnapshots = safeSnapshots.filter(
    s => Array.isArray(s?.results) && s.results.length > 0
  ).length
  const successRate = totalSnapshots > 0 ? (successfulSnapshots / totalSnapshots) * 100 : 0

  const avgResponseTime = totalSnapshots > 0
    ? safeSnapshots.reduce((sum, s) => sum + (Number(s?.metadata?.responseTime) || 0), 0) / totalSnapshots
    : 0

  // ✅ Now uses the shared, guarded helper instead of duplicated inline logic
  const avgPosition = useMemo(
    () => calculateAvgPositionSafe(safeSnapshots),
    [safeSnapshots]
  )

  const positionChange = useMemo(() => {
    if (safeSnapshots.length < 2) return 0

    const sortedSnapshots = [...safeSnapshots].sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )

    const mid = Math.floor(sortedSnapshots.length / 2)
    const recentSnapshots = sortedSnapshots.slice(0, mid)
    const olderSnapshots = sortedSnapshots.slice(mid)

    const recentAvg = calculateAvgPositionSafe(recentSnapshots)
    const olderAvg = calculateAvgPositionSafe(olderSnapshots)

    // Positive means improvement (lower position numbers = better rank)
    return olderAvg - recentAvg
  }, [safeSnapshots])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Performance Overview
        </CardTitle>
      </CardHeader>
      <CardContent>
        {totalSnapshots === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No performance data available</p>
            <p className="text-xs">Create some snapshots to see performance metrics</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl font-bold text-green-600 mb-1">
                {successRate.toFixed(1)}%
              </div>
              <div className="text-sm font-medium mb-1">Success Rate</div>
              <div className="text-xs text-gray-500">
                {successfulSnapshots}/{totalSnapshots} snapshots
              </div>
            </div>

            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl font-bold text-blue-600 mb-1 flex items-center justify-center gap-1">
                <Clock className="h-5 w-5" />
                {formatResponseTime(avgResponseTime)}
              </div>
              <div className="text-sm font-medium mb-1">Avg Response</div>
              <div className="text-xs text-gray-500">
                Query execution time
              </div>
            </div>

            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl font-bold text-purple-600 mb-1 flex items-center justify-center gap-1">
                <Target className="h-5 w-5" />
                {avgPosition > 0 ? avgPosition.toFixed(1) : "—"}
              </div>
              <div className="text-sm font-medium mb-1">Avg Position</div>
              <div className="text-xs text-gray-500">
                Ranking performance
              </div>
            </div>
          </div>
        )}

        {analytics && totalSnapshots > 0 && (
          <div className="mt-6 pt-4 border-t">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Performance Trend</span>
              <Badge variant={positionChange >= 0 ? "default" : "destructive"}>
                {/* ✅ Uses the dedicated TrendingDown icon instead of a
                    rotated TrendingUp — matches the icon convention used
                    consistently elsewhere in the app (RankingTrendChart,
                    SERPJourneyFlow). */}
                {positionChange >= 0 ? (
                  <TrendingUp className="h-3 w-3 mr-1" />
                ) : (
                  <TrendingDown className="h-3 w-3 mr-1" />
                )}
                {positionChange !== 0
                  ? `${positionChange > 0 ? '+' : ''}${positionChange.toFixed(1)}`
                  : "No change"
                }
              </Badge>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
