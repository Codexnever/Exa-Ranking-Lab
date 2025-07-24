"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { DriftTable } from "@/components/driftAnalyzer/drift-table"
import { useDriftStore } from "@/app/store"
import { useAuth } from "@/lib/contexts/auth-context"
import { Loader2, AlertTriangle, Activity, RefreshCw } from "lucide-react"
import { toast } from "sonner"

export default function DriftPage() {
  const { userId } = useAuth()
  const { 
    driftResults, 
    isLoading, 
    error, 
    lastUpdated,
    fetchDriftResults,
    isCacheValid 
  } = useDriftStore()
  
  const [isManualRefresh, setIsManualRefresh] = useState(false)

  // Memoized summary stats to prevent recalculation
  const summaryStats = useMemo(() => {
    const highDriftCount = driftResults.filter((r) => r.latestDrift > 50).length
    const mediumDriftCount = driftResults.filter((r) => r.latestDrift > 20 && r.latestDrift <= 50).length
    const stableCount = driftResults.filter((r) => r.latestDrift <= 20).length
    
    return { highDriftCount, mediumDriftCount, stableCount }
  }, [driftResults])

  // Memoized cache info
  const cacheInfo = useMemo(() => {
    if (!lastUpdated) return "No data cached"
    
    const timeAgo = Date.now() - lastUpdated
    const minutes = Math.floor(timeAgo / (1000 * 60))
    const seconds = Math.floor((timeAgo % (1000 * 60)) / 1000)
    
    if (minutes > 0) {
      return `Updated ${minutes}m ${seconds}s ago`
    }
    return `Updated ${seconds}s ago`
  }, [lastUpdated])

  // Initial data fetch with caching logic
  useEffect(() => {
    if (!userId) return

    const loadDriftData = async () => {
      try {
        // This will use cache if valid, or fetch if needed
        await fetchDriftResults(userId, false)
      } catch (error) {
        console.error('Failed to load drift data:', error)
      }
    }

    loadDriftData()
  }, [userId, fetchDriftResults])

  // Manual refresh handler
  const handleRefresh = useCallback(async () => {
    if (!userId || isLoading) return
    
    setIsManualRefresh(true)
    try {
      await fetchDriftResults(userId, true) // Force refresh
      toast.success("Drift data refreshed successfully")
    } catch (error) {
      toast.error("Failed to refresh drift data")
    } finally {
      setIsManualRefresh(false)
    }
  }, [userId, isLoading, fetchDriftResults])

  // Show initial loading only if no cached data
  const showInitialLoading = isLoading && driftResults.length === 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Search Drift Radar</h1>
          <p className="text-gray-600 mt-1">Track and analyze semantic drift in search results over time</p>
          {lastUpdated && (
            <p className="text-sm text-gray-500 mt-1 flex items-center gap-2">
              {cacheInfo}
              {isCacheValid() && <span className="text-green-600">• Cache valid</span>}
              {!isCacheValid() && <span className="text-amber-600">• Cache expired</span>}
            </p>
          )}
        </div>
        
        <Button
          onClick={handleRefresh}
          disabled={isLoading || isManualRefresh}
          variant="outline"
          size="sm"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${(isLoading || isManualRefresh) ? 'animate-spin' : ''}`} />
          {isManualRefresh ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      {/* Summary Cards - Only show if we have data */}
      {!showInitialLoading && (
        <div className="grid gap-6 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                High Drift Queries
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{summaryStats.highDriftCount}</div>
              <p className="text-xs text-gray-500 mt-1">Queries with significant semantic changes</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                <Activity className="w-4 h-4 text-amber-500" />
                Medium Drift Queries
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-500">{summaryStats.mediumDriftCount}</div>
              <p className="text-xs text-gray-500 mt-1">Queries with moderate semantic changes</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-500" />
                Stable Queries
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600">{summaryStats.stableCount}</div>
              <p className="text-xs text-gray-500 mt-1">Queries with consistent results over time</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Content */}
      <Card>
        <CardHeader>
          <CardTitle className="text-gray-900 flex items-center justify-between">
            Query Drift Analysis
            {isLoading && !showInitialLoading && (
              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            )}
          </CardTitle>
          <CardDescription>Track how search results change over time for your queries</CardDescription>
        </CardHeader>
        <CardContent>
          {showInitialLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              <span className="ml-2 text-gray-600">Loading drift analysis...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12 text-red-500">
              <AlertTriangle className="h-8 w-8 mb-2" />
              <span className="mb-4">{error}</span>
              <Button onClick={handleRefresh} variant="outline" size="sm">
                Try Again
              </Button>
            </div>
          ) : driftResults.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-gray-500">
              <Activity className="h-8 w-8 mb-2" />
              <div className="text-center">
                <p className="mb-2">No drift data available</p>
                <p className="text-sm">Create some queries and snapshots to see drift analysis</p>
              </div>
            </div>
          ) : (
            <DriftTable />
          )}
        </CardContent>
      </Card>

      {/* Understanding Drift Score section remains the same */}
      <Card>
        <CardHeader>
          <CardTitle className="text-gray-900">Understanding Drift Score</CardTitle>
          <CardDescription>How to interpret the semantic drift metrics</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>
            The <strong>Drift Score</strong> measures how much the search results for a query have changed between
            snapshots. It considers:
          </p>

          <ul className="list-disc pl-6 space-y-2">
            <li>
              <strong>Position changes</strong> - How much results have moved up or down in rankings
            </li>
            <li>
              <strong>Semantic similarity</strong> - How similar the content of results is between snapshots
            </li>
            <li>
              <strong>New and dropped results</strong> - Results that appear or disappear between snapshots
            </li>
          </ul>

          <div className="grid gap-4 md:grid-cols-3 mt-4">
            <div className="p-3 border rounded-lg border-emerald-200 bg-emerald-50">
              <div className="font-medium text-emerald-700">0-20: Stable</div>
              <p className="text-sm text-emerald-600">Results are consistent with minimal changes</p>
            </div>

            <div className="p-3 border rounded-lg border-amber-200 bg-amber-50">
              <div className="font-medium text-amber-700">21-50: Medium Drift</div>
              <p className="text-sm text-amber-600">Noticeable changes in ranking or content</p>
            </div>

            <div className="p-3 border rounded-lg border-red-200 bg-red-50">
              <div className="font-medium text-red-700">51-100: High Drift</div>
              <p className="text-sm text-red-600">Significant changes in results or interpretation</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
