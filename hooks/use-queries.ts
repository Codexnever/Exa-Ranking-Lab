import { useQueriesStore } from "@/store"

export const useQueries = () => {
  const store = useQueriesStore()
  return {
    queries: store.queries,
    isLoading: store.isLoading,
    error: store.error,
    fetchQueries: store.fetchQueries,
    createQuery: store.createQuery,
    runQuery: store.runQuery,
    updateQuery: store.updateQuery,
  }
}