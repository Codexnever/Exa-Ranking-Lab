import type { RelevanceGrade } from "@/types/evaluation"
import type { AggregateEvaluationResult, AggregateMetricValue, EvaluationAtCutoff, MetricValue, PerQueryEvaluationResult, RankedEvaluationItem } from "./types"
import { EVALUATION_METRIC_VERSION } from "./types"

const unavailable = (reason: string): MetricValue => ({ value: null, eligible: false, reason })
const available = (value: number): MetricValue => ({ value, eligible: true })

export function assertCutoff(cutoff: number): void {
  if (!Number.isInteger(cutoff) || cutoff <= 0) throw new TypeError("Metric cutoffs must be positive integers")
}

export function relevanceGain(grade: RelevanceGrade): number {
  return 2 ** grade - 1
}

export function ndcgAtK(items: RankedEvaluationItem[], knownRelevantGrades: RelevanceGrade[], cutoff: number): MetricValue {
  assertCutoff(cutoff)
  if (knownRelevantGrades.length === 0) return unavailable("No accepted relevant benchmark documents exist")
  const dcg = items.filter(item => item.rank <= cutoff).reduce((sum, item) => sum + relevanceGain(item.grade ?? 0) / Math.log2(item.rank + 1), 0)
  const ideal = [...knownRelevantGrades].sort((a, b) => b - a).slice(0, cutoff)
    .reduce<number>((sum, grade, index) => sum + relevanceGain(grade) / Math.log2(index + 2), 0)
  return ideal > 0 ? available(dcg / ideal) : unavailable("No accepted relevant benchmark documents exist")
}

export function benchmarkRecallAtK(items: RankedEvaluationItem[], knownRelevantDocumentKeys: Set<string>, cutoff: number): MetricValue {
  assertCutoff(cutoff)
  if (knownRelevantDocumentKeys.size === 0) return unavailable("No accepted relevant benchmark documents exist")
  const retrieved = items.filter(item => item.rank <= cutoff && item.grade !== null && item.grade >= 1 && knownRelevantDocumentKeys.has(item.documentKey)).length
  return available(retrieved / knownRelevantDocumentKeys.size)
}

export function judgedPrecisionAtK(items: RankedEvaluationItem[], cutoff: number): MetricValue {
  assertCutoff(cutoff)
  const judged = items.filter(item => item.rank <= cutoff && item.grade !== null)
  if (judged.length === 0) return unavailable("No accepted judgments occur in the evaluated top K")
  return available(judged.filter(item => (item.grade ?? 0) >= 1).length / judged.length)
}

export function judgmentCoverageAtK(items: RankedEvaluationItem[], cutoff: number): MetricValue {
  assertCutoff(cutoff)
  const evaluated = items.filter(item => item.rank <= cutoff)
  if (evaluated.length === 0) return unavailable("The snapshot has no evaluable results in the top K")
  return available(evaluated.filter(item => item.grade !== null).length / evaluated.length)
}

export function reciprocalRank(items: RankedEvaluationItem[]): number {
  const first = items.find(item => item.grade !== null && item.grade >= 1)
  return first ? 1 / first.rank : 0
}

export function hitAtK(items: RankedEvaluationItem[], cutoff: number): number {
  assertCutoff(cutoff)
  return items.some(item => item.rank <= cutoff && item.grade !== null && item.grade >= 1) ? 1 : 0
}

export function evaluateAtCutoff(items: RankedEvaluationItem[], knownRelevant: Map<string, RelevanceGrade>, duplicateCount: number, cutoff: number): EvaluationAtCutoff {
  const top = items.filter(item => item.rank <= cutoff)
  const judged = top.filter(item => item.grade !== null)
  const judgedRelevant = judged.filter(item => (item.grade ?? 0) >= 1).length
  return {
    cutoff,
    ndcg: ndcgAtK(items, [...knownRelevant.values()], cutoff),
    benchmarkRecall: benchmarkRecallAtK(items, new Set(knownRelevant.keys()), cutoff),
    hit: hitAtK(items, cutoff),
    judgedPrecision: judgedPrecisionAtK(items, cutoff),
    judgmentCoverage: judgmentCoverageAtK(items, cutoff),
    counts: {
      evaluatedTopK: top.length,
      judged: judged.length,
      judgedRelevant,
      judgedIrrelevant: judged.length - judgedRelevant,
      unjudged: top.length - judged.length,
      knownRelevantBenchmarkDocuments: knownRelevant.size,
      duplicateCanonicalResultsIgnored: duplicateCount,
    },
  }
}

const mean = (values: number[]): AggregateMetricValue => ({
  value: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
  eligibleQueryCount: values.length,
})

export function aggregateEvaluation(results: PerQueryEvaluationResult[], cutoffs: number[]): AggregateEvaluationResult {
  const eligible = results.filter(result => result.eligible)
  const warnings = [...new Set(results.flatMap(result => result.warnings.map(warning => `${result.evaluationQueryId}: ${warning}`)))]
  return {
    metricVersion: EVALUATION_METRIC_VERSION,
    queryCount: results.length,
    eligibleQueryCount: eligible.length,
    skippedQueryCount: results.length - eligible.length,
    mrr: mean(eligible.map(result => result.reciprocalRank)),
    byCutoff: cutoffs.map(cutoff => {
      const metrics = eligible.map(result => result.metrics.find(item => item.cutoff === cutoff)).filter((item): item is EvaluationAtCutoff => Boolean(item))
      return {
        cutoff,
        meanNdcg: mean(metrics.flatMap(item => item.ndcg.value === null ? [] : [item.ndcg.value])),
        meanBenchmarkRecall: mean(metrics.flatMap(item => item.benchmarkRecall.value === null ? [] : [item.benchmarkRecall.value])),
        meanHit: mean(eligible.flatMap(result => { const item=result.metrics.find(metric=>metric.cutoff===cutoff); return item ? [item.hit] : [] })),
        meanJudgedPrecision: mean(metrics.flatMap(item => item.judgedPrecision.value === null ? [] : [item.judgedPrecision.value])),
        meanJudgmentCoverage: mean(metrics.flatMap(item => item.judgmentCoverage.value === null ? [] : [item.judgmentCoverage.value])),
      }
    }),
    warnings,
  }
}
