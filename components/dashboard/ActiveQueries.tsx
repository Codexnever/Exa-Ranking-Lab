import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Play } from "lucide-react"
import Link from "next/link"
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

export default function ActiveQueries({ queries, runningQueries, handleRunQuery }: {
  queries: any[]
  runningQueries: Set<string>
  handleRunQuery: (queryId: string) => void
}) {
  return (
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
  )
}
