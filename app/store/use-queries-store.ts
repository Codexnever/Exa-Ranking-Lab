// app/store/use-queries-store.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { toast } from "sonner";
import type { QueryConfig } from "@/lib/type";

interface QueriesState {
  queries: QueryConfig[];
  isLoading: boolean;
  error: string | null;
  lastFetch: number | null;
  currentUserId: string | null;
}

interface QueriesActions {
  fetchQueries: (userId?: string, forceRefresh?: boolean) => Promise<void>;
  createQuery: (query: Omit<QueryConfig, "id" | "createdAt">) => Promise<QueryConfig>;
  runQuery: (queryId: string) => Promise<any>;
  updateQuery: (queryId: string, query: Partial<QueryConfig>) => Promise<void>;
  deleteQuery: (queryId: string) => Promise<void>;
  clearQueries: () => void;
  getScheduledQueries: (userId?: string) => Promise<QueryConfig[]>;
  getDueQueries: (userId?: string) => Promise<QueryConfig[]>;
  batchRunQueries: (queryIds: string[]) => Promise<any[]>;
  
  // Enhanced methods
  getQueriesByCategory: (category: string) => QueryConfig[];
  getRecentQueries: (limit?: number) => QueryConfig[];
  syncWithWeaviate: (userId: string) => Promise<void>;
}

type QueriesStoreType = QueriesState & QueriesActions;

const getAuthHeaders = async () => {
  return {
    'Content-Type': 'application/json'
  };
};

export const useQueriesStore = create<QueriesStoreType>()(
  persist(
    (set, get) => ({
      queries: [] as QueryConfig[],
      isLoading: false,
      error: null as string | null,
      lastFetch: null,
      currentUserId: null,

      fetchQueries: async (userId?: string, forceRefresh = false) => {
        const { lastFetch, currentUserId } = get();
        const now = Date.now();
        
        // Skip fetch if data is fresh and user hasn't changed
        if (!forceRefresh && lastFetch && currentUserId === userId && (now - lastFetch) < 60000) {
          return;
        }

        set({ isLoading: true, error: null });
        
        try {
          const headers = await getAuthHeaders();
          let url = "/api/queries";
          if (userId) url += `?userId=${encodeURIComponent(userId)}`;

          console.log('[QueriesStore] Fetching queries:', url);

          const response = await fetch(url, { 
            headers, 
            credentials: "include" 
          });
          
          if (response.status === 401) {
            set({ queries: [] });
            throw new Error("Please log in to access your queries");
          }
          
          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.details || "Failed to fetch queries");
          }
          
          const queries = await response.json() as QueryConfig[];
          
          // Sort queries by creation date (newest first)
          const sortedQueries = queries.sort((a, b) => 
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
          
          set({ 
            queries: sortedQueries, 
            isLoading: false, 
            error: null,
            lastFetch: now,
            currentUserId: userId || null
          });
          
          console.log(`[QueriesStore] Fetched ${queries.length} queries for user ${userId}`);
          
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to fetch queries";
          set({ error: message, isLoading: false, queries: [] });
          toast.error(message);
        }
      },

      createQuery: async (query: Omit<QueryConfig, "id" | "createdAt">): Promise<QueryConfig> => {
        set({ isLoading: true, error: null });
        
        try {
          const headers = await getAuthHeaders();

          const response = await fetch("/api/queries", {
            method: "POST",
            headers,
            credentials: "include",
            body: JSON.stringify(query),
          });

          if (response.status === 401) {
            throw new Error("Session expired. Please log in again");
          }

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.details || "Failed to create query");
          }

          const newQuery = await response.json() as QueryConfig;
          
          set((state: QueriesStoreType): QueriesState => ({
            queries: [newQuery, ...state.queries], // Add to beginning for newest first
            isLoading: false,
            error: null,
            lastFetch: state.lastFetch,
            currentUserId: state.currentUserId
          }));

          toast.success(`Query "${newQuery.name}" created successfully`);
          return newQuery;
          
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to create query";
          set({ error: message, isLoading: false });
          toast.error(message);
          throw error;
        }
      },

      runQuery: async (queryId: string): Promise<any> => {
        set({ isLoading: true, error: null });
        
        try {
          const localQuery = get().queries.find((q: QueryConfig) => q.id === queryId);
          if (!localQuery) {
            throw new Error("Query not found");
          }

          const headers = await getAuthHeaders();

          const response = await fetch(`/api/queries/${encodeURIComponent(queryId)}/run`, {
            method: "POST",
            headers,
            credentials: "include",
            body: JSON.stringify(localQuery)
          });

          if (response.status === 401) {
            throw new Error("Please log in to run queries");
          }

          if (response.status === 404) {
            // Remove from local store if it doesn't exist on server
            set((state: QueriesStoreType): QueriesState => ({
              queries: state.queries.filter((q: QueryConfig) => q.id !== queryId),
              isLoading: false,
              error: null,
              lastFetch: state.lastFetch,
              currentUserId: state.currentUserId
            }));
            throw new Error("Query not found");
          }

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.details || "Failed to run query");
          }

          const result = await response.json();

          // Update the lastRun timestamp for the query
          set((state: QueriesStoreType): QueriesState => ({
            queries: state.queries.map((q: QueryConfig) =>
              q.id === queryId ? { ...q, lastRun: new Date() } : q
            ),
            isLoading: false,
            error: null,
            lastFetch: state.lastFetch,
            currentUserId: state.currentUserId
          }));

          toast.success(`Query "${localQuery.name}" executed successfully`);
          return result;
          
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to run query";
          set({ error: message, isLoading: false });
          toast.error(`Failed to run query: ${message}`);
          throw error;
        }
      },

      updateQuery: async (queryId: string, query: Partial<QueryConfig>): Promise<void> => {
        set({ isLoading: true, error: null });
        
        try {
          const headers = await getAuthHeaders();
          const response = await fetch(`/api/queries/${queryId}`, {
            method: "PATCH",
            headers,
            credentials: "include",
            body: JSON.stringify(query),
          });
          
          if (!response.ok) throw new Error("Failed to update query");
          
          const updatedQuery = await response.json();
          
          set((state: QueriesStoreType): QueriesState => ({
            queries: state.queries.map((q: QueryConfig) =>
              q.id === queryId ? { ...q, ...updatedQuery } : q
            ),
            isLoading: false,
            error: null,
            lastFetch: state.lastFetch,
            currentUserId: state.currentUserId
          }));
          
          toast.success("Query updated successfully");
          
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to update query";
          set({ error: message, isLoading: false });
          toast.error(message);
          throw error;
        }
      },

      deleteQuery: async (queryId: string): Promise<void> => {
        set({ isLoading: true, error: null });
        
        try {
          const headers = await getAuthHeaders();
          const response = await fetch(`/api/queries/${queryId}`, {
            method: "DELETE",
            headers,
            credentials: "include"
          });
          
          if (response.status === 401) {
            toast.error("Please log in to delete queries");
            throw new Error("Unauthorized");
          }
          
          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.details || "Failed to delete query");
          }
          
          const deletedQuery = get().queries.find(q => q.id === queryId);
          
          set((state: QueriesStoreType): QueriesState => ({
            queries: state.queries.filter((q: QueryConfig) => q.id !== queryId),
            isLoading: false,
            error: null,
            lastFetch: state.lastFetch,
            currentUserId: state.currentUserId
          }));
          
          toast.success(`Query "${deletedQuery?.name}" deleted successfully`);
          
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to delete query";
          set({ error: message, isLoading: false });
          toast.error(message);
          throw error;
        }
      },

      clearQueries: () => {
        set({ 
          queries: [], 
          error: null, 
          lastFetch: null,
          currentUserId: null 
        });
      },

      getScheduledQueries: async (userId?: string): Promise<QueryConfig[]> => {
        try {
          const queries = get().queries.length > 0 ? get().queries : 
            await get().fetchQueries(userId).then(() => get().queries);
          return queries.filter(q => q.schedule?.enabled && (!userId || q.userId === userId));
        } catch (error) {
          console.error('Failed to get scheduled queries:', error);
          return [];
        }
      },

      getDueQueries: async (userId?: string): Promise<QueryConfig[]> => {
        try {
          const scheduledQueries = await get().getScheduledQueries(userId);
          const now = new Date();
          
          return scheduledQueries.filter(query => {
            if (!query.lastRun) return true;
            
            const lastRun = new Date(query.lastRun);
            const diffMs = now.getTime() - lastRun.getTime();
            
            switch (query.schedule.frequency) {
              case 'hourly':
                return diffMs >= 60 * 60 * 1000;
              case 'daily':
                return diffMs >= 24 * 60 * 60 * 1000;
              case 'weekly':
                return diffMs >= 7 * 24 * 60 * 60 * 1000;
              default:
                return false;
            }
          });
        } catch (error) {
          console.error('Failed to get due queries:', error);
          return [];
        }
      },

      batchRunQueries: async (queryIds: string[]): Promise<any[]> => {
        const results = [];
        for (const queryId of queryIds) {
          try {
            const result = await get().runQuery(queryId);
            results.push({ queryId, status: 'success', result });
          } catch (error) {
            results.push({ 
              queryId, 
              status: 'error', 
              error: error instanceof Error ? error.message : 'Unknown error' 
            });
          }
        }
        return results;
      },

      // Enhanced methods
      getQueriesByCategory: (category: string) => {
        return get().queries.filter(q => q.category === category);
      },

      getRecentQueries: (limit: number = 5) => {
        return get().queries
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, limit);
      },

      syncWithWeaviate: async (userId: string) => {
        try {
          const queries = get().queries;
          const response = await fetch('/api/weaviate/sync-queries', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ userId, queries })
          });

          if (!response.ok) {
            throw new Error('Failed to sync queries with Weaviate');
          }

          console.log('[QueriesStore] Queries synced with Weaviate successfully');
        } catch (error) {
          console.error('[QueriesStore] Weaviate sync failed:', error);
          toast.error('Failed to sync queries with AI database');
        }
      }
    }),
    {
      name: 'queries-storage',
      partialize: (state: QueriesStoreType) => ({ 
        queries: state.queries,
        lastFetch: state.lastFetch,
        currentUserId: state.currentUserId
      }),
    }
  )
);
