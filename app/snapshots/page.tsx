"use client"

import dynamic from "next/dynamic"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Camera } from "lucide-react"
const SnapshotsFilters = dynamic(() => import("@/components/snapshots/SnapshotsFilters").then(mod => mod.SnapshotsFilters), {
  loading: () => <SnapshotsFiltersSkeleton />, ssr: false,
})
const SnapshotsTable = dynamic(() => import("@/components/snapshots/SnapshotsTable").then(mod => mod.SnapshotsTable), {
  loading: () => <SnapshotsTableSkeleton />, ssr: false,
})
import SnapshotsFiltersSkeleton from "@/components/loaders/SnapshotsFiltersSkeleton"
import SnapshotsTableSkeleton from "@/components/loaders/SnapshotsTableSkeleton"
import { useSnapshotsLogic } from "../../logic/useSnapshotsLogic"

export default function Snapshots() {
  const {
    queries, user, filters, setFilters, selectedQueryId, setSelectedQueryId, creating,
    handleCreateSnapshot, filteredSnapshots, isLoading, formatDate
  } = useSnapshotsLogic()

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="w-96">
          <CardHeader>
            <CardTitle>Authentication Required</CardTitle>
            <CardContent>Please log in to view snapshots.</CardContent>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Ranking Snapshots</h1>
          <p className="text-gray-600 mt-1">Historical search result captures and analysis</p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={selectedQueryId}
            onValueChange={setSelectedQueryId}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select Query" />
            </SelectTrigger>
            <SelectContent>
              {queries.map((q) => (
                <SelectItem key={q.id} value={q.id}>{q.query}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleCreateSnapshot} disabled={creating || !selectedQueryId}>
            <Camera className="w-4 h-4 mr-2" />
            {creating ? "Creating..." : "New Snapshot"}
          </Button>
        </div>
      </div>
      <Card>
        <CardContent className="pt-6">
          <SnapshotsFilters filters={filters} setFilters={setFilters} queries={queries} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-gray-900">Recent Snapshots</CardTitle>
        </CardHeader>
        <CardContent>
          <SnapshotsTable filteredSnapshots={filteredSnapshots} isLoading={isLoading} formatDate={formatDate} />
        </CardContent>
      </Card>
    </div>
  )
}