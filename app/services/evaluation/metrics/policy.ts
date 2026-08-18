import { EVALUATION_METRIC_VERSION } from "./types"

/**
 * Evaluation Metric Policy v1:
 * - grades are 0/1/2; relevance is grade >= 1; gain is 2^grade - 1
 * - only accepted judgments are authoritative; unjudged results retain rank and have unknown relevance
 * - only the highest-ranked canonical duplicate is evaluated
 * - recall is relative to known accepted relevant benchmark documents
 * - precision is relevant / judged within K
 * - aggregate values are unweighted macro means across metric-eligible queries
 */
export const EVALUATION_METRIC_POLICY = Object.freeze({
  version: EVALUATION_METRIC_VERSION,
  relevantGradeThreshold: 1,
  gain: "2^grade-1",
  unjudgedHandling: "retain-rank-unknown",
  duplicateHandling: "highest-ranked-canonical-result-only",
  recallSemantics: "accepted-benchmark-relative",
  precisionDenominator: "accepted-judged-results-in-top-k",
  aggregation: "macro-average",
} as const)

