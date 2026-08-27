import type {
  EvaluationAtCutoff,
  MetricValue,
  PerQueryEvaluationResult,
} from "./metrics/types";
import type {
  CutoffMetricDeltas,
  EvaluationQueryCohort,
  EvaluationRunCompatibility,
  MetricDelta,
  PerQueryMetricDelta,
} from "@/types/evaluation-comparison";
import type { EvaluationRun } from "@/types/evaluation-runs";
import { metricDelta } from "./comparison-policy";

export function compatibility(
  before: EvaluationRun,
  after: EvaluationRun
): EvaluationRunCompatibility {
  const reasons: string[] = [];

  if (before.datasetVersionId !== after.datasetVersionId) {
    reasons.push("Different frozen dataset versions");
  }

  if (before.metricVersion !== after.metricVersion) {
    reasons.push("Metric policy versions differ");
  }

  const sharedCutoffs = before.cutoffs
    .filter((value) => after.cutoffs.includes(value))
    .sort((a, b) => a - b);

  if (!sharedCutoffs.length) {
    reasons.push("No shared metric cutoffs");
  }

  const a = new Set(before.perQuery.map((item) => item.evaluationQueryId));
  const b = new Set(after.perQuery.map((item) => item.evaluationQueryId));

  return {
    compatible: reasons.length === 0,
    reasons,
    sharedCutoffs,
    queryCohortExactMatch: a.size === b.size && [...a].every((id) => b.has(id)),
  };
}

export function cohort(before: EvaluationRun, after: EvaluationRun): EvaluationQueryCohort {
  const a = new Set(before.perQuery.map((item) => item.evaluationQueryId));
  const b = new Set(after.perQuery.map((item) => item.evaluationQueryId));

  const common = [...a].filter((id) => b.has(id)).sort();
  const onlyInBefore = [...a].filter((id) => !b.has(id)).sort();
  const onlyInAfter = [...b].filter((id) => !a.has(id)).sort();

  return {
    beforeCount: a.size,
    afterCount: b.size,
    commonCount: common.length,
    commonQueryIds: common,
    onlyInBefore,
    onlyInAfter,
    exactMatch: onlyInBefore.length === 0 && onlyInAfter.length === 0,
  };
}

const cutoff = (query: PerQueryEvaluationResult, k: number) =>
  query.metrics.find((item) => item.cutoff === k);

const available = (value: MetricValue) => (value.value === null ? null : value.value);

type MetricName = "ndcg" | "benchmarkRecall" | "judgedPrecision" | "judgmentCoverage";

function pair(
  before: PerQueryEvaluationResult,
  after: PerQueryEvaluationResult,
  k: number,
  name: MetricName
): MetricDelta {
  if (!before.eligible || !after.eligible) return metricDelta([], []);

  const a = cutoff(before, k);
  const b = cutoff(after, k);
  const av = a ? available(a[name]) : null;
  const bv = b ? available(b[name]) : null;

  return av === null || bv === null ? metricDelta([], []) : metricDelta([av], [bv]);
}

function hit(before: PerQueryEvaluationResult, after: PerQueryEvaluationResult, k: number) {
  if (!before.eligible || !after.eligible) return metricDelta([], []);

  const a = cutoff(before, k);
  const b = cutoff(after, k);

  return !a || !b ? metricDelta([], []) : metricDelta([a.hit], [b.hit]);
}

export function compareQuery(
  before: PerQueryEvaluationResult,
  after: PerQueryEvaluationResult,
  cutoffs: number[]
): PerQueryMetricDelta {
  const eligibleInBoth = before.eligible && after.eligible;

  const byCutoff = cutoffs.map((k) => ({
    cutoff: k,
    ndcg: pair(before, after, k, "ndcg"),
    benchmarkRecall: pair(before, after, k, "benchmarkRecall"),
    judgedPrecision: pair(before, after, k, "judgedPrecision"),
    judgmentCoverage: pair(before, after, k, "judgmentCoverage"),
    hit: hit(before, after, k),
  }));

  const preferred =
    byCutoff.find((item) => item.cutoff === 10 && item.ndcg.delta !== null) ??
    [...byCutoff].reverse().find((item) => item.ndcg.delta !== null);

  const rr = eligibleInBoth
    ? metricDelta([before.reciprocalRank], [after.reciprocalRank])
    : metricDelta([], []);

  const primary = preferred?.ndcg ?? rr;

  return {
    evaluationQueryId: before.evaluationQueryId,
    beforeSnapshotId: before.snapshotId,
    afterSnapshotId: after.snapshotId,
    eligibleInBoth,
    reciprocalRank: rr,
    byCutoff,
    primaryMetric: preferred
      ? `ndcg@${preferred.cutoff}`
      : rr.delta !== null
      ? "reciprocalRank"
      : null,
    primaryDelta: primary.delta,
  };
}

const values = (
  queries: PerQueryMetricDelta[],
  selector: (query: PerQueryMetricDelta) => MetricDelta
) => {
  const comparable = queries.map(selector).filter((item) => item.delta !== null);
  return metricDelta(
    comparable.map((item) => item.before!),
    comparable.map((item) => item.after!)
  );
};

export function aggregateComparisons(
  queries: PerQueryMetricDelta[],
  cutoffs: number[]
): { mrr: MetricDelta; byCutoff: CutoffMetricDeltas[] } {
  return {
    mrr: values(queries, (item) => item.reciprocalRank),
    byCutoff: cutoffs.map((k) => ({
      cutoff: k,
      ndcg: values(queries, (item) => item.byCutoff.find((metric) => metric.cutoff === k)!.ndcg),
      benchmarkRecall: values(queries, (item) =>
        item.byCutoff.find((metric) => metric.cutoff === k)!.benchmarkRecall
      ),
      judgedPrecision: values(queries, (item) =>
        item.byCutoff.find((metric) => metric.cutoff === k)!.judgedPrecision
      ),
      judgmentCoverage: values(queries, (item) =>
        item.byCutoff.find((metric) => metric.cutoff === k)!.judgmentCoverage
      ),
      hit: values(queries, (item) => item.byCutoff.find((metric) => metric.cutoff === k)!.hit),
    })),
  };
}

export function primaryMetric(aggregate: {
  mrr: MetricDelta;
  byCutoff: CutoffMetricDeltas[];
}): { name: string | null; delta: MetricDelta; recall?: MetricDelta } {
  const ten = aggregate.byCutoff.find((item) => item.cutoff === 10 && item.ndcg.delta !== null);
  if (ten) return { name: "ndcg@10", delta: ten.ndcg, recall: ten.benchmarkRecall };

  const highest = [...aggregate.byCutoff].reverse().find((item) => item.ndcg.delta !== null);
  if (highest) {
    return {
      name: `ndcg@${highest.cutoff}`,
      delta: highest.ndcg,
      recall: highest.benchmarkRecall,
    };
  }

  if (aggregate.mrr.delta !== null) return { name: "mrr", delta: aggregate.mrr };

  const recall = [...aggregate.byCutoff].reverse().find((item) => item.benchmarkRecall.delta !== null);

  return recall
    ? { name: `benchmarkRecall@${recall.cutoff}`, delta: recall.benchmarkRecall, recall: recall.benchmarkRecall }
    : { name: null, delta: metricDelta([], []) };
}