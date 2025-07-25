// components/dashboard/ActiveQueries.tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Play, Loader2 } from "lucide-react"
import Link from "next/link"
import React from "react"
import type { QueryConfig } from "@/lib/type"

function formatTimeAgo(date: Date | string) {
  const now = new Date()
  const past = new Date(date)
  const diffMs = now.getTime() - past.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  if (diffHours < 1) return "Just now"
  if (diffHours < 24) return `${diffHours}h ago`
  return `${Math.floor(diffHours / 24)}d ago`
}

// ✅ Updated interface to include new props
interface ActiveQueriesProps {
  queries: QueryConfig[]
  runningQueries: Set<string>
  handleRunQuery: (queryId: string) => Promise<void> // ✅ Updated to async
  isLoading?: boolean // ✅ Add missing isLoading prop
}

export default function ActiveQueries({ 
  queries, 
  runningQueries, 
  handleRunQuery,
  isLoading = false 
}: ActiveQueriesProps) {
  // Show loading skeleton if data is loading
  if (isLoading) {
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
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-2 rounded border border-gray-100">
                <div className="flex-1">
                  <div className="h-4 w-32 bg-gray-200 rounded animate-pulse mb-2"></div>
                  <div className="h-3 w-20 bg-gray-200 rounded animate-pulse"></div>
                </div>
                <div className="h-8 w-12 bg-gray-200 rounded animate-pulse"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

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
          {queries.slice(0, 5).map((query) => {
            const isRunning = runningQueries.has(query.id)
            return (
              <div key={query.id} className="flex items-center gap-3 p-2 rounded border border-gray-100 hover:bg-gray-50">
                <div className="flex-1">
                  <p className="text-xs font-medium text-gray-900 truncate max-w-40">
                    {query.name || query.query}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">
                      {query.category}
                    </Badge>
                    {query.lastRun && (
                      <span className="text-xs text-gray-500">
                        Last: {formatTimeAgo(query.lastRun)}
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleRunQuery(query.id)}
                  disabled={isRunning}
                  className="gap-1"
                >
                  {isRunning ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Running
                    </>
                  ) : (
                    <>
                      <Play className="w-3 h-3" />
                      Run
                    </>
                  )}
                </Button>
              </div>
            )
          })}
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
