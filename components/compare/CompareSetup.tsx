"use client"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { GitCompare } from "lucide-react"
import type { RankingSnapshot, QueryConfig } from "@/lib/type" // use your actual path

interface CompareSetupProps {
  queries: QueryConfig[]
  selectedQuery: string
  setSelectedQuery: (id: string) => void
  snapshot1: string
  setSnapshot1: (id: string) => void
  snapshot2: string
  setSnapshot2: (id: string) => void
  filteredSnapshots: RankingSnapshot[]
  formatDate: (date: string) => string
}

export function CompareSetup({
  queries,
  selectedQuery,
  setSelectedQuery,
  snapshot1,
  setSnapshot1,
  snapshot2,
  setSnapshot2,
  filteredSnapshots,
  formatDate,
}: CompareSetupProps) {
  return (
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
                {filteredSnapshots.map((snap) => (
                  <SelectItem key={snap.id} value={snap.id}>
                    {formatDate(snap.timestamp.toString())} - {snap.results.length} results
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
                {filteredSnapshots.map((snap) => (
                  <SelectItem key={snap.id} value={snap.id}>
                    {formatDate(snap.timestamp.toString())} - {snap.results.length} results
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}