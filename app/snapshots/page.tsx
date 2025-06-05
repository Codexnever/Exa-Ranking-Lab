"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Camera,
  Search,
  Filter,
  Download,
  Eye,
  GitCompare,
  Calendar,
  Clock,
  ExternalLink,
  MoreHorizontal,
} from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useSnapshots } from "@/hooks/use-snapshots"
import { useQueries } from "@/hooks/use-queries"
import { useAnalytics } from "@/hooks/use-analytics"
import { useAuth } from "@/contexts/auth-context"
import { useState } from "react"
import type { QueryConfig } from "@/lib/types"
import { useToast } from "@/components/ui/use-toast"

export default function Snapshots() {
  const { snapshots, isLoading } = useSnapshots()
  const { queries } = useQueries()
  const { analytics } = useAnalytics()
  const { user } = useAuth() // Get user from auth context
  const { toast } = useToast()
  const [filters, setFilters] = useState({
    category: "all",
    status: "all-status",
    search: "",
  })
  const [selectedQueryId, setSelectedQueryId] = useState<string>("")
  const [creating, setCreating] = useState(false)

  // Get query information for each snapshot
  const snapshotsWithQueries = snapshots.map((snapshot) => {
    const query = queries.find((q: QueryConfig) => q.id === snapshot.queryId)
    return {
      ...snapshot,
      queryInfo: query || null,
    }
  })
  console.log('Frontend snapshot queries', snapshotsWithQueries)

  const filteredSnapshots = snapshotsWithQueries.filter((snapshot) => {
    if (filters.category !== "all" && snapshot.queryInfo?.category !== filters.category) return false
    if (filters.status !== "all-status") {
      const status = snapshot.results.length > 0 ? "completed" : "failed"
      if (status !== filters.status) return false
    }
    if (filters.search && !snapshot.queryInfo?.query.toLowerCase().includes(filters.search.toLowerCase())) return false
    return true
  })

  const formatDate = (date: Date | string) => {
    const parsedDate = typeof date === 'string' ? new Date(date) : date
    const now = new Date()
    const diffMs = now.getTime() - parsedDate.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))

    if (diffHours < 24) {
      return `${diffHours}h ago`
    } else {
      return parsedDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    }
  }

  // Calculate stats
  const totalSnapshots = snapshots.length
  const snapshotsThisWeek = snapshots.filter(
    (s) => new Date(s.timestamp).getTime() > new Date().getTime() - 7 * 24 * 60 * 60 * 1000
  ).length
  const successRate = analytics?.querySuccessRate || 0
  const avgResults = snapshots.reduce((sum, s) => sum + s.results.length, 0) / Math.max(snapshots.length, 1)

  // Helper function to get JWT token
  const getJWTToken = () => {
    if (typeof window !== 'undefined') {
      // Try localStorage first
      let jwt = localStorage.getItem('appwrite_jwt')
      if (jwt) return jwt
      
      // Try cookies as fallback
      if (typeof document !== 'undefined') {
        const match = document.cookie.match(/(?:^|; )appwrite_jwt=([^;]*)/)
        if (match) return match[1]
      }
    }
    return null
  }

  // Add handler for creating a new snapshot
  const handleCreateSnapshot = async () => {
    if (!user) {
      toast({ title: "Authentication required", description: "Please log in to create snapshots.", variant: "destructive" })
      return
    }

    if (!selectedQueryId) {
      toast({ title: "Select a query", description: "Please select a query to snapshot.", variant: "destructive" })
      return
    }

    setCreating(true)
    try {
      const jwt = getJWTToken()
      console.log('Getting JWT token', jwt ? 'Token found' : 'No token found')
      
      if (!jwt) {
        toast({ title: "Authentication error", description: "No valid session found. Please log in again.", variant: "destructive" })
        return
      }

      // Find the query config
      const queryConfig = queries.find((q: QueryConfig) => q.id === selectedQueryId)
      if (!queryConfig) throw new Error("Query not found")

      // 1. Run the query to get results and metadata
      const runRes = await fetch(`/api/queries/${selectedQueryId}/run`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${jwt}`,
          "Content-Type": "application/json",
        },
      })

      if (!runRes.ok) {
        if (runRes.status === 401) {
          toast({ 
            title: "Session expired", 
            description: "Your session has expired. Please log in again.", 
            variant: "destructive" 
          })
          return
        }
        throw new Error(`Failed to run query for snapshot: ${runRes.status} ${runRes.statusText}`)
      }

      const { results, responseTime, totalResults, timestamp } = await runRes.json()

      // 2. POST the full snapshot to /api/snapshots
      const res = await fetch("/api/snapshots", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${jwt}`,
        },
        body: JSON.stringify({
          queryId: selectedQueryId,
          timestamp: new Date(),
          results,
          metadata: {
            responseTime,
            totalResults,
          },
        }),
      })

      if (!res.ok) {
        if (res.status === 401) {
          toast({ 
            title: "Session expired", 
            description: "Your session has expired. Please log in again.", 
            variant: "destructive" 
          })
          return
        }
        throw new Error(`Failed to create snapshot: ${res.status} ${res.statusText}`)
      }

      toast({ title: "Snapshot created!", description: `Snapshot for '${queryConfig.query}' created.` })
      
      // Optionally refresh the page or trigger a refetch
      // window.location.reload()
      
    } catch (e: any) {
      console.error('Snapshot creation error:', e)
      toast({ 
        title: "Error", 
        description: e.message || "Failed to create snapshot", 
        variant: "destructive" 
      })
    } finally {
      setCreating(false)
    }
  }

  // Show loading or login prompt if no user
  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="w-96">
          <CardHeader>
            <CardTitle>Authentication Required</CardTitle>
            <CardDescription>Please log in to view snapshots.</CardDescription>
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
              {queries.map((q: QueryConfig) => (
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

      {/* Filters and Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search snapshots..."
                className="pl-10"
                value={filters.search}
                onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
              />
            </div>
            <Select
              value={filters.category}
              onValueChange={(value) => setFilters((prev) => ({ ...prev, category: value }))}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="web">Web</SelectItem>
                <SelectItem value="research">Research</SelectItem>
                <SelectItem value="code">Code</SelectItem>
                <SelectItem value="news">News</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={filters.status}
              onValueChange={(value) => setFilters((prev) => ({ ...prev, status: value }))}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all-status">All Status</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm">
              <Filter className="w-4 h-4 mr-2" />
              More Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Snapshots Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-gray-900">Recent Snapshots</CardTitle>
          <CardDescription>
            {filteredSnapshots.length} snapshots captured • Last updated{" "}
            {snapshots.length > 0
              ? formatDate(snapshots[0].timestamp)
              : "No snapshots yet"}
          </CardDescription>
        </CardHeader>
        <CardContent>
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
                          {snapshot.metadata.responseTime > 0
                            ? `${snapshot.metadata.responseTime.toFixed(1)}s`
                            : "—"}
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
                        {snapshot.results.length > 0 ? "completed" : "failed"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="sm">
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <GitCompare className="w-4 h-4" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>
                              <Download className="w-4 h-4 mr-2" />
                              Export Data
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <ExternalLink className="w-4 h-4 mr-2" />
                              Share Snapshot
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total Snapshots</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{totalSnapshots}</div>
            <p className="text-xs text-gray-500 mt-1">+{snapshotsThisWeek} this week</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Success Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{successRate.toFixed(1)}%</div>
            <p className="text-xs text-gray-500 mt-1">Last 30 days</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Avg Results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{avgResults.toFixed(1)}</div>
            <p className="text-xs text-gray-500 mt-1">Per snapshot</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}