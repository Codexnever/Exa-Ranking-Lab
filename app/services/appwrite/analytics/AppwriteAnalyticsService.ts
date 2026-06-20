// app/services/AppwriteAnalyticsService.ts
import { AnalyticsService } from "../analytics-service"
import { getTimeRangeString } from "@/utils/timeRangeString"  // ✅ single source of truth
import type {
  AnalyticsData,
  QueryConfig,
  RankingSnapshot,
  EnhancedAnalyticsData,
  HourlyStats,
} from "@/types/type"

// ─── Module-level normalizers ─────────────────────────────────────────────────

function fixHourlyStats(arr: any[]): HourlyStats[] {
  return (arr ?? []).map((h: any) => ({
    ...h,
    // ✅ FIXED: was h.confidenceInterval (whole array) instead of h.confidenceInterval[1]
    confidenceInterval:
      Array.isArray(h.confidenceInterval) && h.confidenceInterval.length === 2
        ? ([Number(h.confidenceInterval[0]), Number(h.confidenceInterval[1])] as [number, number])
        : ([0, 0] as [number, number]),
  }))
}

function fixTopPerformingQueries(arr: any[]): any[] {
  const valid = new Set(["up", "down", "stable"])
  return (arr ?? []).map(item => ({
    ...item,
    trend: valid.has(item.trend) ? item.trend : "stable",
  }))
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class AppwriteAnalyticsService extends AnalyticsService {
  constructor(isLocal = false) {
    super(isLocal)
  }

  /**
   * Fetch + calculate analytics for a user.
   *
   * Flow:
   *   1. super.getAnalytics() fetches snapshots from Appwrite and runs
   *      calculateEnhancedAnalyticsFromSnapshots once internally.
   *   2. We take the result directly — no second analyticsCalculations() call.
   *   3. We layer on Appwrite-specific metadata (response times, freshness, etc.)
   *      that the base class calculation already computed but we want to
   *      surface explicitly.
   */
  async getAnalytics(
    userId?:     string,
    timeRangeMs?: number,
    queries:     QueryConfig[] = []
  ): Promise<EnhancedAnalyticsData> {
    try {
      // ✅ Single calculation — base class runs analyticsCalculations() internally
      const result = await super.getAnalytics(userId, timeRangeMs, queries)

      // Normalise tuple types (base already does this, but belt-and-suspenders)
      const successRateByHour    = fixHourlyStats(result.successRateByHour)
      const performanceData      = fixHourlyStats(result.performanceData)
      const topPerformingQueries = fixTopPerformingQueries(result.topPerformingQueries)

      return {
        ...result,
        successRateByHour,
        performanceData,
        topPerformingQueries,
        isAppwriteSource: true,
        dataSourceType:   "appwrite",
        calculatedAt:     new Date().toISOString(),
      }
    } catch (err) {
      console.error("[AppwriteAnalyticsService] getAnalytics failed:", err)
      return this.getDefaultEnhancedAnalytics()
    }
  }

  /**
   * Calculate analytics directly from a snapshot array (no Appwrite fetch).
   * Used by the Zustand store's calculateAnalyticsFromSnapshots action.
   */
  calculateAnalyticsFromSnapshots(
    snapshots: RankingSnapshot[],
    queries:   QueryConfig[] = []
  ): AnalyticsData {
    // Delegate to base — it already does the full calculation
    return super.calculateAnalyticsFromSnapshots(snapshots)
  }

  // ── Default ────────────────────────────────────────────────────────────────

  protected override getDefaultEnhancedAnalytics(): EnhancedAnalyticsData {
    return {
      ...super.getDefaultEnhancedAnalytics(),
      isAppwriteSource: true,
      dataSourceType:   "appwrite",
      calculatedAt:     new Date().toISOString(),
    }
  }

  // ── NOTE ───────────────────────────────────────────────────────────────────
  // calculateExecutionFrequency, calculateDataFreshness, calculateStatistics,
  // determineExecutionPattern, calculateComplexityMetrics are all inherited
  // from AnalyticsService as protected methods. No need to redefine them here.
  // getTimeRangeString is imported from lib/timeRangeString — not duplicated.
}