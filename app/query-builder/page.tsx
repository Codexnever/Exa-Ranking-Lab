"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { QueryForm } from "@/components/query-form"
import QueryTable from "@/components/query-table"
import FilterControls from "@/components/filter-controls"
import { useQueriesStore } from "@/store"
import { toast } from "sonner"
import type { QueryConfig } from "@/lib/types"
import { useAuth } from "@/contexts/auth-context"

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
  const { userId } = useAuth()
  
  useEffect(() => {
    fetchQueries()
  }, [fetchQueries])

  const [filters, setFilters] = useState<Filters>({
    tags: [],
    frequency: "",
  })

  // Filter queries based on selected filters
  const filteredQueries = queries.filter((query) => {
    // Filter by tags
    if (filters.tags.length > 0) {
      const hasAllTags = filters.tags.every((tag) => query.tags.includes(tag))
      if (!hasAllTags) return false
    }

    // Filter by frequency
    if (filters.frequency && query.schedule.frequency !== filters.frequency) {
      return false
    }

    return true
  })

  // Handle adding a new query
  const handleAddQuery = (newQuery: Omit<QueryConfig, "id" | "createdAt" | "userId">) => {
    if (!userId) {
      toast.error("You must be logged in to create a query.")
      return
    }
    createQuery({ ...newQuery, userId })
      .then(() => {
        toast.success("Query created successfully!")
      })
      .catch(() => {
        toast.error("Failed to create query")
      })
  }

  // Handle running a query
  const handleRunQuery = async (queryId: string) => {
    try {
      await runQuery(queryId)
      toast.success("Query executed successfully!")
    } catch (error) {
      toast.error("Failed to execute query")
    }
  }

  // Handle deleting a query
  const handleDeleteQuery = async (queryId: string) => {
    try {
      await useQueriesStore.getState().deleteQuery(queryId)
      toast.success("Query deleted successfully!")
    } catch (error) {
      toast.error("Failed to delete query")
    }
  }

  // Handle editing a query
  const handleEditQuery = (query: QueryConfig) => {
    // You can open a modal or set state to edit the query
    // For now, just log it (replace with your edit logic/UI)
    console.log('Edit query:', query)
    toast.info(`Edit query: ${query.name}`)
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6">
        <Card className="p-6">
          <QueryForm onSubmit={handleAddQuery} />
        </Card>

        <div className="space-y-4">
          <QueryTable
            queries={filteredQueries}
            onRunQuery={handleRunQuery}
            onDeleteQuery={handleDeleteQuery}
            onEditQuery={handleEditQuery}
          />
        </div>
      </div>
    </div>
  )
}
