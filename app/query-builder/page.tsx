// pages/query-builder.tsx
"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { useQueriesStore, useSnapshotsStore, useAnalyticsStore } from "@/app/store";
import type { QueryConfig } from "@/types/type";
import { useAuth } from "@/lib/middleware/authentication/auth-context";

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
  const { user } = useAuth(); //  Use user object instead of userId
  
  //  Use individual selectors for better performance
  const queries = useQueriesStore((state) => state.queries);
  const createQuery = useQueriesStore((state) => state.createQuery);
  const runQuery = useQueriesStore((state) => state.runQuery);
  const fetchQueries = useQueriesStore((state) => state.fetchQueries);
  const updateQuery = useQueriesStore((state) => state.updateQuery);
  const deleteQuery = useQueriesStore((state) => state.deleteQuery);
  const queriesLoading = useQueriesStore((state) => state.isLoading);
  
  //  Use new store structure for snapshots
  const fetchAllSnapshots = useSnapshotsStore((state) => state.fetchAllSnapshots);
  const fetchSnapshotsComplete = useSnapshotsStore((state) => state.fetchSnapshotsComplete);
  const allSnapshots = useSnapshotsStore((state) => state.allSnapshots); // ✅ Use complete dataset
  const pagination = useSnapshotsStore((state) => state.pagination);
  
  //  Analytics store
  const calculateAnalytics = useAnalyticsStore((state) => state.calculateAnalyticsFromSnapshots);

  const [editingQuery, setEditingQuery] = useState<QueryConfig | null>(null);
  const [filters, setFilters] = useState<Filters>({
    tags: [],
    frequency: "",
  });

  //  Initial data fetch
  useEffect(() => {
    if (user?.$id) {
      fetchQueries(user.$id);
    }
  }, [user?.$id, fetchQueries]);

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
    if (!user?.$id) {
      toast.error("You must be logged in to create a query.");
      return;
    }

    try {
      console.log('[QueryBuilder] Creating new query');
      
      await createQuery({ ...newQuery, userId: user.$id });
      
      //  Refresh queries after creation
      await fetchQueries(user.$id);
      
      //  Refresh complete snapshots for analytics (don't need to refetch paginated)
      await fetchAllSnapshots(user.$id);
      
      //  Recalculate analytics with fresh complete dataset
      const freshAllSnapshots = useSnapshotsStore.getState().allSnapshots;
      calculateAnalytics(freshAllSnapshots);
      
      toast.success("Query created successfully!");
      console.log('[QueryBuilder] Query created and analytics updated');
    } catch (error) {
      console.error('[QueryBuilder] Failed to create query:', error);
      toast.error("Failed to create query");
    }
  };

  const handleRunQuery = async (queryId: string) => {
    if (!user?.$id) {
      toast.error("You must be logged in to run queries.");
      return;
    }

    try {
      console.log('[QueryBuilder] Running query:', queryId);
      
      await runQuery(queryId);
      
      // ✅ Refresh both paginated and complete datasets after query run
      await fetchSnapshotsComplete(pagination.currentPage, pagination.itemsPerPage, user.$id);
      
      // ✅ Recalculate analytics with fresh complete dataset
      const freshAllSnapshots = useSnapshotsStore.getState().allSnapshots;
      calculateAnalytics(freshAllSnapshots);
      
      toast.success("Query executed successfully!");
      console.log('[QueryBuilder] Query executed and data refreshed');
    } catch (error) {
      console.error('[QueryBuilder] Failed to execute query:', error);
      toast.error("Failed to execute query");
    }
  };

  const handleDeleteQuery = async (queryId: string) => {
    if (!user?.$id) {
      toast.error("You must be logged in to delete queries.");
      return;
    }

    try {
      console.log('[QueryBuilder] Deleting query:', queryId);
      
      await deleteQuery(queryId);
      
      //  Refresh queries after deletion
      await fetchQueries(user.$id);
      
      //  Refresh complete snapshots for analytics
      await fetchAllSnapshots(user.$id);
      
      //  Recalculate analytics with updated dataset
      const freshAllSnapshots = useSnapshotsStore.getState().allSnapshots;
      calculateAnalytics(freshAllSnapshots);
      
      toast.success("Query deleted successfully!");
      console.log('[QueryBuilder] Query deleted and analytics updated');
    } catch (error) {
      console.error('[QueryBuilder] Failed to delete query:', error);
      toast.error("Failed to delete query");
    }
  };

  const handleEditQuery = (query: QueryConfig) => {
    setEditingQuery(query);
  };

  const handleUpdateQuery = async (id: string, data: Partial<QueryConfig>) => {
    if (!user?.$id) {
      toast.error("You must be logged in to update queries.");
      return;
    }

    try {
      console.log('[QueryBuilder] Updating query:', id);
      
      await updateQuery(id, data);
      
      // ✅ Refresh queries after update
      await fetchQueries(user.$id);
      
      // ✅ Refresh complete snapshots for analytics (in case query metadata affects analytics)
      await fetchAllSnapshots(user.$id);
      
      // ✅ Recalculate analytics with updated dataset
      const freshAllSnapshots = useSnapshotsStore.getState().allSnapshots;
      calculateAnalytics(freshAllSnapshots);
      
      setEditingQuery(null);
      toast.success("Query updated successfully!");
      console.log('[QueryBuilder] Query updated and analytics refreshed');
    } catch (error) {
      console.error('[QueryBuilder] Failed to update query:', error);
      toast.error("Failed to update query");
    }
  };

  // ✅ Loading state
  if (queriesLoading) {
    return (
      <div className="space-y-6">
        <Card className="p-6">
          <QueryFormSkeleton />
        </Card>
        <FilterControlsSkeleton />
        <QueryTableSkeleton />
      </div>
    );
  }

  // ✅ Authentication guard
  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="w-96 p-6">
          <div className="text-center">
            <h3 className="text-lg font-medium text-gray-900 mb-2">Authentication Required</h3>
            <p className="text-gray-500">Please log in to access the Query Builder.</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Query Builder</h1>
          <p className="text-gray-600 mt-1">Create and manage your search ranking queries</p>
          {/* Optional: Show stats */}
          <p className="text-xs text-gray-500 mt-1">
            {queries.length} queries • {allSnapshots.length} total snapshots
          </p>
        </div>
      </div>

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
