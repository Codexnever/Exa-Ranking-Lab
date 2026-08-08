import type { HistoricalBaseline, HistoricalBaselineProvider } from "./types"
import type { DriftAnalysisResult } from "@/types/type"

function unavailableBaseline(sampleCount = 0): HistoricalBaseline {
  return {
    mean: 0,
    standardDeviation: 0,
    sampleCount,
    available: false,
  }
}

/**
 * Calculates normal behavior from raw historical drift observations, not from
 * previously detected events. Points in the active correlation window are
 * deliberately excluded so the candidate event cannot influence its baseline.
 */
export class TimelineHistoricalBaselineProvider implements HistoricalBaselineProvider {
  async getBaseline(
    results: DriftAnalysisResult[],
    windowStartMs: number,
    windowEndMs: number,
    historicalWindowDays: number,
    minSamples: number
  ): Promise<HistoricalBaseline> {
    const historicalStartMs = windowEndMs - historicalWindowDays * 86_400_000
    const scores = results.flatMap(result =>
      result.driftTimeline
        .filter(point => {
          const timestamp = new Date(point.timestamp).getTime()
          return Number.isFinite(timestamp)
            && timestamp >= historicalStartMs
            && timestamp < windowStartMs
            && Number.isFinite(point.driftScore)
        })
        .map(point => point.driftScore)
    )

    if (scores.length === 0) return unavailableBaseline()

    const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length
    const variance = scores.reduce((sum, score) => sum + (score - mean) ** 2, 0) / scores.length
    return {
      mean,
      standardDeviation: Math.sqrt(variance),
      sampleCount: scores.length,
      available: scores.length >= Math.max(1, Math.trunc(minSamples)),
    }
  }
}

export class NoHistoricalBaselineProvider implements HistoricalBaselineProvider {
  async getBaseline(): Promise<HistoricalBaseline> {
    return unavailableBaseline()
  }
}
