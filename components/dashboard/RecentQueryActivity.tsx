import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatResponseTime } from "@/hooks/format-response-time"
import React from "react"

function formatTimeAgo(date: Date | string) {
  const now = new Date()
  const past = new Date(date)
  const diffMs = now.getTime() - past.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  if (diffHours < 1) return "Just now"
  if (diffHours < 24) return `${diffHours}h ago`
  return `${Math.floor(diffHours / 24)}d ago`
}

export default function RecentQueryActivity({ recentSnapshots, queries }: { recentSnapshots: any[]; queries: any[] }) {
  return (
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
                    {formatResponseTime(snapshot.metadata.responseTime)}
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
