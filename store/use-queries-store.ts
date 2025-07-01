import { create } from "zustand"
import { persist } from "zustand/middleware"
import { toast } from "sonner"
import type { QueryConfig } from "@/lib/types"
import { StoreApi } from 'zustand'

interface QueriesState {
  queries: QueryConfig[]
  isLoading: boolean
  error: string | null
}

interface QueriesActions {
  fetchQueries: () => Promise<void>
  createQuery: (query: Omit<QueryConfig, "id" | "createdAt">) => Promise<QueryConfig>
  runQuery: (queryId: string) => Promise<any>
  updateQuery: (queryId: string, query: Partial<QueryConfig>) => Promise<void>
  deleteQuery: (queryId: string) => Promise<void>
  clearQueries: () => void
}

type QueriesStoreType = QueriesState & QueriesActions

const getAuthHeaders = async () => {
  return {
    'Content-Type': 'application/json'
  }
}



type SetState = StoreApi<QueriesStoreType>['setState']
type GetState = StoreApi<QueriesStoreType>['getState']

export const useQueriesStore = create<QueriesStoreType>()(
  persist(
    (set: SetState, get: GetState) => ({
      queries: [] as QueryConfig[],
      isLoading: false,
      error: null as string | null,

      fetchQueries: async (userId?: string) => {
        set({ isLoading: true, error: null })
        try {
          const headers = await getAuthHeaders()
          let url = "/api/queries"
          if (userId) url += `?userId=${encodeURIComponent(userId)}`
          const response = await fetch(url, { headers, credentials: "include" })
          if (response.status === 401) {
            set({ queries: [] })
            throw new Error("Please log in to access your queries")
          }
          if (!response.ok) {
            const error = await response.json()
            throw new Error(error.details || "Failed to fetch queries")
          }
          const queries = await response.json() as QueryConfig[]
          set({ queries, isLoading: false, error: null })
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to fetch queries"
          set({ error: message, isLoading: false, queries: [] })
          toast.error(message)
        }
      },

      createQuery: async (query: Omit<QueryConfig, "id" | "createdAt">): Promise<QueryConfig> => {
        set({ isLoading: true, error: null })
        try {
          const headers = await getAuthHeaders()
          console.log('🔐 Creating query with validated session')
          
          const response = await fetch("/api/queries", {
            method: "POST",
            headers,
            credentials: "include",
            body: JSON.stringify(query),
          })
          
          if (response.status === 401) {
            console.log('❌ Server rejected auth token')
            throw new Error("Session expired. Please log in again")
          }
          
          if (!response.ok) {
            const error = await response.json()
            throw new Error(error.details || "Failed to create query")
          }          const newQuery = await response.json() as QueryConfig
          console.log('✅ Query created successfully')
            set((state: QueriesStoreType): QueriesState => ({
            queries: [...state.queries, newQuery],
            isLoading: false,
            error: null
          }))
          
          return newQuery
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to create query"
          set({ error: message, isLoading: false })
          toast.error(message)
          throw error
        }
      },      runQuery: async (queryId: string): Promise<any> => {
        set({ isLoading: true, error: null })
        try {
          // First check if query exists in local store
          const localQuery = useQueriesStore.getState().queries.find((q: QueryConfig) => q.id === queryId)
          if (!localQuery) {
            console.log('❌ Query not found in local store:', queryId)
            throw new Error("Query not found")
          }

          const headers = await getAuthHeaders()
          console.log('🔍 Running query:', queryId)

          const response = await fetch(`/api/queries/${encodeURIComponent(queryId)}/run`, {
            method: "POST",
            headers,
            credentials: "include",
            body: JSON.stringify(localQuery) // Send query data to ensure server has latest version
          })

          if (response.status === 401) {
            console.log('❌ Authentication failed')
            throw new Error("Please log in to run queries")
          }
          
          if (response.status === 404) {
            console.log('❌ Query not found:', queryId)
            // Remove from local store if it doesn't exist on server
            set((state: QueriesStoreType): QueriesState => ({
              queries: state.queries.filter((q: QueryConfig) => q.id !== queryId),
              isLoading: false,
              error: null
            }))
            throw new Error("Query not found")
          }
          
          if (!response.ok) {
            const error = await response.json()
            throw new Error(error.details || "Failed to run query")
          }          const result = await response.json()
          console.log('✅ Query executed successfully')
          
          // Update the lastRun timestamp for the query
          set((state: QueriesStoreType): QueriesState => ({
            queries: state.queries.map((q: QueryConfig) =>
              q.id === queryId ? { ...q, lastRun: new Date() } : q
            ),
            isLoading: false,
            error: null
          }))
          
          toast.success("Query executed successfully")
          return result
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to run query"
          set({ error: message, isLoading: false })
          toast.error(`Failed to run query: ${message}`)
          throw error
        }
      },      updateQuery: async (queryId: string, query: Partial<QueryConfig>): Promise<void> => {
        set({ isLoading: true, error: null })
        try {
          const headers = await getAuthHeaders()
          const response = await fetch(`/api/queries/${queryId}`, {
            method: "PATCH",
            headers,
            credentials: "include",
            body: JSON.stringify(query),
          })
          if (!response.ok) throw new Error("Failed to update query")
          set((state: QueriesStoreType): QueriesState => ({
            queries: state.queries.map((q: QueryConfig) =>
              q.id === queryId ? { ...q, ...query } : q
            ),
            isLoading: false,
            error: null
          }))
          toast.success("Query updated successfully")
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to delete query"
          set({ error: message, isLoading: false })
          toast.error(`Failed to delete query: ${message}`)
          throw error
        }
      },      deleteQuery: async (queryId: string): Promise<void> => {
        set({ isLoading: true, error: null })
        try {
          const headers = await getAuthHeaders()
          const response = await fetch(`/api/queries/${queryId}`, {
            method: "DELETE",
            headers,
            credentials: "include"
          })
          if (response.status === 401) {
            toast.error("Please log in to delete queries")
            throw new Error("Unauthorized")
          }
          if (!response.ok) {
            const error = await response.json()
            throw new Error(error.details || "Failed to delete query")
          }
          set((state: QueriesStoreType): QueriesState => ({
            queries: state.queries.filter((q: QueryConfig) => q.id !== queryId),
            isLoading: false,
            error: null
          }))
          // Recalculate analytics after delete
          const { fetchSnapshots } = require('./use-snapshots-store')
          const { useAnalyticsStore } = require('./use-analytics-store')
          const userId = typeof window !== 'undefined' ? localStorage.getItem('user_id') : null
          if (userId) {
            // Fetch latest snapshots for user, then recalculate analytics
            fetchSnapshots(undefined, userId).then(() => {
              const snapshots = require('./use-snapshots-store').useSnapshotsStore.getState().snapshots
              useAnalyticsStore.getState().calculateAnalyticsFromSnapshots(snapshots)
            })
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to delete query"
          set({ error: message, isLoading: false })
          toast.error(`Failed to delete query: ${message}`)
          throw error
        }
      },      clearQueries: () => {
        set({ queries: [], error: null })
      },    }),
    {
      name: 'queries-storage',
      partialize: (state: QueriesStoreType) => ({ queries: state.queries }),
    }
  )
)