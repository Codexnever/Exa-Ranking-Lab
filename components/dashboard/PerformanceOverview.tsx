// components/dashboard/PerformanceOverview.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { BarChart3, TrendingUp, Clock, Target } from "lucide-react"
import type { AnalyticsData, RankingSnapshot } from "@/lib/type"
import { useMemo } from "react"

// ✅ Updated interface to include new props
interface PerformanceOverviewProps {
  analytics: AnalyticsData | null
  snapshots?: RankingSnapshot[] // ✅ Optional snapshots prop
  isLoading?: boolean // ✅ Optional loading prop
}

export default function PerformanceOverview({ 
  analytics, 
  snapshots = [], 
  isLoading = false 
}: PerformanceOverviewProps) {
  // Show loading skeleton if data is loading
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

  // Calculate performance metrics
  const totalSnapshots = snapshots.length
  const successfulSnapshots = snapshots.filter(s => s.results.length > 0).length
  const successRate = totalSnapshots > 0 ? (successfulSnapshots / totalSnapshots) * 100 : 0
  
  const avgResponseTime = snapshots.length > 0 
    ? snapshots.reduce((sum, s) => sum + (s.metadata.responseTime || 0), 0) / snapshots.length 
    : 0

  // ✅ Calculate average position from snapshots since it might not be in analytics
  const avgPosition = useMemo(() => {
    if (snapshots.length === 0) return 0
    
    let totalPositions = 0
    let totalResults = 0
    
    snapshots.forEach(snapshot => {
      snapshot.results.forEach(result => {
        if (result.position && result.position > 0) {
          totalPositions += result.position
          totalResults++
        }
      })
    })
    
    return totalResults > 0 ? totalPositions / totalResults : 0
  }, [snapshots])

  // ✅ Calculate position change from recent snapshots
  const positionChange = useMemo(() => {
    if (snapshots.length < 2) return 0
    
    const sortedSnapshots = [...snapshots].sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
    
    const recentSnapshots = sortedSnapshots.slice(0, Math.floor(sortedSnapshots.length / 2))
    const olderSnapshots = sortedSnapshots.slice(Math.floor(sortedSnapshots.length / 2))
    
    const calculateAvgPosition = (snaps: RankingSnapshot[]) => {
      let totalPos = 0
      let count = 0
      snaps.forEach(snap => {
        snap.results.forEach(result => {
          if (result.position && result.position > 0) {
            totalPos += result.position
            count++
          }
        })
      })
      return count > 0 ? totalPos / count : 0
    }
    
    const recentAvg = calculateAvgPosition(recentSnapshots)
    const olderAvg = calculateAvgPosition(olderSnapshots)
    
    return olderAvg - recentAvg // Positive means improvement (lower position numbers)
  }, [snapshots])

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
                {avgResponseTime.toFixed(0)}ms
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

        {/* Additional performance insights */}
        {analytics && totalSnapshots > 0 && (
          <div className="mt-6 pt-4 border-t">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Performance Trend</span>
              <Badge variant={positionChange >= 0 ? "default" : "destructive"}>
                {positionChange >= 0 ? (
                  <TrendingUp className="h-3 w-3 mr-1" />
                ) : (
                  <TrendingUp className="h-3 w-3 mr-1 rotate-180" />
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
