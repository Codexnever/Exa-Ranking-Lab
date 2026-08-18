import type { RelevanceGrade } from "@/types/evaluation"

export const EVALUATION_METRIC_VERSION = "1" as const
export const DEFAULT_EVALUATION_CUTOFFS = [5, 10] as const
export interface SnapshotSelection { evaluationQueryId: string; snapshotId: string }

export interface RankedEvaluationItem {
  rank: number
  documentKey: string
  grade: RelevanceGrade | null
}

export interface MetricValue {
  value: number | null
  eligible: boolean
  reason?: string
}

export interface EvaluationMetricCounts {
  evaluatedTopK: number
  judged: number
  judgedRelevant: number
  judgedIrrelevant: number
  unjudged: number
  knownRelevantBenchmarkDocuments: number
  duplicateCanonicalResultsIgnored: number
}

export interface EvaluationAtCutoff {
  cutoff: number
  ndcg: MetricValue
  benchmarkRecall: MetricValue
  hit: number
  judgedPrecision: MetricValue
  judgmentCoverage: MetricValue
  counts: EvaluationMetricCounts
}

export interface PerQueryEvaluationResult {
  datasetVersionId: string
  evaluationQueryId: string
  sourceQueryId: string
  snapshotId: string
  metricVersion: typeof EVALUATION_METRIC_VERSION
  eligible: boolean
  reciprocalRank: number
  metrics: EvaluationAtCutoff[]
  warnings: string[]
}

export interface AggregateMetricValue {
  value: number | null
  eligibleQueryCount: number
}

export interface AggregateEvaluationResult {
  metricVersion: typeof EVALUATION_METRIC_VERSION
  queryCount: number
  eligibleQueryCount: number
  skippedQueryCount: number
  mrr: AggregateMetricValue
  byCutoff: Array<{
    cutoff: number
    meanNdcg: AggregateMetricValue
    meanBenchmarkRecall: AggregateMetricValue
    meanHit: AggregateMetricValue
    meanJudgedPrecision: AggregateMetricValue
    meanJudgmentCoverage: AggregateMetricValue
  }>
  warnings: string[]
}

export interface EvaluationMetricsResponse {
  metricVersion: typeof EVALUATION_METRIC_VERSION
  datasetVersionId: string
  snapshotSelections: Record<string, string>
  perQuery: PerQueryEvaluationResult[]
  aggregate: AggregateEvaluationResult
  persisted: false
}
