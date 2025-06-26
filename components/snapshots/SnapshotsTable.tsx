import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Calendar, Clock } from "lucide-react"
import type { RankingSnapshot, QueryConfig } from "@/lib/types"
import { formatResponseTime } from "@/hooks/format-response-time"

interface SnapshotsTableProps {
  filteredSnapshots: (RankingSnapshot & { queryInfo: QueryConfig | null })[]
  isLoading: boolean
  formatDate: (date: Date | string) => string
}

export function SnapshotsTable({ filteredSnapshots, isLoading, formatDate }: SnapshotsTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Query</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Captured</TableHead>
          <TableHead>Results</TableHead>
          <TableHead>Response Time</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading ? (
          <TableRow>
            <TableCell colSpan={7} className="text-center py-8">
              Loading snapshots...
            </TableCell>
          </TableRow>
        ) : filteredSnapshots.length === 0 ? (
          <TableRow>
            <TableCell colSpan={7} className="text-center py-8">
              No snapshots found
            </TableCell>
          </TableRow>
        ) : (
          filteredSnapshots.map((snapshot) => (
            <TableRow key={snapshot.id}>
              <TableCell>
                <div>
                  <p className="font-medium text-gray-900">{snapshot.queryInfo?.query || "Unknown Query"}</p>
                  <p className="text-xs text-gray-500 font-mono">{snapshot.id}</p>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="capitalize">
                  {snapshot.queryInfo?.category || "unknown"}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Calendar className="w-3 h-3" />
                  {formatDate(snapshot.timestamp)}
                </div>
              </TableCell>
              <TableCell>
                <span className="text-sm font-medium">
                  {snapshot.results.length > 0 ? snapshot.results.length : "—"}
                </span>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Clock className="w-3 h-3 text-gray-400" />
                  <span className="text-sm">
                    {formatResponseTime(snapshot.metadata.responseTime)}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <Badge
                  variant={
                    snapshot.results.length > 0
                      ? "default"
                      : "destructive"
                  }
                  className="capitalize"
                >
                  {snapshot.results.length > 0 ? "Completed" : "Failed"}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                {/* Actions can be added here */}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  )
}
