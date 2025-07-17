"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { DriftSparkline } from "@/components/driftAnalyzer/drift-sparkline"
import { DriftBadge } from "@/components/driftAnalyzer/drift-badge"
import { Search, ArrowUpDown } from "lucide-react"

import { useDriftStore } from "@/app/store"

export function DriftTable() {
  const { driftResults } = useDriftStore()
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState("")
  const [sortBy, setSortBy] = useState<"latestDrift" | "averageDrift" | "maxDrift">("latestDrift")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc")

  // Filter results by search query
  const filteredResults = driftResults.filter((result) =>
    result.queryName.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Sort results
  const sortedResults = [...filteredResults].sort((a, b) => {
    const factor = sortDirection === "asc" ? 1 : -1
    return (a[sortBy] - b[sortBy]) * factor
  })

  // Handle sort toggle
  const toggleSort = (field: "latestDrift" | "averageDrift" | "maxDrift") => {
    if (sortBy === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    } else {
      setSortBy(field)
      setSortDirection("desc")
    }
  }

  // Handle row click
  const handleRowClick = (queryId: string) => {
    router.push(`/drift/${queryId}`)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Search queries..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[300px]">Query</TableHead>
              <TableHead>Drift Timeline</TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex items-center gap-1 -ml-3"
                  onClick={() => toggleSort("latestDrift")}
                >
                  Latest Drift
                  <ArrowUpDown className="h-3 w-3" />
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex items-center gap-1 -ml-3"
                  onClick={() => toggleSort("averageDrift")}
                >
                  Avg Drift
                  <ArrowUpDown className="h-3 w-3" />
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex items-center gap-1 -ml-3"
                  onClick={() => toggleSort("maxDrift")}
                >
                  Max Drift
                  <ArrowUpDown className="h-3 w-3" />
                </Button>
              </TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedResults.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  No drift data available
                </TableCell>
              </TableRow>
            ) : (
              sortedResults.map((result) => (
                <TableRow
                  key={result.queryId}
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => handleRowClick(result.queryId)}
                >
                  <TableCell className="font-medium">{result.queryName}</TableCell>
                  <TableCell className="w-[200px]">
                    <DriftSparkline driftTimeline={result.driftTimeline} />
                  </TableCell>
                  <TableCell>{result.latestDrift.toFixed(1)}</TableCell>
                  <TableCell>{result.averageDrift.toFixed(1)}</TableCell>
                  <TableCell>{result.maxDrift.toFixed(1)}</TableCell>
                  <TableCell>
                    <DriftBadge driftScore={result.latestDrift} trend={result.driftTrend} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
