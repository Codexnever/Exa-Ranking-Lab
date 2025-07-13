import { useAuth } from "@/lib/contexts/auth-context"
import { useSnapshotsStore } from "@/app/store"

export const useSnapshots = () => {
  const store = useSnapshotsStore()
  const { user } = useAuth()
  const userId = user?.$id
  return {
    snapshots: store.snapshots,
    isLoading: store.isLoading,
    error: store.error,
    fetchSnapshots: (queryId?: string) => store.fetchSnapshots(queryId, userId),
    getSnapshot: (id: string) => store.getSnapshot(id),
    compareSnapshots: store.compareSnapshots,
  }
}