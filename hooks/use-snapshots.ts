import { useSnapshotsStore } from "@/store"

export const useSnapshots = (userId?: string) => {
  const store = useSnapshotsStore()
  return {
    snapshots: store.snapshots,
    isLoading: store.isLoading,
    error: store.error,
    fetchSnapshots: (queryId?: string) => store.fetchSnapshots(queryId, userId),
    getSnapshot: (id: string) => store.getSnapshot(id),
    compareSnapshots: store.compareSnapshots,
  }
}