// app/services/analytics-service.ts
import { databases, DATABASE_ID, COLLECTIONS, Query, ID } from "@/app/server/appwrite/appwrite-server"

import { calculateStandardDeviation } from "@/app/services/appwrite/analytics-calculations"
import type {
  EnhancedAnalyticsData,
  AnalyticsData,
  RankingSnapshot,
  QueryConfig,
  DataQualityResult,
  ResponseTimeStats,
  ExecutionFrequency,
  DataFreshness,
  ComplexityMetrics,
  HourlyStats,
} from "@/types/type"
import { loadFromStorage, transformSnapshotDocument } from "../../utils/db-utils"
import { analyticsCalculations, predictTrend } from "@/app/logic/analyticsLogic"
import { getTimeRangeString } from "@/utils/timeRangeString"

// ─── Module-level normalizers (not inside method bodies) ──────────────────────

function fixHourlyStats(arr: any[]): HourlyStats[] {
  return (arr ?? []).map((h: any) => ({
    ...h,
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

// ─── Safe spread-free min/max for large arrays ────────────────────────────────
function arrayMin(arr: number[]): number {
  return arr.reduce((m, v) => (v < m ? v : m), arr[0] ?? 0)
}
function arrayMax(arr: number[]): number {
  return arr.reduce((m, v) => (v > m ? v : m), arr[0] ?? 0)
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class AnalyticsService {
  private isLocal: boolean

  constructor(isLocal: boolean) {
    this.isLocal = isLocal
  }

  // ── Data fetching ──────────────────────────────────────────────────────────

  async getAnalytics(
    userId?:     string,
    timeRangeMs?: number,
    // ✅ Accept queries so categoryDistribution is populated
    queries:     QueryConfig[] = []
  ): Promise<EnhancedAnalyticsData> {
    try {
      let snapshots: RankingSnapshot[] = []

      if (this.isLocal) {
        snapshots = loadFromStorage<RankingSnapshot>("snapshots")
        if (userId) snapshots = snapshots.filter(s => s.userId === userId)
        if (timeRangeMs) {
          const cutoff = Date.now() - timeRangeMs
          snapshots = snapshots.filter(s => new Date(s.timestamp).getTime() > cutoff)
        }
      } else {
        const q: string[] = userId ? [Query.equal("userId", userId)] : []
        if (timeRangeMs) {
          q.push(Query.greaterThan("timestamp", new Date(Date.now() - timeRangeMs).toISOString()))
        }

        const collectionId = COLLECTIONS.SNAPSHOTS || "683382eb0006b9130dc5"
        const response     = await databases.listDocuments(DATABASE_ID, collectionId, q)

        snapshots = response.documents
          .map(doc => {
            try   { return transformSnapshotDocument(doc, this.isLocal) }
            catch (err) { console.warn("[AnalyticsService] Failed to transform snapshot:", err); return null }
          })
          .filter((s): s is RankingSnapshot => s !== null)
      }

      snapshots.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      console.log(`[AnalyticsService] Fetched ${snapshots.length} snapshots for user ${userId ?? "all"}`)

      return this.calculateEnhancedAnalyticsFromSnapshots(snapshots, queries)
    } catch (err) {
      console.error("[AnalyticsService] getAnalytics failed:", err)
      return this.getDefaultEnhancedAnalytics()
    }
  }

  // ── Enhanced analytics calculation ────────────────────────────────────────

  calculateEnhancedAnalyticsFromSnapshots(
    snapshots: RankingSnapshot[],
    queries:   QueryConfig[] = []       //  queries param so categories are populated
  ): EnhancedAnalyticsData {
    if (!snapshots?.length) {
      console.warn("[AnalyticsService] No snapshots for calculation.")
      return this.getDefaultEnhancedAnalytics()
    }

    //  Safe min/max — no spread on large arrays
    const timestamps   = snapshots.map(s => new Date(s.timestamp).getTime())
    const rangeMs      = arrayMax(timestamps) - arrayMin(timestamps)
    // Use 30d as floor so single-snapshot sets get meaningful range
    const timeRangeStr = getTimeRangeString(Math.max(rangeMs, 30 * 24 * 60 * 60 * 1000))

    const analytics = analyticsCalculations(queries, snapshots, timeRangeStr)

    const dataQuality       = this.assessDataQuality(snapshots)
    const responseTimeStats = this.calculateResponseTimeStatistics(snapshots)
    const executionFrequency = this.calculateExecutionFrequency(snapshots)
    const dataFreshness     = this.calculateDataFreshness(snapshots)
    const complexityMetrics = this.calculateComplexityMetrics(snapshots)

    return {
      //  Spread analytics first so all its fields (including timeRangeMs) are preserved
      ...analytics,
      //  Normalise tuple types
      successRateByHour:     fixHourlyStats(analytics.successRateByHour),
      performanceData:       fixHourlyStats(analytics.performanceData),
      topPerformingQueries:  fixTopPerformingQueries(analytics.topPerformingQueries),
      // Enhanced fields
      dataQuality,
      responseTimeStats,
      executionFrequency,
      dataFreshness,
      complexityMetrics,
      // Metadata
      isAppwriteSource:  true,
      calculatedAt:      new Date().toISOString(),
      dataSourceType:    "appwrite",
      contentCoherence:  undefined,
      semanticStability: undefined,
    }
  }

  // ── Legacy method — delegates to enhanced version ─────────────────────────

  calculateAnalyticsFromSnapshots(snapshots: RankingSnapshot[]): AnalyticsData {
    if (!snapshots?.length) {
      console.warn("[AnalyticsService] No snapshots for calculation.")
      return this.getDefaultAnalytics()
    }

    // Reuse the enhanced calculation and pick out the AnalyticsData fields
    const enhanced = this.calculateEnhancedAnalyticsFromSnapshots(snapshots)

    return {
      //  Spread the enhanced object to automatically include all core AnalyticsData properties
      ...enhanced,
      rankingStability:    enhanced.rankingStability    ?? 0,
      volatilityIndex:     enhanced.volatilityIndex     ?? 0,
      domainDiversity:     enhanced.domainDiversity     ?? 0,
      avgResponseTime:     enhanced.avgResponseTime     ?? 0,
      newContentDiscovery: enhanced.newContentDiscovery ?? 0,
      querySuccessRate:    enhanced.querySuccessRate    ?? 0,
      trendSlope:          enhanced.trendSlope          ?? 0,
      predictedPosition:   enhanced.predictedPosition   ?? 0,
      isAnomaly:           enhanced.isAnomaly            ?? false,
    }
  }

  // ── Statistical helpers ────────────────────────────────────────────────────

  protected extractDocumentsFromSnapshots(
    snapshots: RankingSnapshot[]
  ): Array<{ title: string; content: string; vector?: number[] }> {
    return snapshots.flatMap(s =>
      (s.results ?? [])
        .filter(r => r.title && r.snippet)
        .map(r => ({ title: r.title!, content: r.snippet!, vector: r.vector }))
    )
  }

  protected extractTimeSeriesFromSnapshots(
    snapshots: RankingSnapshot[]
  ): Array<{ timestamp: number; content: string; vectors?: number[][] }> {
    return snapshots
      .map(s => {
        const content = (s.results ?? [])
          .map(r => `${r.title ?? ""} ${r.snippet ?? ""}`)
          .join(" ")
          .trim()
        const vectors = (s.results ?? [])
          .map(r => r.vector)
          .filter((v): v is number[] => !!v?.length)
        return {
          timestamp: new Date(s.timestamp).getTime(),
          content,
          vectors: vectors.length > 0 ? vectors : undefined,
        }
      })
      .filter(item => item.content.length > 0)
      .sort((a, b) => a.timestamp - b.timestamp)
  }

  protected assessDataQuality(snapshots: RankingSnapshot[]): DataQualityResult {
    const now  = Date.now()
    const n    = snapshots.length
    let valid  = 0, complete = 0, consistent = 0, anomalies = 0
    const ages: number[] = []

    for (const s of snapshots) {
      if (Array.isArray(s.results))                                           valid++
      if (s.results?.length > 0 && s.results.every(r => r.url && r.title))   complete++
      if (s.results?.every((r, i) => r.position === i + 1 || r.position > 0)) consistent++
      if (s.results?.length === 0 || (s.results?.length ?? 0) > 50)          anomalies++
      ages.push(now - new Date(s.timestamp).getTime())
    }

    const avgAge = ages.length > 0
      ? ages.reduce((s, a) => s + a, 0) / ages.length
      : 0

    return {
      completeness: n > 0 ? (complete   / n) * 100 : 0,
      accuracy:     n > 0 ? (valid      / n) * 100 : 0,
      consistency:  n > 0 ? (consistent / n) * 100 : 0,
      freshness:    Math.max(0, 100 - (avgAge / (24 * 60 * 60 * 1000)) * 10),
      validity:     n > 0 ? (valid      / n) * 100 : 0,
      anomalyCount: anomalies,
      assessedAt:   now,
    }
  }

  protected calculateResponseTimeStatistics(
    snapshots: RankingSnapshot[]
  ): ResponseTimeStats {
    const times = snapshots
      .map(s => s.metadata?.responseTime)
      .filter((t): t is number => typeof t === "number")

    if (!times.length) return { min: 0, max: 0, mean: 0, median: 0, stdDev: 0, percentile95: 0 }

    const sorted  = [...times].sort((a, b) => a - b)
    const mean    = times.reduce((s, t) => s + t, 0) / times.length
    const stdDev  = calculateStandardDeviation(times)

    return {
      min:          sorted[0],
      max:          sorted[sorted.length - 1],
      mean:         parseFloat(mean.toFixed(2)),
      median:       sorted[Math.floor(sorted.length / 2)],
      stdDev:       parseFloat(stdDev.toFixed(2)),
      percentile95: sorted[Math.floor(sorted.length * 0.95)] ?? sorted[sorted.length - 1],
    }
  }

  protected calculateExecutionFrequency(snapshots: RankingSnapshot[]): ExecutionFrequency {
    const times = snapshots
      .map(s => new Date(s.timestamp).getTime())
      .sort((a, b) => a - b)

    if (times.length < 2) {
      return { frequency: 0, efficiency: 100, pattern: "insufficient_data", avgInterval: 0 }
    }

    const intervals: number[] = []
    for (let i = 1; i < times.length; i++) {
      intervals.push(times[i] - times[i - 1])
    }

    const avgInterval = intervals.reduce((s, v) => s + v, 0) / intervals.length
    const frequency   = avgInterval > 0 ? (24 * 60 * 60 * 1000) / avgInterval : 0
    const sd          = calculateStandardDeviation(intervals)
    const efficiency  = Math.max(0, 100 - (sd / avgInterval) * 100)

    return {
      frequency:    parseFloat(frequency.toFixed(2)),
      efficiency:   parseFloat(efficiency.toFixed(2)),
      pattern:      this.determineExecutionPattern(intervals),
      avgInterval:  parseFloat(avgInterval.toFixed(2)),
    }
  }

  protected calculateDataFreshness(snapshots: RankingSnapshot[]): DataFreshness {
    const now  = Date.now()
    const ages = snapshots.map(s => now - new Date(s.timestamp).getTime())

    const avgAge = ages.length > 0 ? ages.reduce((s, a) => s + a, 0) / ages.length : 0
    const maxAge = ages.length > 0 ? arrayMax(ages) : 0
    const score  = Math.max(0, 100 - (avgAge / (24 * 60 * 60 * 1000)) * 10)

    return {
      avgAgeHours:        parseFloat((avgAge / 3_600_000).toFixed(2)),
      maxAgeHours:        parseFloat((maxAge / 3_600_000).toFixed(2)),
      freshnessScore:     parseFloat(score.toFixed(2)),
      stalenessIndicator: score < 50 ? "stale" : score < 80 ? "moderate" : "fresh",
    }
  }

  protected calculateComplexityMetrics(snapshots: RankingSnapshot[]): ComplexityMetrics {
    const scores = snapshots.map(s => {
      const resultCount  = s.results?.length ?? 0
      const responseTime = typeof s.metadata?.responseTime === "number"
        ? s.metadata.responseTime
        : 0
      const domains      = new Set((s.results ?? []).map(r => r.domain).filter(Boolean)).size
      return (
        Math.min(resultCount  / 10, 5) +
        Math.min(responseTime / 1000, 3) +
        Math.min(domains      / 5,   2)
      )
    })

    const avg = scores.length > 0
      ? scores.reduce((s, v) => s + v, 0) / scores.length
      : 0

    return {
      avgComplexityScore:      parseFloat(avg.toFixed(2)),
      complexityDistribution:  this.calculateStatistics(scores),
      highComplexityQueries:   scores.filter(s => s > avg * 1.5).length,
    }
  }

  protected determineExecutionPattern(intervals: number[]): string {
    if (intervals.length < 3) return "insufficient_data"
    const avg = intervals.reduce((s, v) => s + v, 0) / intervals.length
    const cv  = calculateStandardDeviation(intervals) / avg
    if (cv < 0.1) return "very_regular"
    if (cv < 0.3) return "regular"
    if (cv < 0.6) return "irregular"
    return "highly_irregular"
  }

  protected calculateStatistics(values: number[]) {
    if (!values.length) return { min: 0, max: 0, mean: 0, median: 0, stdDev: 0, percentile95: 0 }
    const sorted = [...values].sort((a, b) => a - b)
    const mean   = values.reduce((s, v) => s + v, 0) / values.length
    return {
      min:          sorted[0],
      max:          sorted[sorted.length - 1],
      mean:         parseFloat(mean.toFixed(2)),
      median:       sorted[Math.floor(sorted.length / 2)],
      stdDev:       parseFloat(calculateStandardDeviation(values).toFixed(2)),
      percentile95: sorted[Math.floor(sorted.length * 0.95)] ?? sorted[sorted.length - 1],
    }
  }

  // ── Ranking metrics (used by calculateAnalyticsFromSnapshots) ─────────────

  protected calculateRankingMetrics(
    snapshotsByQuery: Record<string, RankingSnapshot[]>
  ): { stabilityScore: number; volatilityIndex: number } {
    let changes = 0, comparisons = 0

    for (const snaps of Object.values(snapshotsByQuery)) {
      snaps.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

      for (let i = 1; i < snaps.length; i++) {
        const prev = snaps[i - 1].results?.map(r => r.url) ?? []
        const curr = snaps[i].results?.map(r => r.url) ?? []
        const maxLen = Math.max(prev.length, curr.length)

        for (let j = 0; j < maxLen; j++) {
          if (!prev[j] || !curr[j] || prev[j] !== curr[j]) changes++
          comparisons++
        }
      }
    }

    const stabilityScore  = comparisons > 0 ? 100 - (changes / comparisons) * 100 : 100
    const volatilityIndex = comparisons > 0 ? (changes / comparisons) * 10         : 0

    return { stabilityScore, volatilityIndex }
  }

  // ── Defaults ───────────────────────────────────────────────────────────────

  protected getDefaultEnhancedAnalytics(): EnhancedAnalyticsData {
    return {
      timeRangeMs:           0,
      filteredSnapshots:     [],
      rankingTrendData:      [],
      categoryDistribution:  [],
      successRateByHour:     [],
      performanceData:       [],
      topPerformingQueries:  [],
      queryPerformanceStats: [],
      rankingStability:      0,
      volatilityIndex:       0,
      domainDiversity:       0,
      avgResponseTime:       0,
      newContentDiscovery:   0,
      querySuccessRate:      0,
      trendSlope:            0,
      predictedPosition:     0,
      isAnomaly:             false,
      contentCoherence:      undefined,
      semanticStability:     undefined,
      dataQuality: {
        completeness: 0, accuracy: 0, consistency: 0,
        freshness: 0, validity: 0, anomalyCount: 0, assessedAt: Date.now(),
      },
      responseTimeStats: {
        min: 0, max: 0, mean: 0, median: 0, stdDev: 0, percentile95: 0,
      },
      executionFrequency: {
        frequency: 0, efficiency: 100, pattern: "insufficient_data", avgInterval: 0,
      },
      dataFreshness: {
        avgAgeHours: 0, maxAgeHours: 0, freshnessScore: 0, stalenessIndicator: "fresh",
      },
      complexityMetrics: {
        avgComplexityScore:     0,
        complexityDistribution: { min: 0, max: 0, mean: 0, median: 0, stdDev: 0, percentile95: 0 },
        highComplexityQueries:  0,
      },
      calculatedAt:     new Date().toISOString(),
      dataSourceType:   "appwrite",
      isAppwriteSource: true,
    }
  }

protected getDefaultAnalytics(): AnalyticsData {
    return {
      //  Add the missing required core metrics
      timeRangeMs:           0,
      filteredSnapshots:     [],
      rankingTrendData:      [],
      categoryDistribution:  [],
      successRateByHour:     [],
      performanceData:       [],
      topPerformingQueries:  [],
      queryPerformanceStats: [],
      
      // Existing fields
      rankingStability:    0,
      volatilityIndex:     0,
      domainDiversity:     0,
      avgResponseTime:     0,
      newContentDiscovery: 0,
      querySuccessRate:    0,
      trendSlope:          0,
      predictedPosition:   0,
      isAnomaly:           false,
    }
  }
}