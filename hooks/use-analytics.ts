import { useAuth } from "@/contexts/auth-context"
import { useAnalyticsStore } from "@/store"

export const useAnalytics = () => {
  const store = useAnalyticsStore()
  const { userId } = useAuth()
  return {
    analytics: store.analytics,
    isLoading: store.isLoading,
    error: store.error,
    fetchAnalytics: () => store.fetchAnalytics(),
    clearAnalytics: store.clearAnalytics,
  }
}