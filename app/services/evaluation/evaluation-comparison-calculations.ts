import type {
  MetricValue,
  PerQueryEvaluationResult,
} from "./metrics/types"

import type {
  CutoffMetricDeltas,
  EvaluationQueryCohort,
  EvaluationRunCompatibility,
  MetricDelta,
  PerQueryMetricDelta,
} from "@/types/evaluation-comparison"

import type { EvaluationRun } from "@/types/evaluation-runs"

import { metricDelta } from "./comparison-policy"

/**
 * Checks whether two evaluation runs can be compared safely.
 *
 * Runs must use the same frozen dataset version, metric policy version,
 * and share at least one evaluation cutoff.
 */
export function compatibility(
  before: EvaluationRun,
  after: EvaluationRun,
): EvaluationRunCompatibility {
  const reasons: string[] = []

  if (
    before.datasetVersionId !==
    after.datasetVersionId
  ) {
    reasons.push(
      "Different frozen dataset versions",
    )
  }

  if (
    before.metricVersion !==
    after.metricVersion
  ) {
    reasons.push(
      "Metric policy versions differ",
    )
  }

  const sharedCutoffs = before.cutoffs
    .filter((value) =>
      after.cutoffs.includes(value),
    )
    .sort((a, b) => a - b)

  if (!sharedCutoffs.length) {
    reasons.push(
      "No shared metric cutoffs",
    )
  }

  const beforeQueryIds = new Set(
    before.perQuery.map(
      (item) => item.evaluationQueryId,
    ),
  )

  const afterQueryIds = new Set(
    after.perQuery.map(
      (item) => item.evaluationQueryId,
    ),
  )

  return {
    compatible: reasons.length === 0,
    reasons,
    sharedCutoffs,
    queryCohortExactMatch:
      beforeQueryIds.size ===
        afterQueryIds.size &&
      [...beforeQueryIds].every((id) =>
        afterQueryIds.has(id),
      ),
  }
}

/**
 * Builds the comparable query cohort shared by two evaluation runs.
 *
 * Queries are separated into common, before-only, and after-only groups so
 * downstream metric comparisons can operate on a clearly defined cohort.
 */
export function cohort(
  before: EvaluationRun,
  after: EvaluationRun,
): EvaluationQueryCohort {
  const beforeQueryIds = new Set(
    before.perQuery.map(
      (item) => item.evaluationQueryId,
    ),
  )

  const afterQueryIds = new Set(
    after.perQuery.map(
      (item) => item.evaluationQueryId,
    ),
  )

  const common = [...beforeQueryIds]
    .filter((id) =>
      afterQueryIds.has(id),
    )
    .sort()

  const onlyInBefore = [...beforeQueryIds]
    .filter((id) =>
      !afterQueryIds.has(id),
    )
    .sort()

  const onlyInAfter = [...afterQueryIds]
    .filter((id) =>
      !beforeQueryIds.has(id),
    )
    .sort()

  return {
    beforeCount: beforeQueryIds.size,
    afterCount: afterQueryIds.size,
    commonCount: common.length,
    commonQueryIds: common,
    onlyInBefore,
    onlyInAfter,
    exactMatch:
      onlyInBefore.length === 0 &&
      onlyInAfter.length === 0,
  }
}

/**
 * Returns metrics for a specific evaluation cutoff.
 */
const cutoff = (
  query: PerQueryEvaluationResult,
  k: number,
) =>
  query.metrics.find(
    (item) => item.cutoff === k,
  )

/**
 * Extracts a metric value while preserving unavailable values as null.
 */
const available = (
  value: MetricValue,
) =>
  value.value === null
    ? null
    : value.value

type MetricName =
  | "ndcg"
  | "benchmarkRecall"
  | "judgedPrecision"
  | "judgmentCoverage"

/**
 * Compares a single cutoff metric for the same query across two runs.
 *
 * A metric is only comparable when both query results are eligible and both
 * runs expose a value at the requested cutoff.
 */
function pair(
  before: PerQueryEvaluationResult,
  after: PerQueryEvaluationResult,
  k: number,
  name: MetricName,
): MetricDelta {
  if (
    !before.eligible ||
    !after.eligible
  ) {
    return metricDelta([], [])
  }

  const beforeCutoff = cutoff(
    before,
    k,
  )

  const afterCutoff = cutoff(
    after,
    k,
  )

  const beforeValue = beforeCutoff
    ? available(beforeCutoff[name])
    : null

  const afterValue = afterCutoff
    ? available(afterCutoff[name])
    : null

  return beforeValue === null ||
    afterValue === null
    ? metricDelta([], [])
    : metricDelta(
        [beforeValue],
        [afterValue],
      )
}

/**
 * Compares the hit metric for one query at a specific cutoff.
 */
function hit(
  before: PerQueryEvaluationResult,
  after: PerQueryEvaluationResult,
  k: number,
) {
  if (
    !before.eligible ||
    !after.eligible
  ) {
    return metricDelta([], [])
  }

  const beforeCutoff = cutoff(
    before,
    k,
  )

  const afterCutoff = cutoff(
    after,
    k,
  )

  return !beforeCutoff || !afterCutoff
    ? metricDelta([], [])
    : metricDelta(
        [beforeCutoff.hit],
        [afterCutoff.hit],
      )
}

/**
 * Compares all supported metrics for one evaluation query.
 *
 * NDCG@10 is preferred as the primary metric when available. Otherwise the
 * highest available NDCG cutoff is used, with reciprocal rank as the fallback.
 */
export function compareQuery(
  before: PerQueryEvaluationResult,
  after: PerQueryEvaluationResult,
  cutoffs: number[],
): PerQueryMetricDelta {
  const eligibleInBoth =
    before.eligible &&
    after.eligible

  const byCutoff = cutoffs.map(
    (k) => ({
      cutoff: k,
      ndcg: pair(
        before,
        after,
        k,
        "ndcg",
      ),
      benchmarkRecall: pair(
        before,
        after,
        k,
        "benchmarkRecall",
      ),
      judgedPrecision: pair(
        before,
        after,
        k,
        "judgedPrecision",
      ),
      judgmentCoverage: pair(
        before,
        after,
        k,
        "judgmentCoverage",
      ),
      hit: hit(
        before,
        after,
        k,
      ),
    }),
  )

  const preferred =
    byCutoff.find(
      (item) =>
        item.cutoff === 10 &&
        item.ndcg.delta !== null,
    ) ??
    [...byCutoff]
      .reverse()
      .find(
        (item) =>
          item.ndcg.delta !== null,
      )

  const reciprocalRank =
    eligibleInBoth
      ? metricDelta(
          [before.reciprocalRank],
          [after.reciprocalRank],
        )
      : metricDelta([], [])

  const primary =
    preferred?.ndcg ??
    reciprocalRank

  return {
    evaluationQueryId:
      before.evaluationQueryId,
    beforeSnapshotId:
      before.snapshotId,
    afterSnapshotId:
      after.snapshotId,
    eligibleInBoth,
    reciprocalRank,
    byCutoff,
    primaryMetric: preferred
      ? `ndcg@${preferred.cutoff}`
      : reciprocalRank.delta !== null
        ? "reciprocalRank"
        : null,
    primaryDelta: primary.delta,
  }
}

/**
 * Aggregates aligned per-query metric values into a single metric delta.
 *
 * Queries without a comparable metric value are excluded from the aggregate
 * cohort for that specific metric.
 */
const values = (
  queries: PerQueryMetricDelta[],
  selector: (
    query: PerQueryMetricDelta,
  ) => MetricDelta,
) => {
  const comparable = queries
    .map(selector)
    .filter(
      (item) => item.delta !== null,
    )

  return metricDelta(
    comparable.map(
      (item) => item.before!,
    ),
    comparable.map(
      (item) => item.after!,
    ),
  )
}

/**
 * Aggregates per-query comparisons into run-level MRR and cutoff metrics.
 */
export function aggregateComparisons(
  queries: PerQueryMetricDelta[],
  cutoffs: number[],
): {
  mrr: MetricDelta
  byCutoff: CutoffMetricDeltas[]
} {
  return {
    mrr: values(
      queries,
      (item) =>
        item.reciprocalRank,
    ),

    byCutoff: cutoffs.map(
      (k) => ({
        cutoff: k,

        ndcg: values(
          queries,
          (item) =>
            item.byCutoff.find(
              (metric) =>
                metric.cutoff === k,
            )!.ndcg,
        ),

        benchmarkRecall: values(
          queries,
          (item) =>
            item.byCutoff.find(
              (metric) =>
                metric.cutoff === k,
            )!.benchmarkRecall,
        ),

        judgedPrecision: values(
          queries,
          (item) =>
            item.byCutoff.find(
              (metric) =>
                metric.cutoff === k,
            )!.judgedPrecision,
        ),

        judgmentCoverage: values(
          queries,
          (item) =>
            item.byCutoff.find(
              (metric) =>
                metric.cutoff === k,
            )!.judgmentCoverage,
        ),

        hit: values(
          queries,
          (item) =>
            item.byCutoff.find(
              (metric) =>
                metric.cutoff === k,
            )!.hit,
        ),
      }),
    ),
  }
}

/**
 * Selects the primary run-level quality metric.
 *
 * Priority is NDCG@10, then the highest available NDCG cutoff, then MRR,
 * and finally the highest available benchmark recall cutoff.
 */
export function primaryMetric(
  aggregate: {
    mrr: MetricDelta
    byCutoff: CutoffMetricDeltas[]
  },
): {
  name: string | null
  delta: MetricDelta
  recall?: MetricDelta
} {
  const ndcgAtTen =
    aggregate.byCutoff.find(
      (item) =>
        item.cutoff === 10 &&
        item.ndcg.delta !== null,
    )

  if (ndcgAtTen) {
    return {
      name: "ndcg@10",
      delta: ndcgAtTen.ndcg,
      recall:
        ndcgAtTen.benchmarkRecall,
    }
  }

  const highestNdcg =
    [...aggregate.byCutoff]
      .reverse()
      .find(
        (item) =>
          item.ndcg.delta !== null,
      )

  if (highestNdcg) {
    return {
      name: `ndcg@${highestNdcg.cutoff}`,
      delta: highestNdcg.ndcg,
      recall:
        highestNdcg.benchmarkRecall,
    }
  }

  if (aggregate.mrr.delta !== null) {
    return {
      name: "mrr",
      delta: aggregate.mrr,
    }
  }

  const highestRecall =
    [...aggregate.byCutoff]
      .reverse()
      .find(
        (item) =>
          item.benchmarkRecall.delta !==
          null,
      )

  return highestRecall
    ? {
        name: `benchmarkRecall@${highestRecall.cutoff}`,
        delta:
          highestRecall.benchmarkRecall,
        recall:
          highestRecall.benchmarkRecall,
      }
    : {
        name: null,
        delta: metricDelta([], []),
      }
}