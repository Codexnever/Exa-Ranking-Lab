import type { RelevanceGrade } from "@/types/evaluation"

export const EVALUATION_STAGE_TRACE_VERSION =
  "1" as const

export const EVALUATION_STAGE_TYPES = [
  "candidate",
  "retrieval",
  "fusion",
  "rerank",
  "final",
  "custom",
] as const

export type EvaluationStageType =
  typeof EVALUATION_STAGE_TYPES[number]

export type StageTransitionType =
  | "retained"
  | "promoted"
  | "demoted"
  | "entered"
  | "lost"
  | "unchanged"
  | "unknown"

export type TraceCompleteness =
  | "complete"
  | "partial"
  | "final_only"
  | "invalid"

export interface EvaluationStageDocument {
  documentKey: string
  canonicalUrl: string
  rawUrl: string

  rank: number | null

  score: number | null
  scoreType: string | null

  title: string | null
  domain: string

  contentHash: string | null

  metadata:
    Record<string, unknown>

  relevanceGrade:
    RelevanceGrade | null

  relevanceMeaning:
    | "judged irrelevant"
    | "relevant"
    | "highly relevant"
    | "unjudged"
}

export interface EvaluationStageTrace {
  id: string
  type: EvaluationStageType
  name: string
  order: number

  provider: string | null
  timestamp: Date | null

  requestedResultCount:
    number | null

  documents:
    EvaluationStageDocument[]

  duplicateCanonicalResultsIgnored:
    number

  metadata:
    Record<string, unknown>

  warnings: string[]
}

export interface TraceCompletenessSummary {
  status: TraceCompleteness

  recordedStageCount: number

  firstStage: string | null

  finalStagePresent: boolean

  completeFinalAlignment:
    boolean | null
}

export interface EvaluationExecutionTrace {
  id: string

  traceVersion:
    typeof EVALUATION_STAGE_TRACE_VERSION

  sourceQueryId: string

  snapshotId: string | null
  evaluationQueryId: string | null
  datasetVersionId: string | null

  queryText: string | null

  stages:
    EvaluationStageTrace[]

  completeness:
    TraceCompletenessSummary

  createdAt: Date
  createdByUserId: string

  warnings: string[]
}

export interface StagePathEntry {
  stageId: string
  stageType: EvaluationStageType

  stageRecorded: true

  present: boolean

  rank: number | null

  score: number | null
  scoreType: string | null
}

export interface StageTransition {
  fromStageId: string
  toStageId: string

  type: StageTransitionType

  previousRank: number | null
  nextRank: number | null

  rankDelta: number | null
}

export interface DocumentStagePath {
  documentKey: string
  canonicalUrl: string
  title: string | null

  relevanceGrade:
    RelevanceGrade | null

  relevanceMeaning:
    EvaluationStageDocument["relevanceMeaning"]

  stages:
    StagePathEntry[]

  transitions:
    StageTransition[]
}

export interface EvaluationStageTraceSummary {
  id: string

  traceVersion: string

  sourceQueryId: string

  snapshotId: string | null
  evaluationQueryId: string | null
  datasetVersionId: string | null

  stageCount: number

  completeness:
    TraceCompleteness

  createdAt: Date
  createdByUserId: string
}

export interface EvaluationStageTraceList {
  traces:
    EvaluationStageTraceSummary[]

  total: number
  limit: number
  offset: number
}