"use client"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Edit, MoreHorizontal, Play, Trash2, Calendar, Clock } from "lucide-react"
import type { QueryConfig } from "@/types/type"
import { useState } from "react"

interface QueryTableProps {
  queries: QueryConfig[]
  onRunQuery: (queryId: string) => void
  onDeleteQuery: (queryId: string) => void
  onEditQuery: (query: QueryConfig) => void
}

export default function QueryTable({ queries, onRunQuery, onDeleteQuery, onEditQuery }: QueryTableProps) {
  const [runningQueries, setRunningQueries] = useState<Set<string>>(new Set())

  const handleRunQuery = async (queryId: string) => {
    setRunningQueries((prev) => new Set(prev).add(queryId))
    try {
      await onRunQuery(queryId)
    } finally {
      setRunningQueries((prev) => {
        const newSet = new Set(prev)
        newSet.delete(queryId)
        return newSet
      })
    }
  }

  // Format date for display
  const formatDate = (dateString: Date | string) => {
    if (!dateString) return "Never"

    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 60) {
      return `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`
    } else if (diffHours < 24) {
      return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`
    } else if (diffDays < 7) {
      return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`
    } else {
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    }
  }

  // Get badge variant based on frequency
  const getFrequencyVariant = (frequency: string) => {
    switch (frequency) {
      case "hourly":
        return "default"
      case "daily":
        return "secondary"
      case "weekly":
        return "outline"
      default:
        return "outline"
    }
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[300px]">Query</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Tags</TableHead>
            <TableHead>Schedule</TableHead>
            <TableHead>Last Run</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {queries.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="h-24 text-center">
                No queries found.
              </TableCell>
            </TableRow>
          ) : (
            queries.map((query) => (
              <TableRow key={query.id}>
                <TableCell className="font-medium">
                  <div>
                    <p className="font-medium text-gray-900">{query.name}</p>
                    <p className="text-sm text-gray-500 mt-1">{query.query}</p>
                    <div className="text-xs text-gray-400 mt-1">
                      {query.filters.numResults} results •
                      {query.filters.includeDomains?.length
                        ? ` Include: ${query.filters.includeDomains.join(", ")}`
                        : ""}
                      {query.filters.excludeDomains?.length
                        ? ` Exclude: ${query.filters.excludeDomains.join(", ")}`
                        : ""}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="capitalize">
                    {query.category}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {query.tags.slice(0, 3).map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                    {query.tags.length > 3 && (
                      <Badge variant="secondary" className="text-xs">
                        +{query.tags.length - 3}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {query.schedule.enabled ? (
                      <>
                        <Badge variant={getFrequencyVariant(query.schedule.frequency)}>
                          {query.schedule.frequency}
                        </Badge>
                        <Calendar className="w-3 h-3 text-emerald-500" />
                      </>
                    ) : (
                      <Badge variant="outline">Manual</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Clock className="w-3 h-3 text-gray-400" />
                    <span className="text-sm">{formatDate(query.lastRun ?? "")}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleRunQuery(query.id)}
                      disabled={runningQueries.has(query.id)}
                    >
                      <Play className="h-4 w-4" />
                      <span className="sr-only">Run</span>
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Open menu</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEditQuery(query)}>
                          <Edit className="mr-2 h-4 w-4" />
                          <span>Edit</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-red-600" onClick={() => onDeleteQuery(query.id)}>
                          <Trash2 className="mr-2 h-4 w-4" />
                          <span>Delete</span>
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
    </div>
  )
}
