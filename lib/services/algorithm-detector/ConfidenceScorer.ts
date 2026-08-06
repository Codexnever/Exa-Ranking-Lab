import { CONFIDENCE_WEIGHTS, SEVERITY_BANDS } from "./constants"
import type { AlgorithmUpdateSeverity, ConfidenceResult, ConfidenceSignals } from "./types"

export class ConfidenceScorer {
  static score(signals: ConfidenceSignals): ConfidenceResult {
    const driftRate = ConfidenceScorer.clamp(signals.driftRate)
    const avgDrift = ConfidenceScorer.clamp(signals.avgDriftScore / 100)
    const count = ConfidenceScorer.clamp(
      Math.log(Math.max(1, signals.affectedQueryCount)) / Math.log(30)
    )
    const historical = ConfidenceScorer.clamp(signals.historicalDeviation / 3)
    const raw =
      driftRate * CONFIDENCE_WEIGHTS.driftRate +
      avgDrift * CONFIDENCE_WEIGHTS.avgDriftScore +
      count * CONFIDENCE_WEIGHTS.queryCount +
      historical * CONFIDENCE_WEIGHTS.historicalDev
    const score = Math.round(ConfidenceScorer.clamp(raw) * 100)
    return { score, severity: ConfidenceScorer.severityFromScore(score), signals }
  }

  static severityFromScore(score: number): AlgorithmUpdateSeverity {
    const finiteScore = Number.isFinite(score) ? score : 0
    return SEVERITY_BANDS.find(band => finiteScore >= band.minConfidence)?.severity ?? "minor"
  }

  private static clamp(value: number): number {
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0
  }
}
