import type { AggregateEvaluationResult, PerQueryEvaluationResult } from "@/app/services/evaluation/metrics/types"

export type EvaluationRunStatus = "completed"

export interface EvaluationRunSnapshotSelection {
  evaluationQueryId: string
  snapshotId: string
}

export interface EvaluationRun {
  id: string
  datasetVersionId: string
  datasetFamilyKey: string
  datasetVersion: number
  metricVersion: string
  status: EvaluationRunStatus
  cutoffs: number[]
  snapshotSelections: EvaluationRunSnapshotSelection[]
  aggregate: AggregateEvaluationResult
  perQuery: PerQueryEvaluationResult[]
  warnings: string[]
  eligibleQueryCount: number
  skippedQueryCount: number
  createdAt: Date
  createdByUserId: string
}

export interface EvaluationRunSummary {
  id: string
  datasetVersionId: string
  datasetFamilyKey: string
  datasetVersion: number
  metricVersion: string
  status: EvaluationRunStatus
  cutoffs: number[]
  selectedQueryCount: number
  eligibleQueryCount: number
  skippedQueryCount: number
  aggregate: Pick<AggregateEvaluationResult, "mrr" | "byCutoff">
  createdAt: Date
  createdByUserId: string
}

export interface EvaluationRunList {
  runs: EvaluationRunSummary[]
  total: number
  limit: number
  offset: number
}
