// Your QueryBuilder code with fixes
"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { useQueriesStore, useSnapshotsStore, useAnalyticsStore } from "@/app/store";
import type { QueryConfig } from "@/lib/type";
import { useAuth } from "@/lib/contexts/auth-context";

const QueryFormSkeleton = dynamic(() => import("@/components/loaders/QueryFormSkeleton"));
const QueryTableSkeleton = dynamic(() => import("@/components/loaders/QueryTableSkeleton"));
const FilterControlsSkeleton = dynamic(() => import("@/components/loaders/FilterControlsSkeleton"));

const QueryForm = dynamic(() => import("@/components/query-form/QueryForm").then(mod => mod.QueryForm), {
  loading: () => <QueryFormSkeleton />,
});

const QueryTable = dynamic(() => import("@/components/query-form/QueryTable"), {
  loading: () => <QueryTableSkeleton />,
});

const FilterControls = dynamic(() => import("@/components/filter-controls"), {
  loading: () => <FilterControlsSkeleton />,
});

type QueryFrequency = QueryConfig["schedule"]["frequency"];

interface Filters {
  tags: string[];
  frequency: QueryFrequency | "";
}

export default function QueryBuilder() {
  const { userId } = useAuth(); // Assuming userId from auth

  const queries = useQueriesStore((state) => state.queries);
  const createQuery = useQueriesStore((state) => state.createQuery);
  const runQuery = useQueriesStore((state) => state.runQuery);
  const fetchQueries = useQueriesStore((state) => state.fetchQueries);
  const updateQuery = useQueriesStore((state) => state.updateQuery);
  const fetchSnapshots = useSnapshotsStore((state) => state.fetchSnapshots); // For recalc
  const snapshots = useSnapshotsStore((state) => state.snapshots);
  const calculateAnalytics = useAnalyticsStore((state) => state.calculateAnalyticsFromSnapshots);

  const [editingQuery, setEditingQuery] = useState<QueryConfig | null>(null);
  const [filters, setFilters] = useState<Filters>({
    tags: [],
    frequency: "",
  });

  useEffect(() => {
    fetchQueries();
  }, []);

  const filteredQueries = queries.filter((query) => {
    if (filters.tags.length > 0) {
      const hasAllTags = filters.tags.every((tag) => query.tags.includes(tag));
      if (!hasAllTags) return false;
    }

    if (filters.frequency && query.schedule.frequency !== filters.frequency) {
      return false;
    }

    return true;
  });

  const handleAddQuery = async (newQuery: Omit<QueryConfig, "id" | "createdAt" | "userId">) => {
    if (!userId) {
      toast.error("You must be logged in to create a query.");
      return;
    }

    await createQuery({ ...newQuery, userId });
    toast.success("Query created successfully!");
    await fetchQueries(); // Refetch queries
    await fetchSnapshots(); // Refetch snapshots (in case new one created)
    calculateAnalytics(snapshots); // Recalculate analytics with new data
  };

  const handleRunQuery = async (queryId: string) => {
    try {
      await runQuery(queryId);
      toast.success("Query executed successfully!");
      await fetchSnapshots(); // Refetch snapshots after run (new snapshot likely created)
      calculateAnalytics(snapshots); // Instant recalculation
    } catch {
      toast.error("Failed to execute query");
    }
  };

  const handleDeleteQuery = async (queryId: string) => {
    try {
      await useQueriesStore.getState().deleteQuery(queryId);
      await fetchQueries();
      await fetchSnapshots();
      calculateAnalytics(snapshots); // From your code
      toast.success("Query deleted successfully!");
    } catch {
      toast.error("Failed to delete query");
    }
  };

  const handleEditQuery = (query: QueryConfig) => {
    setEditingQuery(query);
  };

  const handleUpdateQuery = async (id: string, data: Partial<QueryConfig>) => {
    try {
      await updateQuery(id, data);
      await fetchQueries();
      await fetchSnapshots();
      calculateAnalytics(snapshots); // From your code
      setEditingQuery(null);
      toast.success("Query updated successfully!");
    } catch {
      toast.error("Failed to update query");
    }
  };

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

      <FilterControls filters={filters} onFilterChange={setFilters} />

      <div className="space-y-4">
        <QueryTable
          queries={filteredQueries}
          onRunQuery={handleRunQuery}
          onDeleteQuery={handleDeleteQuery}
          onEditQuery={handleEditQuery}
        />
      </div>
    </div>
  );
}
