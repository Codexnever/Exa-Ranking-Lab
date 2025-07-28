// app/store/use-snapshots-store.ts
import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import { toast } from "sonner"
import type { RankingSnapshot, RankingChange } from "@/lib/type"

interface SnapshotsState {
  // Paginated data for display
  paginatedSnapshots: RankingSnapshot[]
  pagination: {
    currentPage: number
    totalPages: number
    totalItems: number
    itemsPerPage: number
  }
  
  // Complete dataset for analytics (separate from pagination)
  allSnapshots: RankingSnapshot[]
  
  // Loading states
  isLoadingPaginated: boolean
  isLoadingAnalytics: boolean
  error: string | null
  lastFetch: number | null
  
  // ✅ Add hydration tracking
  isHydrated: boolean
  lastUserId: string | null
}

interface SnapshotsActions {
  // Paginated fetching for UI display
  fetchPaginatedSnapshots: (page: number, limit: number, userId?: string, queryId?: string) => Promise<void>
  
  // Complete dataset fetching for analytics
  fetchAllSnapshots: (userId?: string, queryId?: string) => Promise<void>
  
  // Combined fetch for initial load
  fetchSnapshotsComplete: (page: number, limit: number, userId?: string) => Promise<void>
  
  // ✅ Enhanced refresh method
  forceRefresh: (userId: string) => Promise<void>
  
  // Pagination controls
  setPage: (page: number) => void
  setItemsPerPage: (limit: number) => void
  
  // Additional helpers
  addSnapshot: (snapshot: RankingSnapshot) => void
  setSnapshots: (snapshots: RankingSnapshot[]) => void
  getSnapshot: (id: string) => Promise<RankingSnapshot | undefined>
  compareSnapshots: (snapshotIds: string[]) => Promise<RankingChange[]>
  clearSnapshots: () => void
  
  // ✅ Hydration control
  setHydrated: () => void
  checkAndRefreshIfEmpty: (userId: string) => Promise<void>
}

type SnapshotsStore = SnapshotsState & SnapshotsActions

export const useSnapshotsStore = create<SnapshotsStore>()(
  persist(
    (set, get) => ({
      // Paginated data
      paginatedSnapshots: [],
      pagination: {
        currentPage: 1,
        totalPages: 0,
        totalItems: 0,
        itemsPerPage: 20
      },
      
      // Complete dataset
      allSnapshots: [],
      
      // Loading states
      isLoadingPaginated: false,
      isLoadingAnalytics: false,
      error: null,
      lastFetch: null,
      
      // ✅ Hydration tracking
      isHydrated: false,
      lastUserId: null,

      // ✅ Set hydration flag
      setHydrated: () => {
        set({ isHydrated: true })
      },

      // ✅ Check if data is empty and refresh if needed
      checkAndRefreshIfEmpty: async (userId: string) => {
        const { allSnapshots, lastUserId, isHydrated } = get()
        
        console.log('[SnapshotsStore] Checking data state:', {
          snapshotsCount: allSnapshots.length,
          lastUserId,
          currentUserId: userId,
          isHydrated
        })
        
        // If no data or different user, force refresh
        if (!isHydrated || allSnapshots.length === 0 || lastUserId !== userId) {
          console.log('[SnapshotsStore] Data empty or stale, forcing refresh')
          await get().forceRefresh(userId)
        }
      },

      // ✅ Enhanced force refresh method
      forceRefresh: async (userId: string) => {
        console.log('[SnapshotsStore] Force refreshing data for user:', userId)
        
        set({ 
          isLoadingAnalytics: true, 
          error: null,
          lastUserId: userId 
        })
        
        try {
          // Clear existing data first
          set({ allSnapshots: [] })
          
          // Fetch fresh data
          await get().fetchAllSnapshots(userId)
          
          console.log('[SnapshotsStore] Force refresh completed')
        } catch (error) {
          console.error('[SnapshotsStore] Force refresh failed:', error)
          const message = error instanceof Error ? error.message : 'Failed to refresh data'
          set({ error: message, isLoadingAnalytics: false })
          toast.error(message)
        }
      },

      fetchPaginatedSnapshots: async (page: number, limit: number, userId?: string, queryId?: string) => {
        set({ isLoadingPaginated: true, error: null })
        
        try {
          let url = `/api/snapshots/paginated?page=${page}&limit=${limit}`
          if (userId) url += `&userId=${encodeURIComponent(userId)}`
          if (queryId) url += `&queryId=${encodeURIComponent(queryId)}`

          console.log('[SnapshotsStore] Fetching paginated snapshots:', url)

          const response = await fetch(url, { credentials: 'include' })
          if (!response.ok) {
            throw new Error(`Failed to fetch paginated snapshots: ${response.status}`)
          }
          
          const result = await response.json()
          
          console.log('[SnapshotsStore] Paginated fetch result:', {
            dataLength: result.data?.length,
            pagination: result.pagination
          })
          
          set({
            paginatedSnapshots: result.data || [],
            pagination: {
              currentPage: result.pagination?.page || page,
              totalPages: result.pagination?.totalPages || 0,
              totalItems: result.pagination?.total || 0,
              itemsPerPage: result.pagination?.limit || limit
            },
            isLoadingPaginated: false,
            error: null
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to fetch paginated snapshots'
          console.error('[SnapshotsStore] Paginated fetch error:', error)
          set({ 
            error: message,
            isLoadingPaginated: false,
            paginatedSnapshots: []
          })
          toast.error(message)
        }
      },

      fetchAllSnapshots: async (userId?: string, queryId?: string) => {
        set({ isLoadingAnalytics: true, error: null })
        
        try {
          let url = '/api/snapshots/analytics'
          const params = []
          if (userId) params.push(`userId=${encodeURIComponent(userId)}`)
          if (queryId) params.push(`queryId=${encodeURIComponent(queryId)}`)
          if (params.length > 0) url += `?${params.join('&')}`

          console.log('[SnapshotsStore] Fetching all snapshots for analytics:', url)

          const response = await fetch(url, { credentials: 'include' })
          if (!response.ok) {
            throw new Error(`Failed to fetch analytics snapshots: ${response.status}`)
          }
          
          const allSnapshots = await response.json()
          
          console.log('[SnapshotsStore] Analytics fetch result:', allSnapshots.length, 'snapshots')
          
          // ✅ Enhanced validation and sorting
          const validSnapshots = Array.isArray(allSnapshots) 
            ? allSnapshots.filter(s => s && s.id && s.timestamp) // Filter out invalid entries
            : []
          
          const sortedSnapshots = validSnapshots.sort((a, b) => 
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          )
          
          set({
            allSnapshots: sortedSnapshots,
            isLoadingAnalytics: false,
            error: null,
            lastFetch: Date.now(),
            lastUserId: userId || null
          })
          
          console.log('[SnapshotsStore] Successfully stored', sortedSnapshots.length, 'valid snapshots')
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to fetch analytics snapshots'
          console.error('[SnapshotsStore] Analytics fetch error:', error)
          set({ 
            error: message,
            isLoadingAnalytics: false 
          })
          toast.error(message)
        }
      },

      fetchSnapshotsComplete: async (page: number, limit: number, userId?: string) => {
        console.log('[SnapshotsStore] Fetching complete snapshots data')
        
        // Fetch both paginated and complete data in parallel
        try {
          await Promise.all([
            get().fetchPaginatedSnapshots(page, limit, userId),
            get().fetchAllSnapshots(userId)
          ])
          console.log('[SnapshotsStore] Complete fetch successful')
        } catch (error) {
          console.error('[SnapshotsStore] Complete fetch failed:', error)
        }
      },

      setPage: async (page: number) => {
        const { pagination } = get()
        if (page !== pagination.currentPage && page >= 1 && page <= pagination.totalPages) {
          console.log('[SnapshotsStore] Changing page to:', page)
          
          const userId = localStorage.getItem('currentUserId') || undefined
          await get().fetchPaginatedSnapshots(page, pagination.itemsPerPage, userId)
        }
      },

      setItemsPerPage: async (limit: number) => {
        const { pagination } = get()
        if (limit !== pagination.itemsPerPage) {
          console.log('[SnapshotsStore] Changing items per page to:', limit)
          
          const userId = localStorage.getItem('currentUserId') || undefined
          await get().fetchPaginatedSnapshots(1, limit, userId)
        }
      },

      // Legacy methods for backward compatibility
      addSnapshot: (snapshot: RankingSnapshot) => {
        const { allSnapshots } = get()
        
        // Check if snapshot already exists
        const exists = allSnapshots.find(s => s.id === snapshot.id)
        if (exists) return

        // Add to complete dataset and sort
        const updated = [snapshot, ...allSnapshots].sort((a, b) => 
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        )
        
        set({ allSnapshots: updated })
      },

      setSnapshots: (snapshots: RankingSnapshot[]) => {
        const sorted = snapshots.sort((a, b) => 
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        )
        set({ allSnapshots: sorted })
      },

      getSnapshot: async (id: string) => {
        const { allSnapshots, paginatedSnapshots } = get()
        
        // Check in paginated first (faster)
        let snapshot = paginatedSnapshots.find(s => s.id === id)
        if (snapshot) return snapshot
        
        // Check in complete dataset
        snapshot = allSnapshots.find(s => s.id === id)
        return snapshot
      },

      compareSnapshots: async (snapshotIds: string[]) => {
        set({ isLoadingPaginated: true, error: null })
        
        try {
          const response = await fetch("/api/snapshots/compare", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: 'include',
            body: JSON.stringify({ snapshotIds }),
          })
          
          if (!response.ok) throw new Error("Failed to compare snapshots")
          
          const changes = await response.json()
          set({ isLoadingPaginated: false, error: null })
          return changes
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to compare snapshots"
          set({ error: message, isLoadingPaginated: false })
          toast.error(message)
          throw error
        }
      },

      clearSnapshots: () => {
        set({
          paginatedSnapshots: [],
          allSnapshots: [],
          pagination: {
            currentPage: 1,
            totalPages: 0,
            totalItems: 0,
            itemsPerPage: 20
          },
          error: null,
          lastFetch: null,
          lastUserId: null
        })
      }
    }),
    {
      name: 'snapshots-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // ✅ Enhanced persistence
        allSnapshots: state.allSnapshots,
        pagination: {
          currentPage: 1,
          totalPages: 0,
          totalItems: 0,
          itemsPerPage: state.pagination.itemsPerPage
        },
        lastFetch: state.lastFetch,
        lastUserId: state.lastUserId, // ✅ Persist last user ID
      }),
      // ✅ Add hydration callback
      onRehydrateStorage: () => (state) => {
        console.log('[SnapshotsStore] Hydration completed:', {
          snapshotsCount: state?.allSnapshots?.length || 0,
          lastUserId: state?.lastUserId
        })
        state?.setHydrated()
      }
    }
  )
)
