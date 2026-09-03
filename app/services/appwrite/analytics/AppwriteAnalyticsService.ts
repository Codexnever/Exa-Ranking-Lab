// app/services/AppwriteAnalyticsService.ts

import { AnalyticsService } from "../../../logic/analytics-service"

import type {
  AnalyticsData,
  QueryConfig,
  RankingSnapshot,
  EnhancedAnalyticsData,
  HourlyStats,
} from "@/types/type"

/**
 * Normalizes hourly analytics data so confidence intervals always use
 * a consistent two-number tuple.
 */
function fixHourlyStats(
  values: any[],
): HourlyStats[] {
  return (values ?? []).map((item: any) => ({
    ...item,
    confidenceInterval:
      Array.isArray(item.confidenceInterval) &&
      item.confidenceInterval.length === 2
        ? ([
            Number(item.confidenceInterval[0]),
            Number(item.confidenceInterval[1]),
          ] as [number, number])
        : ([0, 0] as [number, number]),
  }))
}

/**
 * Normalizes query trend values before exposing them to analytics consumers.
 *
 * Unknown trend values fall back to "stable" so downstream components can
 * rely on a predictable set of states.
 */
function fixTopPerformingQueries(
  values: any[],
): any[] {
  const validTrends = new Set([
    "up",
    "down",
    "stable",
  ])

  return (values ?? []).map((item) => ({
    ...item,
    trend: validTrends.has(item.trend)
      ? item.trend
      : "stable",
  }))
}

export class AppwriteAnalyticsService extends AnalyticsService {
  constructor(isLocal = false) {
    super(isLocal)
  }

  /**
   * Fetches and calculates analytics for an Appwrite-backed user.
   *
   * The base service performs snapshot retrieval and the full analytics
   * calculation. This layer only normalizes response shapes and applies
   * Appwrite-specific metadata.
   */
  async getAnalytics(
    userId?: string,
    timeRangeMs?: number,
    queries: QueryConfig[] = [],
  ): Promise<EnhancedAnalyticsData> {
    try {
      const result = await super.getAnalytics(
        userId,
        timeRangeMs,
        queries,
      )

      /*
       * Normalize response fields again at the Appwrite boundary so callers
       * receive stable tuple and trend types even if upstream data changes.
       */
      const successRateByHour =
        fixHourlyStats(
          result.successRateByHour,
        )

      const performanceData =
        fixHourlyStats(
          result.performanceData,
        )

      const topPerformingQueries =
        fixTopPerformingQueries(
          result.topPerformingQueries,
        )

      return {
        ...result,
        successRateByHour,
        performanceData,
        topPerformingQueries,
        isAppwriteSource: true,
        dataSourceType: "appwrite",
        calculatedAt: new Date().toISOString(),
      }
    } catch (error) {
      console.error(
        "[AppwriteAnalyticsService] getAnalytics failed:",
        error,
      )

      return this.getDefaultEnhancedAnalytics()
    }
  }

  /**
   * Calculates analytics directly from an existing snapshot collection.
   *
   * This path avoids Appwrite retrieval and delegates the calculation to
   * the shared analytics implementation in the base service.
   */
  calculateAnalyticsFromSnapshots(
    snapshots: RankingSnapshot[],
    _queries: QueryConfig[] = [],
  ): AnalyticsData {
    return super.calculateAnalyticsFromSnapshots(
      snapshots,
    )
  }

  /**
   * Returns the default analytics payload with Appwrite source metadata.
   */
  protected override getDefaultEnhancedAnalytics(): EnhancedAnalyticsData {
    return {
      ...super.getDefaultEnhancedAnalytics(),
      isAppwriteSource: true,
      dataSourceType: "appwrite",
      calculatedAt: new Date().toISOString(),
    }
  }
}