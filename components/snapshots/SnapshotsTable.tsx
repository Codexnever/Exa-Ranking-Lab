// components/snapshots/SnapshotsTable.tsx
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Calendar, Clock, ChevronLeft, ChevronRight } from "lucide-react"
import type { RankingSnapshot, QueryConfig } from "@/types/type"
import { formatResponseTime } from "@/hooks/format-response-time"
import { useQueriesStore } from "@/app/store"
import { useSnapshotsStore } from "@/app/store"

// Types
interface SnapshotWithQuery extends RankingSnapshot {
  queryInfo: QueryConfig | null
}

interface SnapshotsTableProps {
  formatDate: (date: Date | string) => string
}

export function SnapshotsTable({ formatDate }: SnapshotsTableProps) {
  // ✅ Use paginated data for display
  const paginatedSnapshots = useSnapshotsStore(state => state.paginatedSnapshots)
  const pagination = useSnapshotsStore(state => state.pagination)
  const isLoading = useSnapshotsStore(state => state.isLoadingPaginated)
  const error = useSnapshotsStore(state => state.error)
  const setPage = useSnapshotsStore(state => state.setPage)
  const setItemsPerPage = useSnapshotsStore(state => state.setItemsPerPage)

  // Get query info for display
  const queries = useQueriesStore(state => state.queries)
  
  const snapshotsWithQueries: SnapshotWithQuery[] = paginatedSnapshots.map((snapshot) => {
    const query = queries.find((q: QueryConfig) => q.id === snapshot.queryId)
    return {
      ...snapshot,
      queryInfo: query || null,
    }
  })

  // Generate page numbers for pagination
  const getPageNumbers = () => {
    const pages = []
    const maxVisiblePages = 5
    const totalPages = pagination.totalPages
    
    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i)
      }
    } else {
      const currentPage = pagination.currentPage
      const start = Math.max(1, currentPage - 2)
      const end = Math.min(totalPages, currentPage + 2)
      
      if (start > 1) {
        pages.push(1)
        if (start > 2) pages.push('...')
      }
      
      for (let i = start; i <= end; i++) {
        pages.push(i)
      }
      
      if (end < totalPages) {
        if (end < totalPages - 1) pages.push('...')
        pages.push(totalPages)
      }
    }
    
    return pages
  }

  return (
    <div className="space-y-4">
      {/* Error Display */}
      {error && (
        <div className="p-4 border border-red-200 bg-red-50 rounded-lg">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {/* Table */}
      <div className="rounded-md border">
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
                <TableCell colSpan={7} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                    <span className="text-sm text-gray-500">Loading snapshots...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : snapshotsWithQueries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12">
                  <div className="text-center">
                    <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50 text-gray-400" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No snapshots found</h3>
                    <p className="text-gray-500">Try adjusting your filters or create a new snapshot.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              snapshotsWithQueries.map((snapshot: SnapshotWithQuery) => (
                <TableRow key={snapshot.id} className="hover:bg-gray-50">
                  <TableCell>
                    <div>
                      <p className="font-medium text-gray-900 truncate max-w-xs" title={snapshot.queryInfo?.query}>
                        {snapshot.queryInfo?.query || "Unknown Query"}
                      </p>
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
                    <div className="flex justify-end gap-2">
                      {/* Future: Add action buttons here */}
                      {/* <Button variant="ghost" size="sm">View</Button> */}
                      {/* <Button variant="ghost" size="sm">Delete</Button> */}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Controls */}
      {pagination.totalItems > 0 && (
        <div className="flex items-center justify-between px-2">
          {/* Items per page and info */}
          <div className="flex items-center gap-4 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <span>Show</span>
              <Select 
                value={pagination.itemsPerPage.toString()} 
                onValueChange={(value) => setItemsPerPage(parseInt(value))}
                disabled={isLoading}
              >
                <SelectTrigger className="w-20 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
              <span>per page</span>
            </div>
            
            <div className="hidden sm:block">
              Showing {((pagination.currentPage - 1) * pagination.itemsPerPage) + 1} to{' '}
              {Math.min(pagination.currentPage * pagination.itemsPerPage, pagination.totalItems)} of{' '}
              {pagination.totalItems} snapshots
            </div>
          </div>

          {/* Pagination buttons */}
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(pagination.currentPage - 1)}
              disabled={pagination.currentPage === 1 || isLoading}
              className="h-8 w-8 p-0"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>

            {/* Page numbers */}
            <div className="flex items-center gap-1">
              {getPageNumbers().map((page, index) => (
                <div key={index}>
                  {page === '...' ? (
                    <span className="px-3 py-1 text-sm text-gray-500">...</span>
                  ) : (
                    <Button
                      variant={pagination.currentPage === page ? "default" : "outline"}
                      size="sm"
                      onClick={() => setPage(page as number)}
                      disabled={isLoading}
                      className="h-8 w-8 p-0"
                    >
                      {page}
                    </Button>
                  )}
                </div>
              ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(pagination.currentPage + 1)}
              disabled={pagination.currentPage === pagination.totalPages || isLoading}
              className="h-8 w-8 p-0"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Mobile pagination info */}
      {pagination.totalItems > 0 && (
        <div className="block sm:hidden text-center text-sm text-gray-600">
          Page {pagination.currentPage} of {pagination.totalPages} ({pagination.totalItems} total)
        </div>
      )}
    </div>
  )
}
