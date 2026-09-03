import type {
  MetricDelta,
  QualityAwareInterpretation,
  QualityChangeDirection,
  QualityChangeMagnitude,
} from "@/types/evaluation-comparison"

export const QUALITY_COMPARISON_POLICY_VERSION = "1" as const

export const QUALITY_COMPARISON_POLICY = Object.freeze({
  version: QUALITY_COMPARISON_POLICY_VERSION,
  stableEpsilon: 0.01,
  smallUpperBound: 0.05,
  moderateUpperBound: 0.15,
  coverageWarningThreshold: 0.5,
  coverageMaterialChange: 0.2,
  primaryMetricPriority: [
    "ndcg@10",
    "ndcg@highest-common-cutoff",
    "mrr",
    "benchmarkRecall@highest-common-cutoff",
  ],
  cohort: "common-query-and-metric-availability-intersection",
  delta: "after-minus-before",
  sorting: "primary-metric-delta",
} as const)

const rounded = (value: number) =>
  Math.round(value * 1e12) / 1e12

/**
 * Classifies the direction of a metric change.
 *
 * Changes smaller than the configured stability threshold are treated as
 * stable. Positive deltas represent improvement and negative deltas represent
 * degradation.
 */
export function direction(
  delta: number | null,
): QualityChangeDirection {
  if (delta === null) {
    return "unavailable"
  }

  if (
    Math.abs(delta) <
    QUALITY_COMPARISON_POLICY.stableEpsilon
  ) {
    return "stable"
  }

  return delta > 0
    ? "improved"
    : "degraded"
}

/**
 * Classifies the magnitude of a metric change using the configured policy
 * thresholds.
 */
export function magnitude(
  delta: number | null,
): QualityChangeMagnitude {
  if (delta === null) {
    return "unavailable"
  }

  const value = Math.abs(delta)

  if (
    value <
    QUALITY_COMPARISON_POLICY.stableEpsilon
  ) {
    return "stable"
  }

  if (
    value <
    QUALITY_COMPARISON_POLICY.smallUpperBound
  ) {
    return "small"
  }

  if (
    value <
    QUALITY_COMPARISON_POLICY.moderateUpperBound
  ) {
    return "moderate"
  }

  return "large"
}

/**
 * Calculates the mean metric change between two aligned query cohorts.
 *
 * Both arrays must represent the same contributing queries in the same order.
 * The delta follows the configured after-minus-before convention.
 */
export function metricDelta(
  before: number[],
  after: number[],
): MetricDelta {
  if (before.length !== after.length) {
    throw new TypeError(
      "Metric cohorts must be aligned",
    )
  }

  if (!before.length) {
    return {
      before: null,
      after: null,
      delta: null,
      contributingQueryCount: 0,
      direction: "unavailable",
      magnitude: "unavailable",
    }
  }

  const mean = (values: number[]) =>
    values.reduce(
      (sum, value) => sum + value,
      0,
    ) / values.length

  const beforeMean = mean(before)
  const afterMean = mean(after)
  const delta = rounded(
    afterMean - beforeMean,
  )

  return {
    before: beforeMean,
    after: afterMean,
    delta,
    contributingQueryCount: before.length,
    direction: direction(delta),
    magnitude: magnitude(delta),
  }
}

/**
 * Produces a quality-aware explanation for a comparison result.
 *
 * The primary relevance metric determines the overall quality direction.
 * Recall is used to distinguish ordering changes from broader retrieval
 * quality changes, while optional drift context explains whether the quality
 * change occurred alongside substantial ranking movement.
 */
export function interpretation(
  primary: MetricDelta,
  primaryMetric: string | null,
  recall: MetricDelta | undefined,
  drift?: {
    mean: number
    substantial: boolean
  },
): QualityAwareInterpretation {
  if (primary.delta === null) {
    return {
      direction: "unavailable",
      magnitude: "unavailable",
      primaryMetric: null,
      reasonCode: "QUALITY_UNAVAILABLE",
      explanation: drift
        ? "Ranking change can be measured, but relevance comparison is unavailable for the common judged cohort."
        : "Relevance comparison is unavailable for the common judged cohort.",
    }
  }

  const qualityDirection = primary.direction

  const recallStable =
    recall?.direction === "stable" ||
    recall?.magnitude === "small"

  const reasonCode =
    qualityDirection === "degraded"
      ? recallStable
        ? "ORDERING_DEGRADED_RECALL_STABLE"
        : "QUALITY_AND_RECALL_DEGRADED"
      : qualityDirection === "improved"
        ? recallStable
          ? "ORDERING_IMPROVED_RECALL_STABLE"
          : "QUALITY_IMPROVED"
        : "QUALITY_STABLE"

  let explanation =
    qualityDirection === "degraded"
      ? recallStable
        ? "Ranking quality degraded while known relevant-document retrieval remained broadly stable; this pattern suggests ordering worsened."
        : "Ranking quality degraded and fewer known relevant benchmark documents appeared in the evaluated top results."
      : qualityDirection === "improved"
        ? recallStable
          ? "Ranking quality improved while known relevant-document retrieval remained broadly stable; this pattern suggests ordering improved."
          : "Measured ranking quality improved for the common judged cohort."
        : "Measured benchmark relevance remained stable."

  /*
   * Drift adds ranking-movement context without changing the underlying
   * relevance classification produced from the benchmark metrics.
   */
  if (drift) {
    explanation += drift.substantial
      ? qualityDirection === "stable"
        ? " Ranking changed substantially, but measured benchmark relevance remained stable."
        : ` Substantial ranking change coincided with ${
            qualityDirection === "improved"
              ? "improved"
              : "lower"
          } measured relevance.`
      : qualityDirection === "degraded"
        ? " Measured relevance declined despite limited overall ranking movement."
        : qualityDirection === "improved"
          ? " Measured relevance improved with limited overall ranking movement."
          : ""
  }

  return {
    direction: qualityDirection,
    magnitude: primary.magnitude,
    primaryMetric,
    reasonCode,
    explanation,
  }
}