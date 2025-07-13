import { create } from "zustand"
import { persist } from "zustand/middleware"
import { toast } from "sonner"
import type { RankingSnapshot, RankingChange } from "@/lib/type"

interface SnapshotsState {
  snapshots: RankingSnapshot[]
  isLoading: boolean
  error: string | null
}

interface SnapshotsActions {
  fetchSnapshots: (queryId?: string, userId?: string) => Promise<void>
  getSnapshot: (id: string) => Promise<RankingSnapshot | undefined>
  compareSnapshots: (snapshotIds: string[]) => Promise<RankingChange[]>
  setSnapshots: (snapshots: RankingSnapshot[]) => void
  clearSnapshots: () => void
}

type SnapshotsStore = SnapshotsState & SnapshotsActions

export const useSnapshotsStore = create<SnapshotsStore>()(
  persist(
    (set, get) => ({
      snapshots: [],
      isLoading: false,
      error: null,

      fetchSnapshots: async (queryId?: string, userId?: string) => {
        set({ isLoading: true, error: null })
        try {
          let url = "/api/snapshots"
          const params = []
          if (queryId) params.push(`queryId=${encodeURIComponent(queryId)}`)
          if (userId) params.push(`userId=${encodeURIComponent(userId)}`)
          if (params.length > 0) url += `?${params.join("&")}`

          const response = await fetch(url)
          console.log('Fetching Snapshot from use snapshot store',url)
          if (!response.ok) throw new Error("Failed to fetch snapshots")
          const snapshots = await response.json()
          console.log('Fetching Snapshot from use snapshot store',snapshots)
          set({ snapshots, isLoading: false, error: null })
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to fetch snapshots"
          set({ error: message, isLoading: false })
          toast.error(`Failed to fetch snapshots: ${message}`)
        }
      },

      getSnapshot: async (id: string) => {
        const { snapshots } = get()
        return snapshots.find((s) => s.id === id)
      },

      compareSnapshots: async (snapshotIds: string[]) => {
        set({ isLoading: true, error: null })
        try {
          const response = await fetch("/api/snapshots/compare", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ snapshotIds }),
          })
          if (!response.ok) throw new Error("Failed to compare snapshots")
          const changes = await response.json()
          set({ isLoading: false, error: null })
          return changes
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to compare snapshots"
          set({ error: message, isLoading: false })
          toast.error(`Failed to compare snapshots: ${message}`)
          throw error
        }
      },

      setSnapshots: (snapshots: RankingSnapshot[]) => {
        set({ snapshots })
      },

      clearSnapshots: () => {
        set({ snapshots: [], error: null })
      },
    }),
    {
      name: 'snapshots-storage',
      partialize: (state) => ({ snapshots: state.snapshots }),
    }
  )
)