"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ArrowUp, ArrowDown, Minus, TrendingUp, TrendingDown, GitCompare, Calendar } from "lucide-react"
import { useQueries } from "@/hooks/use-queries"
import { useSnapshots } from "@/hooks/use-snapshots"
import type { RankingChange } from "@/lib/types"

export default function CompareRankings() {
  const { queries } = useQueries()
  const { snapshots } = useSnapshots()
  const [selectedQuery, setSelectedQuery] = useState("")
  const [snapshot1, setSnapshot1] = useState("")
  const [snapshot2, setSnapshot2] = useState("")
  const [comparison, setComparison] = useState<RankingChange[]>([])

  const filteredSnapshots = snapshots.filter((s) => !selectedQuery || s.queryId === selectedQuery)

  const compareSnapshots = () => {
    if (!snapshot1 || !snapshot2) return

    const snap1 = snapshots.find((s) => s.id === snapshot1)
    const snap2 = snapshots.find((s) => s.id === snapshot2)

    if (!snap1 || !snap2) return

    const changes: RankingChange[] = []
    const urlMap1 = new Map(snap1.results.map((r) => [r.url, r]))
    const urlMap2 = new Map(snap2.results.map((r) => [r.url, r]))

    // Check all URLs from both snapshots
    const allUrls = new Set([...urlMap1.keys(), ...urlMap2.keys()])

    allUrls.forEach((url) => {
      const result1 = urlMap1.get(url)
      const result2 = urlMap2.get(url)

      if (result1 && result2) {
        // URL exists in both snapshots
        const positionChange = result1.position - result2.position
        let change: RankingChange["change"] = "stable"

        if (positionChange > 0) change = "moved_up"
        else if (positionChange < 0) change = "moved_down"

        changes.push({
          url,
          title: result2.title,
          previousPosition: result1.position,
          currentPosition: result2.position,
          change,
          changeValue: Math.abs(positionChange),
        })
      } else if (result2) {
        // New URL in snapshot2
        changes.push({
          url,
          title: result2.title,
          currentPosition: result2.position,
          change: "new",
          changeValue: 0,
        })
      } else if (result1) {
        // URL dropped from snapshot2
        changes.push({
          url,
          title: result1.title,
          previousPosition: result1.position,
          change: "dropped",
          changeValue: 0,
        })
      }
    })

    // Sort by current position (or previous position for dropped URLs)
    changes.sort((a, b) => {
      const posA = a.currentPosition || a.previousPosition || 999
      const posB = b.currentPosition || b.previousPosition || 999
      return posA - posB
    })

    setComparison(changes)
  }

  useEffect(() => {
    if (snapshot1 && snapshot2) {
      compareSnapshots()
    }
  }, [snapshot1, snapshot2])

  const getChangeIcon = (change: RankingChange["change"]) => {
    switch (change) {
      case "moved_up":
        return <ArrowUp className="w-4 h-4 text-emerald-500" />
      case "moved_down":
        return <ArrowDown className="w-4 h-4 text-red-500" />
      case "new":
        return <TrendingUp className="w-4 h-4 text-blue-500" />
      case "dropped":
        return <TrendingDown className="w-4 h-4 text-gray-500" />
      default:
        return <Minus className="w-4 h-4 text-gray-400" />
    }
  }

  const getChangeBadge = (change: RankingChange) => {
    switch (change.change) {
      case "moved_up":
        return (
          <Badge variant="default" className="bg-emerald-500">
            +{change.changeValue}
          </Badge>
        )
      case "moved_down":
        return <Badge variant="destructive">-{change.changeValue}</Badge>
      case "new":
        return (
          <Badge variant="default" className="bg-blue-500">
            New
          </Badge>
        )
      case "dropped":
        return <Badge variant="secondary">Dropped</Badge>
      default:
        return <Badge variant="outline">No Change</Badge>
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Compare Rankings</h1>
          <p className="text-gray-600 mt-1">Analyze ranking changes between different snapshots</p>
        </div>
      </div>

      {/* Comparison Setup */}
      <Card>
        <CardHeader>
          <CardTitle className="text-gray-900 flex items-center gap-2">
            <GitCompare className="w-5 h-5" />
            Select Snapshots to Compare
          </CardTitle>
          <CardDescription>Choose two snapshots from the same query to analyze ranking changes</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="text-sm font-medium text-gray-700">Query</label>
              <Select value={selectedQuery} onValueChange={setSelectedQuery}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a query" />
                </SelectTrigger>
                <SelectContent>
                  {queries.map((query) => (
                    <SelectItem key={query.id} value={query.id}>
                      {query.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Baseline Snapshot</label>
              <Select value={snapshot1} onValueChange={setSnapshot1} disabled={!selectedQuery}>
                <SelectTrigger>
                  <SelectValue placeholder="Select baseline" />
                </SelectTrigger>
                <SelectContent>
                  {filteredSnapshots.map((snapshot) => (
                    <SelectItem key={snapshot.id} value={snapshot.id}>
                      {formatDate(snapshot.timestamp.toString())} - {snapshot.results.length} results
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Comparison Snapshot</label>
              <Select value={snapshot2} onValueChange={setSnapshot2} disabled={!selectedQuery}>
                <SelectTrigger>
                  <SelectValue placeholder="Select comparison" />
                </SelectTrigger>
                <SelectContent>
                  {filteredSnapshots.map((snapshot) => (
                    <SelectItem key={snapshot.id} value={snapshot.id}>
                      {formatDate(snapshot.timestamp.toString())} - {snapshot.results.length} results
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Comparison Results */}
      {comparison.length > 0 && (
        <>
          {/* Summary Stats */}
          <div className="grid gap-6 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Total Changes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-gray-900">{comparison.length}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Moved Up</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-emerald-600">
                  {comparison.filter((c) => c.change === "moved_up").length}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Moved Down</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">
                  {comparison.filter((c) => c.change === "moved_down").length}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">New Entries</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">
                  {comparison.filter((c) => c.change === "new").length}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Detailed Comparison Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-gray-900">Ranking Changes</CardTitle>
              <CardDescription>Detailed breakdown of position changes between snapshots</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>URL</TableHead>
                    <TableHead>Previous Position</TableHead>
                    <TableHead>Current Position</TableHead>
                    <TableHead>Change</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {comparison.map((change, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-gray-900 truncate max-w-xs">{change.title}</p>
                          <p className="text-xs text-gray-500 truncate max-w-xs">{change.url}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm font-medium">
                          {change.previousPosition ? `#${change.previousPosition}` : "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm font-medium">
                          {change.currentPosition ? `#${change.currentPosition}` : "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getChangeIcon(change.change)}
                          {change.changeValue > 0 && (
                            <span className="text-sm text-gray-600">{change.changeValue} positions</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{getChangeBadge(change)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {comparison.length === 0 && snapshot1 && snapshot2 && (
        <Card>
          <CardContent className="text-center py-12">
            <GitCompare className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Changes Found</h3>
            <p className="text-gray-500">The selected snapshots have identical rankings.</p>
          </CardContent>
        </Card>
      )}

      {!snapshot1 || !snapshot2 ? (
        <Card>
          <CardContent className="text-center py-12">
            <Calendar className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Select Snapshots to Compare</h3>
            <p className="text-gray-500">Choose a query and two snapshots to analyze ranking changes.</p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
