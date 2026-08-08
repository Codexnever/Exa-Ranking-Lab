import {
  CONFIDENCE_WEIGHTS,
  FULL_OBSERVATION_CONFIDENCE_COUNT,
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
      temporalConcentration: ConfidenceScorer.clamp(signals.temporalConcentration),
    }

    if (signals.historicalSignal !== null) {
      normalizedSignals.historicalDeviation = ConfidenceScorer.clamp(signals.historicalSignal)
    }

    const availableWeights = Object.entries(CONFIDENCE_WEIGHTS)
      .filter(([name]) => normalizedSignals[name] !== undefined)
    const weightTotal = availableWeights.reduce((sum, [, weight]) => sum + weight, 0)
    const weightsUsed: Record<string, number> = {}
    let value = 0

    for (const [name, weight] of availableWeights) {
      const normalizedWeight = weight / weightTotal
      weightsUsed[name] = normalizedWeight
      value += normalizedSignals[name] * normalizedWeight
    }

    value = ConfidenceScorer.clamp(value)
    const percentage = Math.round(value * 100)
    return {
      value,
      percentage,
      score: percentage,
      severity: ConfidenceScorer.severityFromScore(percentage),
      signals,
      normalizedSignals,
      weightsUsed,
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
