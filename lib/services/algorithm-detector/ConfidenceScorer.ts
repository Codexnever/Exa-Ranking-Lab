import {
  CONFIDENCE_WEIGHTS,
  FULL_OBSERVATION_CONFIDENCE_COUNT,
  MAX_FALLBACK_CONFIDENCE,
  SEVERITY_BANDS,
} from "./constants"

import type {
  AlgorithmUpdateSeverity,
  ConfidenceResult,
  ConfidenceSignals,
} from "./types"

/**
 * Converts detector evidence into a bounded confidence score.
 *
 * Confidence is intentionally conservative when historical baseline evidence
 * is unavailable: missing signal weight is not redistributed, and the final
 * score is capped using MAX_FALLBACK_CONFIDENCE.
 */
export class ConfidenceScorer {
  static score(
    signals: ConfidenceSignals,
  ): ConfidenceResult {
    const normalizedSignals:
      Record<string, number> = {
      affectedQueryRate:
        ConfidenceScorer.clamp(
          signals.driftRate,
        ),

      driftMagnitude:
        ConfidenceScorer.clamp(
          signals.avgDriftScore /
            100,
        ),

      observationStrength:
        ConfidenceScorer.clamp(
          signals.observedQueryCount /
            FULL_OBSERVATION_CONFIDENCE_COUNT,
        ),

      /*
       * Temporal concentration remains diagnostic evidence only. Scheduler
       * batching can produce nearly identical timestamps without independent
       * evidence that the underlying ranking change occurred simultaneously.
       */
    }

    if (
      signals.historicalSignal !==
      null
    ) {
      normalizedSignals.historicalDeviation =
        ConfidenceScorer.clamp(
          signals.historicalSignal,
        )
    }

    const allWeights =
      Object.entries(
        CONFIDENCE_WEIGHTS,
      )

    const fullWeightTotal =
      allWeights.reduce(
        (
          sum,
          [, weight],
        ) =>
          sum + weight,
        0,
      )

    const availableWeights =
      allWeights.filter(
        ([name]) =>
          normalizedSignals[
            name
          ] !== undefined,
      )

    const weightsUsed:
      Record<string, number> = {}

    let value = 0

    /*
     * Missing evidence contributes no score and its configured weight is not
     * redistributed across unrelated signals.
     */
    for (
      const [
        name,
        weight,
      ] of availableWeights
    ) {
      const normalizedWeight =
        weight /
        fullWeightTotal

      weightsUsed[name] =
        normalizedWeight

      value +=
        normalizedSignals[name] *
        normalizedWeight
    }

    value =
      ConfidenceScorer.clamp(
        value,
      )

    const uncappedPercentage =
      Math.round(
        value * 100,
      )

    const confidenceCapped =
      signals.historicalSignal ===
        null &&
      uncappedPercentage >
        MAX_FALLBACK_CONFIDENCE

    const percentage =
      confidenceCapped
        ? MAX_FALLBACK_CONFIDENCE
        : uncappedPercentage

    value =
      percentage / 100

    return {
      value,
      percentage,
      score: percentage,

      severity:
        ConfidenceScorer.severityFromScore(
          percentage,
        ),

      signals,
      normalizedSignals,
      weightsUsed,

      confidenceCapped,

      confidenceCap:
        signals.historicalSignal ===
        null
          ? MAX_FALLBACK_CONFIDENCE
          : null,

      confidenceCapReason:
        signals.historicalSignal ===
        null
          ? "Historical baseline unavailable; fixed-threshold confidence is capped pending production calibration."
          : null,
    }
  }

  /**
   * Maps a confidence percentage to its configured detector severity band.
   */
  static severityFromScore(
    score: number,
  ): AlgorithmUpdateSeverity {
    const finiteScore =
      Number.isFinite(score)
        ? score
        : 0

    return (
      SEVERITY_BANDS.find(
        (band) =>
          finiteScore >=
          band.minConfidence,
      )?.severity ??
      "minor"
    )
  }

  /**
   * Restricts a numeric signal to the inclusive [0, 1] interval.
   */
  private static clamp(
    value: number,
  ): number {
    return Number.isFinite(value)
      ? Math.min(
          1,
          Math.max(
            0,
            value,
          ),
        )
      : 0
  }
}