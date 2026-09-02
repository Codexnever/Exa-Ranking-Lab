import {
  CONFIDENCE_WEIGHTS,
  FULL_OBSERVATION_CONFIDENCE_COUNT,
  MAX_FALLBACK_CONFIDENCE,
  SEVERITY_BANDS,
} from "./constants"
import type { AlgorithmUpdateSeverity, ConfidenceResult, ConfidenceSignals } from "./types"

export class ConfidenceScorer {
  static score(signals: ConfidenceSignals): ConfidenceResult {
    const normalizedSignals: Record<string, number> = {
      affectedQueryRate: ConfidenceScorer.clamp(signals.driftRate),
      driftMagnitude: ConfidenceScorer.clamp(signals.avgDriftScore / 100),
      observationStrength: ConfidenceScorer.clamp(
        signals.observedQueryCount / FULL_OBSERVATION_CONFIDENCE_COUNT
      ),
      // Temporal concentration is diagnostic only: scheduler batching can
      // make timestamps nearly identical without independent causal evidence.
    }

    if (signals.historicalSignal !== null) {
      normalizedSignals.historicalDeviation = ConfidenceScorer.clamp(signals.historicalSignal)
    }

    const allWeights = Object.entries(CONFIDENCE_WEIGHTS)
    const fullWeightTotal = allWeights.reduce((sum, [, weight]) => sum + weight, 0)
    const availableWeights = allWeights
      .filter(([name]) => normalizedSignals[name] !== undefined)
    const weightsUsed: Record<string, number> = {}
    let value = 0

    for (const [name, weight] of availableWeights) {
      // Missing evidence contributes no score and its weight is not
      // redistributed to unrelated signals.
      const normalizedWeight = weight / fullWeightTotal
      weightsUsed[name] = normalizedWeight
      value += normalizedSignals[name] * normalizedWeight
    }

    value = ConfidenceScorer.clamp(value)
    const uncappedPercentage = Math.round(value * 100)
    const confidenceCapped = signals.historicalSignal === null && uncappedPercentage > MAX_FALLBACK_CONFIDENCE
    const percentage = confidenceCapped ? MAX_FALLBACK_CONFIDENCE : uncappedPercentage
    value = percentage / 100
    return {
      value,
      percentage,
      score: percentage,
      severity: ConfidenceScorer.severityFromScore(percentage),
      signals,
      normalizedSignals,
      weightsUsed,
      confidenceCapped,
      confidenceCap: signals.historicalSignal === null ? MAX_FALLBACK_CONFIDENCE : null,
      confidenceCapReason: signals.historicalSignal === null
        ? "Historical baseline unavailable; fixed-threshold confidence is capped pending production calibration."
        : null,
    }
  }

  static severityFromScore(score: number): AlgorithmUpdateSeverity {
    const finiteScore = Number.isFinite(score) ? score : 0
    return SEVERITY_BANDS.find(band => finiteScore >= band.minConfidence)?.severity ?? "minor"
  }

  private static clamp(value: number): number {
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0
  }
}
