import { create } from "zustand"
import { persist } from "zustand/middleware"
import { toast } from "sonner"
import type { AnalyticsData } from "@/lib/types"

interface AnalyticsState {
  analytics: AnalyticsData | null
  isLoading: boolean
  error: string | null
}

interface AnalyticsActions {
  fetchAnalytics: () => Promise<void>
  clearAnalytics: () => void
}

type AnalyticsStore = AnalyticsState & AnalyticsActions

export const useAnalyticsStore = create<AnalyticsStore>()(
  persist(
    (set) => ({
      analytics: null,
      isLoading: false,
      error: null,

      fetchAnalytics: async () => {
        set({ isLoading: true, error: null })
        try {
          let url = "/api/analytics"
          const response = await fetch(url)
          if (!response.ok) throw new Error("Failed to fetch analytics")
          const analytics = await response.json()
        console.log('Checking analytics',analytics,'url',url)
          set({ analytics, isLoading: false, error: null })
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to fetch analytics"
          set({ error: message, isLoading: false })
          toast.error(`Failed to fetch analytics: ${message}`)
        }
      },

      clearAnalytics: () => {
        set({ analytics: null, error: null })
      },
    }),
    {
      name: 'analytics-storage',
      partialize: (state) => ({ analytics: state.analytics }),
    }
  )
)