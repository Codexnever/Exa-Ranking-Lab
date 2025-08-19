// app/hooks/useWeaviateAnalytics.ts
import { useState, useCallback } from 'react';
import type { QueryConfig } from '@/lib/type';
import type { WeaviateAnalyticsData } from '@/app/services/weaviate-analytics-service';

interface UseWeaviateAnalyticsResult {
  data: WeaviateAnalyticsData | null;
  loading: boolean;
  error: string | null;
  fetchAnalytics: (userId: string, timeRangeMs?: number, queries?: QueryConfig[]) => Promise<void>;
  refetch: () => Promise<void>;
}

interface ApiResponse {
  success: boolean;
  data?: WeaviateAnalyticsData;
  error?: string;
  timestamp: string;
}

export function useWeaviateAnalytics(): UseWeaviateAnalyticsResult {
  const [data, setData] = useState<WeaviateAnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastParams, setLastParams] = useState<{userId: string, timeRangeMs: number, queries: QueryConfig[]} | null>(null);

  const fetchAnalytics = useCallback(async (
    userId: string, 
    timeRangeMs: number = 30 * 24 * 60 * 60 * 1000,
    queries: QueryConfig[] = []
  ) => {
    if (!userId) {
      setError('User ID is required');
      return;
    }

    setLoading(true);
    setError(null);
    setLastParams({ userId, timeRangeMs, queries });

    try {
      console.log(`[Hook] Fetching Weaviate analytics for user: ${userId}`);

      // ✅ SECURE: Call your API proxy instead of Weaviate directly
      const response = await fetch('/api/weaviate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          timeRangeMs,
          queries
        })
      });

      const result: ApiResponse = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `HTTP error! status: ${response.status}`);
      }

      if (!result.success || !result.data) {
        throw new Error(result.error || 'No data received from server');
      }

      setData(result.data);
      console.log(`[Hook] Successfully fetched Weaviate analytics for user: ${userId}`);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      console.error('[Hook] Weaviate analytics fetch failed:', errorMessage);
      setError(errorMessage);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const refetch = useCallback(async () => {
    if (lastParams) {
      await fetchAnalytics(lastParams.userId, lastParams.timeRangeMs, lastParams.queries);
    }
  }, [lastParams, fetchAnalytics]);

  return {
    data,
    loading,
    error,
    fetchAnalytics,
    refetch
  };
}
