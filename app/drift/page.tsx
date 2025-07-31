"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DriftTable } from "@/components/driftAnalyzer/drift-table"
import { useDriftStore } from "@/app/store"
import { useAuth } from "@/lib/contexts/auth-context"
import { Loader2, AlertTriangle, Activity, RefreshCw, Clock, Zap, TrendingUp } from "lucide-react"
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

  // ✅ FIXED: Safe guard driftResults to always be an array
  const safeDriftResults = useMemo(() => {
    return Array.isArray(driftResults) ? driftResults : []
  }, [driftResults])

  // Enhanced summary stats with content change tracking - FIXED
  const summaryStats = useMemo(() => {
    // ✅ Use safeDriftResults instead of driftResults
    const highDriftCount = safeDriftResults.filter((r) => r?.latestDrift > 50).length
    const mediumDriftCount = safeDriftResults.filter((r) => r?.latestDrift > 20 && r?.latestDrift <= 50).length
    const stableCount = safeDriftResults.filter((r) => r?.latestDrift <= 20).length
    
    // ✅ New metrics with null safety
    const totalContentChanges = safeDriftResults.reduce((sum, r) => sum + (r?.totalContentChanges || 0), 0)
    const averageProcessingTime = safeDriftResults.length > 0 
      ? safeDriftResults.reduce((sum, r) => sum + (r?.totalProcessingTime || 0), 0) / safeDriftResults.length
      : 0
    const averageCacheHitRate = safeDriftResults.length > 0
      ? safeDriftResults.reduce((sum, r) => sum + (r?.averageCacheHitRate || 0), 0) / safeDriftResults.length
      : 0
    
    return { 
      highDriftCount, 
      mediumDriftCount, 
      stableCount,
      totalContentChanges,
      averageProcessingTime,
      averageCacheHitRate
    }
  }, [safeDriftResults]) // ✅ Use safeDriftResults in dependency

  // Enhanced cache info
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

  // ✅ FIXED: Use safeDriftResults.length instead of driftResults.length
  const showInitialLoading = isLoading && safeDriftResults.length === 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Search Drift Radar</h1>
          <p className="text-gray-600 mt-1">Track semantic drift in search results with content hash analysis</p>
          {lastUpdated && (
            <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
              <span>{cacheInfo}</span>
              {isCacheValid && isCacheValid() && <Badge variant="outline" className="text-green-600">Cache Valid</Badge>}
              {isCacheValid && !isCacheValid() && <Badge variant="outline" className="text-amber-600">Cache Expired</Badge>}
              {summaryStats.averageProcessingTime > 0 && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Avg: {summaryStats.averageProcessingTime.toFixed(0)}ms
                </span>
              )}
              {summaryStats.averageCacheHitRate > 0 && (
                <span className="flex items-center gap-1">
                  <Zap className="w-3 h-3" />
                  Cache: {(summaryStats.averageCacheHitRate * 100).toFixed(0)}%
                </span>
              )}
            </div>
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

      {/* Enhanced Summary Cards */}
      {!showInitialLoading && (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                High Drift Queries
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{summaryStats.highDriftCount}</div>
              <p className="text-xs text-gray-500 mt-1">Significant semantic changes detected</p>
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
              <p className="text-xs text-gray-500 mt-1">Moderate semantic changes detected</p>
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
              <p className="text-xs text-gray-500 mt-1">Consistent results over time</p>
            </CardContent>
          </Card>

          {/* ✅ New Content Changes Card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-500" />
                Content Changes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{summaryStats.totalContentChanges}</div>
              <p className="text-xs text-gray-500 mt-1">Total content modifications detected</p>
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
          <CardDescription>
            Track how search results change over time with enhanced content hash analysis
          </CardDescription>
        </CardHeader>
        <CardContent>
          {showInitialLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              <span className="ml-2 text-gray-600">Analyzing drift patterns...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12 text-red-500">
              <AlertTriangle className="h-8 w-8 mb-2" />
              <span className="mb-4">{error}</span>
              <Button onClick={handleRefresh} variant="outline" size="sm">
                Try Again
              </Button>
            </div>
          ) : safeDriftResults.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-gray-500">
              <Activity className="h-8 w-8 mb-2" />
              <div className="text-center">
                <p className="mb-2">No drift data available</p>
                <p className="text-sm">Create queries and snapshots to see drift analysis</p>
              </div>
            </div>
          ) : (
            <DriftTable />
          )}
        </CardContent>
      </Card>

      {/* Enhanced Understanding Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-gray-900">Understanding Enhanced Drift Score</CardTitle>
          <CardDescription>How to interpret semantic drift metrics with content hash analysis</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>
            The <strong>Enhanced Drift Score</strong> uses content hash fingerprinting and semantic similarity to measure changes:
          </p>

          <ul className="list-disc pl-6 space-y-2">
            <li>
              <strong>Content Hash Analysis</strong> - Instantly detects content changes without expensive calculations
            </li>
            <li>
              <strong>Position changes</strong> - How much results have moved up or down in rankings
            </li>
            <li>
              <strong>Semantic similarity</strong> - AI-powered content similarity analysis with caching
            </li>
            <li>
              <strong>Content modifications</strong> - Tracks when result content itself changes (not just position)
            </li>
            <li>
              <strong>Performance optimization</strong> - Smart caching reduces calculation time by up to 80%
            </li>
          </ul>

          <div className="grid gap-4 md:grid-cols-3 mt-4">
            <div className="p-3 border rounded-lg border-emerald-200 bg-emerald-50">
              <div className="font-medium text-emerald-700">0-20: Stable</div>
              <p className="text-sm text-emerald-600">Minimal changes in content or position</p>
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

          {/* ✅ New Performance Metrics Section */}
          <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h4 className="font-medium text-blue-900 mb-2">Performance Optimizations</h4>
            <div className="grid gap-2 md:grid-cols-2 text-sm text-blue-700">
              <div>✅ Content hash fingerprinting for instant change detection</div>
              <div>✅ Smart embedding cache with 24h TTL</div>
              <div>✅ Batch similarity processing for efficiency</div>
              <div>✅ Cache hit rates typically 70-90% after initial analysis</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
