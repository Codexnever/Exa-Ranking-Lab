import type { HistoricalBaseline, HistoricalBaselineProvider } from "./types"
import type { DriftAnalysisResult } from "@/types/type"

function unavailableBaseline(historicalObservationCount = 0, historicalQueryCount = 0): HistoricalBaseline {
  return {
    mean: 0,
    standardDeviation: 0,
    sampleCount: historicalQueryCount,
    historicalObservationCount,
    historicalQueryCount,
    available: false,
  }
}

/**
 * Each query contributes one historical mean, regardless of how many timeline
 * points it owns. Category dispersion is the population standard deviation of
 * those per-query means. `sampleCount` is a compatibility alias for the number
 * of independent query histories, never the number of raw observations.
 */
export class TimelineHistoricalBaselineProvider implements HistoricalBaselineProvider {
  async getBaseline(
    results: DriftAnalysisResult[],
    windowStartMs: number,
    windowEndMs: number,
    historicalWindowDays: number,
    minSamples: number,
    minQueries: number
  ): Promise<HistoricalBaseline> {
    const historicalStartMs = windowEndMs - historicalWindowDays * 86_400_000
    const queryHistories = results.map(result => result.driftTimeline
      .filter(point => {
        const timestamp = new Date(point.timestamp).getTime()
        return Number.isFinite(timestamp)
          && timestamp >= historicalStartMs
          && timestamp < windowStartMs
          && Number.isFinite(point.driftScore)
      })
      .map(point => point.driftScore)
    ).filter(scores => scores.length > 0)

    const historicalObservationCount = queryHistories.reduce((sum, scores) => sum + scores.length, 0)
    const historicalQueryCount = queryHistories.length
    if (historicalQueryCount === 0) return unavailableBaseline()

    const perQueryMeans = queryHistories.map(scores =>
      scores.reduce((sum, score) => sum + score, 0) / scores.length
    )
    const mean = perQueryMeans.reduce((sum, score) => sum + score, 0) / perQueryMeans.length
    const variance = perQueryMeans.reduce((sum, score) => sum + (score - mean) ** 2, 0) / perQueryMeans.length
    return {
      mean,
      standardDeviation: Math.sqrt(variance),
      sampleCount: historicalQueryCount,
      historicalObservationCount,
      historicalQueryCount,
      available: historicalObservationCount >= Math.max(1, Math.trunc(minSamples))
        && historicalQueryCount >= Math.max(1, Math.trunc(minQueries)),
    }
  }
}

export class NoHistoricalBaselineProvider implements HistoricalBaselineProvider {
  async getBaseline(): Promise<HistoricalBaseline> {
    return unavailableBaseline()
  }
}
