import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Filter } from "lucide-react"
import type { QueryConfig } from "@/lib/type"
import { Dispatch, SetStateAction } from "react"

interface SnapshotsFiltersProps {
  filters: {
    category: string
    status: string
    search: string
  }
  setFilters: Dispatch<SetStateAction<{
    category: string
    status: string
    search: string
  }>>

  queries: QueryConfig[]
}

export function SnapshotsFilters({ filters, setFilters, queries }: SnapshotsFiltersProps) {
  return (
    <div className="flex items-center gap-4">
      <div className="relative flex-1">
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
          <SelectItem value="company">Company</SelectItem>
          <SelectItem value="research paper">Research Paper</SelectItem>
          <SelectItem value="news">News</SelectItem>
          <SelectItem value="pdf">PDF</SelectItem>
          <SelectItem value="github">GitHub</SelectItem>
          <SelectItem value="tweet">Tweet</SelectItem>
          <SelectItem value="personal site">Personal Site</SelectItem>
          <SelectItem value="linkedin profile">LinkedIn Profile</SelectItem>
          <SelectItem value="financial report">Financial Report</SelectItem>
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
    </div>
  )
}
