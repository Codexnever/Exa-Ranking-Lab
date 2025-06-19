"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import dynamic from "next/dynamic"
import { toast } from "sonner"
import { useQueriesStore, useSnapshotsStore, useAnalyticsStore } from "@/store"
import type { QueryConfig } from "@/lib/types"
import { useAuth } from "@/contexts/auth-context"

// 🧠 Skeleton loaders
const QueryFormSkeleton = dynamic(() => import("@/components/loaders/QueryFormSkeleton"))
const QueryTableSkeleton = dynamic(() => import("@/components/loaders/QueryTableSkeleton"))
const FilterControlsSkeleton = dynamic(() => import("@/components/loaders/FilterControlsSkeleton"))


// 💥 Dynamic heavy components
const QueryForm = dynamic(() => import("@/components/query-form/query-form"), {
  loading: () => <QueryFormSkeleton />,
})

const QueryTable = dynamic(() => import("@/components/query-form/query-table"), {
  loading: () => <QueryTableSkeleton />,
})

const FilterControls = dynamic(() => import("@/components/filter-controls"), {
  loading: () => <FilterControlsSkeleton />,
})

type QueryFrequency = QueryConfig["schedule"]["frequency"]

interface Filters {
  tags: string[]
  frequency: QueryFrequency | ""
}

export default function QueryBuilder() {
  const queries = useQueriesStore((state) => state.queries)
  const createQuery = useQueriesStore((state) => state.createQuery)
  const runQuery = useQueriesStore((state) => state.runQuery)
  const fetchQueries = useQueriesStore((state) => state.fetchQueries)
  const updateQuery = useQueriesStore((state) => state.updateQuery)
  const { userId } = useAuth()
  const [editingQuery, setEditingQuery] = useState<QueryConfig | null>(null)

  const [filters, setFilters] = useState<Filters>({
    tags: [],
    frequency: "",
  })

  useEffect(() => {
    fetchQueries()
  }, [])

  const filteredQueries = queries.filter((query) => {
    if (filters.tags.length > 0) {
      const hasAllTags = filters.tags.every((tag) => query.tags.includes(tag))
      if (!hasAllTags) return false
    }

    if (filters.frequency && query.schedule.frequency !== filters.frequency) {
      return false
    }

    return true
  })

  const handleAddQuery = (newQuery: Omit<QueryConfig, "id" | "createdAt" | "userId">) => {
    if (!userId) {
      toast.error("You must be logged in to create a query.")
      return
    }

    createQuery({ ...newQuery, userId })
      .then(() => toast.success("Query created successfully!"))
      .catch(() => toast.error("Failed to create query"))
  }

  const handleRunQuery = async (queryId: string) => {
    try {
      await runQuery(queryId)
      toast.success("Query executed successfully!")
    } catch {
      toast.error("Failed to execute query")
    }
  }

  const handleDeleteQuery = async (queryId: string) => {
    try {
      await useQueriesStore.getState().deleteQuery(queryId)
      await fetchQueries()
      await useSnapshotsStore.getState().fetchSnapshots()
      const snapshots = useSnapshotsStore.getState().snapshots
      useAnalyticsStore.getState().calculateAnalyticsFromSnapshots(snapshots)
      toast.success("Query deleted successfully!")
    } catch {
      toast.error("Failed to delete query")
    }
  }

  const handleEditQuery = (query: QueryConfig) => {
    setEditingQuery(query)
  }

  const handleUpdateQuery = async (id: string, data: Partial<QueryConfig>) => {
    try {
      await updateQuery(id, data)
      await fetchQueries()
      await useSnapshotsStore.getState().fetchSnapshots()
      const snapshots = useSnapshotsStore.getState().snapshots
      useAnalyticsStore.getState().calculateAnalyticsFromSnapshots(snapshots)
      setEditingQuery(null)
      toast.success("Query updated successfully!")
    } catch {
      toast.error("Failed to update query")
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <QueryForm
          onSubmit={handleAddQuery}
          editingQuery={editingQuery}
          onUpdate={handleUpdateQuery}
          onCancelEdit={() => setEditingQuery(null)}
        />
      </Card>

      <FilterControls filters={filters} setFilters={setFilters} />

      <div className="space-y-4">
        <QueryTable
          queries={filteredQueries}
          onRunQuery={handleRunQuery}
          onDeleteQuery={handleDeleteQuery}
          onEditQuery={handleEditQuery}
        />
      </div>
    </div>
  )
}
