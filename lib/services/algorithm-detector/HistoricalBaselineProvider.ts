import type { DriftAnalysisResult } from "@/types/type"
import type { HistoricalBaseline, HistoricalBaselineAvailabilityReasonCode, HistoricalBaselineProvider } from "./types"

const MAD_TO_SIGMA = 1.4826

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

function unavailableBaseline(reasonCode: HistoricalBaselineAvailabilityReasonCode, reason: string, historicalObservationCount = 0, historicalQueryCount = 0, windowCount = 0): HistoricalBaseline {
  return {
    mean: 0, standardDeviation: 0, sampleCount: windowCount, historicalObservationCount,
    historicalQueryCount, windowCount, median: 0, medianAbsoluteDeviation: 0,
    robustSigma: 0, windowAverages: [], available: false, availabilityReason: reason,
    availabilityReasonCode: reasonCode,
  }
}

/**
 * Historical buckets are correlation-window-sized [start, end) intervals
 * anchored at windowStartMs. windowStartMs itself is current and excluded; a
 * point exactly one duration earlier belongs to the newest historical bucket.
 * Each query's latest valid point per bucket wins, and accepted buckets have
 * equal weight regardless of their raw observation count.
 */
export class TimelineHistoricalBaselineProvider implements HistoricalBaselineProvider {
  async getBaseline(
    results: DriftAnalysisResult[], windowStartMs: number, windowEndMs: number,
    historicalWindowDays: number, minSamples: number, minQueries: number,
    minWindows: number, minQueriesPerWindow: number, correlationWindowMs: number,
  ): Promise<HistoricalBaseline> {
    const duration = Math.max(1, Math.trunc(correlationWindowMs))
    // The configured lookback covers history before the current correlation
    // window; it does not spend one window of that budget on current data.
    const historicalStartMs = windowStartMs - historicalWindowDays * 86_400_000
    const latestByBucketAndQuery = new Map<number, Map<string, { timestamp: number; driftScore: number }>>()
    const historicalQueries = new Set<string>()
    let historicalObservationCount = 0

    for (const result of results) {
      for (const point of result.driftTimeline ?? []) {
        const timestamp = new Date(point.timestamp).getTime()
        if (!Number.isFinite(timestamp) || timestamp < historicalStartMs || timestamp >= windowStartMs || !Number.isFinite(point.driftScore)) continue
        historicalObservationCount += 1
        historicalQueries.add(result.queryId)
        const bucketIndex = Math.floor((windowStartMs - timestamp - 1) / duration)
        const bucket = latestByBucketAndQuery.get(bucketIndex) ?? new Map()
        const existing = bucket.get(result.queryId)
        if (!existing || timestamp >= existing.timestamp) bucket.set(result.queryId, { timestamp, driftScore: point.driftScore })
        latestByBucketAndQuery.set(bucketIndex, bucket)
      }
    }

    const requiredSamples = Math.max(1, Math.trunc(minSamples))
    const requiredQueries = Math.max(1, Math.trunc(minQueries))
    const requiredWindows = Math.max(1, Math.trunc(minWindows))
    const requiredQueriesPerWindow = Math.max(1, Math.trunc(minQueriesPerWindow))
    const windowAverages = [...latestByBucketAndQuery.entries()]
      .sort(([left], [right]) => left - right)
      .flatMap(([, queryValues]) => {
        if (queryValues.size < requiredQueriesPerWindow) return []
        const values = [...queryValues.values()].map(value => value.driftScore)
        return [values.reduce((sum, value) => sum + value, 0) / values.length]
      })
    const historicalQueryCount = historicalQueries.size

    if (historicalObservationCount < requiredSamples) return unavailableBaseline("insufficient_observations", `Only ${historicalObservationCount} valid historical observations were available; ${requiredSamples} are required.`, historicalObservationCount, historicalQueryCount, windowAverages.length)
    if (historicalQueryCount < requiredQueries) return unavailableBaseline("insufficient_queries", `Only ${historicalQueryCount} distinct historical queries were available; ${requiredQueries} are required.`, historicalObservationCount, historicalQueryCount, windowAverages.length)
    if (latestByBucketAndQuery.size < requiredWindows) return unavailableBaseline("insufficient_valid_windows", `Only ${latestByBucketAndQuery.size} historical time windows contained valid observations; ${requiredWindows} are required.`, historicalObservationCount, historicalQueryCount, windowAverages.length)
    if (windowAverages.length < requiredWindows) return unavailableBaseline("insufficient_window_coverage", `Only ${windowAverages.length} historical category windows met the ${requiredQueriesPerWindow}-query coverage requirement; ${requiredWindows} windows are required.`, historicalObservationCount, historicalQueryCount, windowAverages.length)

    const mean = windowAverages.reduce((sum, score) => sum + score, 0) / windowAverages.length
    const variance = windowAverages.reduce((sum, score) => sum + (score - mean) ** 2, 0) / windowAverages.length
    const baselineMedian = median(windowAverages)
    const medianAbsoluteDeviation = median(windowAverages.map(value => Math.abs(value - baselineMedian)))
    return {
      mean, standardDeviation: Math.sqrt(variance), sampleCount: windowAverages.length,
      historicalObservationCount, historicalQueryCount, windowCount: windowAverages.length,
      median: baselineMedian, medianAbsoluteDeviation,
      robustSigma: MAD_TO_SIGMA * medianAbsoluteDeviation, windowAverages,
      available: true, availabilityReason: "Historical category-window coverage requirements passed.", availabilityReasonCode: "available",
    }
  }
}

export class NoHistoricalBaselineProvider implements HistoricalBaselineProvider {
  async getBaseline(): Promise<HistoricalBaseline> {
    return unavailableBaseline("provider_disabled", "Historical baseline provider is disabled.")
  }
}
