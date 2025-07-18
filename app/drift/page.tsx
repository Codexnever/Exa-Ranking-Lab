"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DriftTable } from "@/components/driftAnalyzer/drift-table"
import { useDriftStore } from "@/app/store"
import { Loader2, AlertTriangle, Activity } from "lucide-react"

export default function DriftPage() {
  const { driftResults, setDriftResults } = useDriftStore()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchDriftData() {
      try {
        setLoading(true)
        const response = await fetch("/api/drift")
        if (!response.ok) {
          throw new Error("Failed to fetch drift data")
        }
        const data = await response.json()
        setDriftResults(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error")
      } finally {
        setLoading(false)
      }
    }
    fetchDriftData()
  }, [setDriftResults])

  // Calculate summary stats
  const highDriftCount = driftResults.filter((r) => r.latestDrift > 50).length
  const mediumDriftCount = driftResults.filter((r) => r.latestDrift > 20 && r.latestDrift <= 50).length
  const stableCount = driftResults.filter((r) => r.latestDrift <= 20).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Search Drift Radar</h1>
          <p className="text-gray-600 mt-1">Track and analyze semantic drift in search results over time</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              High Drift Queries
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{highDriftCount}</div>
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
            <div className="text-2xl font-bold text-amber-500">{mediumDriftCount}</div>
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
            <div className="text-2xl font-bold text-emerald-600">{stableCount}</div>
            <p className="text-xs text-gray-500 mt-1">Queries with consistent results over time</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Card>
        <CardHeader>
          <CardTitle className="text-gray-900">Query Drift Analysis</CardTitle>
          <CardDescription>Track how search results change over time for your queries</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-12 text-red-500">
              <AlertTriangle className="h-8 w-8 mr-2" />
              <span>{error}</span>
            </div>
          ) : (
            <DriftTable />
          )}
        </CardContent>
      </Card>

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
