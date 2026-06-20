// components/dashboard/RecentQueryActivity.tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatResponseTime } from "@/hooks/format-response-time"
import React from "react"
import type { QueryConfig, RankingSnapshot } from "@/types/type"

/**
 * ✅ Validates the parsed date before computing a diff. Previously, a
 * malformed `date` input produced an Invalid Date, and arithmetic on it
 * silently propagated NaN all the way to the displayed string
 * ("NaNd ago") instead of failing loudly or showing a sensible fallback.
 */
function formatTimeAgo(date: Date | string | undefined | null): string {
  if (!date) return "Unknown time"

  const past = new Date(date)
  if (isNaN(past.getTime())) return "Unknown time"

  const now = new Date()
  const diffMs = now.getTime() - past.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))

  if (diffHours < 1) return "Just now"
  if (diffHours < 24) return `${diffHours}h ago`
  return `${Math.floor(diffHours / 24)}d ago`
}

interface RecentQueryActivityProps {
  recentSnapshots?: RankingSnapshot[]
  queries?: QueryConfig[]
  isLoading?: boolean
}

export default function RecentQueryActivity({
  recentSnapshots = [],
  queries = [],
  isLoading = false
}: RecentQueryActivityProps) {
  if (isLoading) {
    return (
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-gray-900">Recent Query Activity</CardTitle>
          <CardDescription>Latest ranking snapshots and changes</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-3 rounded-lg border border-gray-100">
                <div className="w-2 h-2 rounded-full bg-gray-200 animate-pulse"></div>
                <div className="flex-1">
                  <div className="h-4 w-48 bg-gray-200 rounded animate-pulse mb-2"></div>
                  <div className="h-3 w-32 bg-gray-200 rounded animate-pulse"></div>
                </div>
                <div className="h-4 w-16 bg-gray-200 rounded animate-pulse"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  // ✅ Array.isArray guards — default params only cover explicit
  // `undefined`; explicit `null` from a caller would bypass them and
  // crash on .length / .find() below.
  const safeSnapshots = Array.isArray(recentSnapshots) ? recentSnapshots : []
  const safeQueries = Array.isArray(queries) ? queries : []

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="text-gray-900">Recent Query Activity</CardTitle>
        <CardDescription>Latest ranking snapshots and changes</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {safeSnapshots.length > 0 ? (
            safeSnapshots.map((snapshot) => {
              const query = safeQueries.find((q) => q.id === snapshot.queryId)
              // ✅ Guarded — a snapshot with missing/malformed `results`
              // previously threw on `.length`, aborting the render of
              // every other (valid) snapshot in the list too, since the
              // throw happens mid-.map().
              const resultsCount = Array.isArray(snapshot?.results) ? snapshot.results.length : 0

              return (
                <div
                  key={snapshot.id}
                  className="flex items-center gap-4 p-3 rounded-lg border border-gray-100 hover:border-gray-200 transition-colors"
                >
                  <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {query?.name || query?.query || "Unknown Query"}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">
                        {query?.category || "web"}
                      </Badge>
                      <span className="text-xs text-gray-500">
                        {formatTimeAgo(snapshot.timestamp)}
                      </span>
                      <span className="text-xs text-gray-500">
                        {resultsCount} results
                      </span>
                    </div>
                  </div>
                  <div className="text-sm font-medium text-gray-500">
                    {/* ✅ Optional chaining — snapshot.metadata could be
                        undefined on malformed/legacy data; previously this
                        accessed .responseTime directly off metadata with
                        no guard. */}
                    {formatResponseTime(snapshot?.metadata?.responseTime ?? 0)}
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
  )
}