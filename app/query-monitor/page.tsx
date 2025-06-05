"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useQueries } from "@/hooks/use-queries"
import QueryExecutionStatus from "@/components/query-execution-status"
import { Play, Pause, RotateCcw } from "lucide-react"
import { toast } from "sonner"

export default function QueryMonitor() {
  const { queries, runQuery } = useQueries()
  const [executionStates, setExecutionStates] = useState<Map<string, any>>(new Map())
  const [isMonitoring, setIsMonitoring] = useState(false)

  const handleRunQuery = async (queryId: string) => {
    setExecutionStates((prev) =>
      new Map(prev).set(queryId, {
        status: "running",
        progress: 0,
        startTime: Date.now(),
      }),
    )

    // Simulate progress updates
    const progressInterval = setInterval(() => {
      setExecutionStates((prev) => {
        const current = prev.get(queryId)
        if (current?.status === "running" && current.progress < 90) {
          return new Map(prev).set(queryId, {
            ...current,
            progress: current.progress + Math.random() * 20,
          })
        }
        return prev
      })
    }, 500)

    try {
      const result = await runQuery(queryId)
      clearInterval(progressInterval)

      setExecutionStates((prev) =>
        new Map(prev).set(queryId, {
          status: "success",
          progress: 100,
          results: {
            totalResults: result?.results?.length ?? 0,
            responseTime: result?.metadata?.responseTime ?? 0,
            timestamp: result?.timestamp ? new Date(result.timestamp) : new Date(),
          },
        }),
      )

      toast.success(`Query "${queries.find((q) => q.id === queryId)?.name}" completed successfully!`)
    } catch (error) {
      clearInterval(progressInterval)

      setExecutionStates((prev) =>
        new Map(prev).set(queryId, {
          status: "error",
          progress: 0,
          error: error instanceof Error ? error.message : "Unknown error",
        }),
      )

      toast.error(`Query "${queries.find((q) => q.id === queryId)?.name}" failed`)
    }
  }

  const handleRunAllQueries = async () => {
    setIsMonitoring(true)
    const activeQueries = queries.filter((q) => q.schedule.enabled)

    for (const query of activeQueries) {
      await handleRunQuery(query.id)
      // Add delay between queries to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }

    setIsMonitoring(false)
  }

  const handleRetryQuery = (queryId: string) => {
    handleRunQuery(queryId)
  }

  const handleClearResults = () => {
    setExecutionStates(new Map())
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Query Monitor</h1>
          <p className="text-gray-600 mt-1">Real-time query execution monitoring and management</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={handleClearResults} disabled={executionStates.size === 0}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Clear Results
          </Button>
          <Button
            onClick={handleRunAllQueries}
            disabled={isMonitoring || queries.filter((q) => q.schedule.enabled).length === 0}
          >
            {isMonitoring ? (
              <>
                <Pause className="w-4 h-4 mr-2" />
                Running...
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Run All Scheduled
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid gap-6 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total Queries</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{queries.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Scheduled</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{queries.filter((q) => q.schedule.enabled).length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Running</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {Array.from(executionStates.values()).filter((state) => state.status === "running").length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              {Array.from(executionStates.values()).filter((state) => state.status === "success").length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Query Execution Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {queries.map((query) => {
          const executionState = executionStates.get(query.id) || { status: "idle" }

          return (
            <QueryExecutionStatus
              key={query.id}
              queryId={query.id}
              queryName={query.name}
              status={executionState.status}
              progress={executionState.progress}
              error={executionState.error}
              results={executionState.results}
              onRetry={() => handleRetryQuery(query.id)}
            />
          )
        })}
      </div>

      {queries.length === 0 && (
        <Card>
          <CardContent className="text-center py-12">
            <div className="text-gray-500">
              <Play className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <h3 className="text-lg font-medium mb-2">No Queries Found</h3>
              <p className="text-sm">Create some queries to start monitoring their execution.</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
