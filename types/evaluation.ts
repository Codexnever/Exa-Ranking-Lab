import type { ExaCategory } from "@/types/type"

/** 0 = not relevant, 1 = relevant, 2 = highly relevant. */
export type RelevanceGrade = 0 | 1 | 2
export type JudgmentStatus = "pending" | "accepted" | "conflicted"
export type JudgmentSource = "direct_label" | "feedback_promotion" | "curator_adjudication"
export type EvaluationDatasetStatus = "draft" | "frozen" | "archived"

export interface EvaluationDatasetVersion {
  id: string
  familyKey: string
  name: string
  description?: string
  version: number
  status: EvaluationDatasetStatus
  parentVersionId?: string
  ownerUserId: string
  createdByUserId: string
  createdAt: Date
  updatedAt: Date
  frozenAt?: Date
  frozenByUserId?: string
  queryCount: number
  judgmentCount: number
  conflictCount: number
  canonicalizationVersion: string
}

export interface EvaluationQuery {
  id: string
  datasetVersionId: string
  sourceQueryId: string
  queryKey: string
  name: string
  queryText: string
  category: ExaCategory
  filters: {
    includeDomains?: string[]
    excludeDomains?: string[]
    startDate?: string
    endDate?: string
    numResults: number
  }
  configHash: string
  searchConfig?: Record<string, unknown>
  createdAt: Date
  createdByUserId: string
}

export interface JudgmentAssessment {
  assessorUserId: string
  proposedGrade: RelevanceGrade
  rationale?: string
  source: JudgmentSource
  sourceFeedbackId?: string
  sourceSnapshotId?: string
  observedRawUrl?: string
  observedContentHash?: string
  createdAt: Date
}

export interface RelevanceJudgment {
  id: string
  judgmentKey: string
  datasetVersionId: string
  evaluationQueryId: string
  sourceQueryId: string
  documentKey: string
  canonicalUrl: string
  domain: string
  status: JudgmentStatus
  /** Null means no authoritative grade; absence of an accepted judgment is unjudged. */
  relevanceGrade: RelevanceGrade | null
  source: JudgmentSource
  assessments: JudgmentAssessment[]
  sourceFeedbackIds: string[]
  sourceSnapshotIds: string[]
  observedRawUrls: string[]
  observedContentHashes: string[]
  rationale?: string
  intent?: string
  subtopic?: string
  createdAt: Date
  createdByUserId: string
  updatedAt: Date
  updatedByUserId: string
  acceptedAt?: Date
  acceptedByUserId?: string
}

export interface QueryFoundationReadiness {
  queryFoundationReady: boolean
  fullEvaluationFreezeReady: false
  checks: {
    hasQueries: boolean
    noConflicts: boolean
    canonicalizationVersionPresent: boolean
    queryCountConsistent: boolean
    noOrphanQueries: boolean
  }
  pendingPhases: ["judgments", "conflict_resolution", "final_freeze"]
}

export interface EvaluationDatasetDetail {
  dataset: EvaluationDatasetVersion
  queries: EvaluationQuery[]
  readiness: QueryFoundationReadiness
}
