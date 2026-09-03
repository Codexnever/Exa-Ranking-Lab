export const HARD_NEGATIVE_POLICY_VERSION =
  "1" as const

export type HardNegativeSeverity =
  | "low"
  | "medium"
  | "high"
  | "critical"

export type HardNegativeReason =
  | "HIGH_FINAL_RANK"
  | "TOP_K_IRRELEVANT"
  | "OUTRANKS_HIGHLY_RELEVANT"
  | "SURVIVES_PIPELINE"
  | "IRRELEVANT_DOWNSTREAM_PROMOTION"
  | "REPEATED_HIGH_RANK_FALSE_POSITIVE"
  | "PERSISTENT_QUERY_FALSE_POSITIVE"

export type HardNegativeCategory =
  | "TOP_RANK_FALSE_POSITIVE"
  | "REPEATED_FALSE_POSITIVE"
  | "IRRELEVANT_ABOVE_HIGHLY_RELEVANT"
  | "IRRELEVANT_DOWNSTREAM_PROMOTION"
  | "IRRELEVANT_PIPELINE_SURVIVAL"
  | "QUERY_PERSISTENT_FALSE_POSITIVE"
  | "DOMAIN_REPEATED_FALSE_POSITIVE"

export interface HardNegativeStageObservation {
  stageId: string
  stageType: string
  stageName: string
  rank: number | null
  score: number | null
  scoreType: string | null
  provider: string | null
}

export interface HardNegativeScoreEvidence {
  stageId: string
  stageType: string
  provider: string | null
  score: number
  scoreType: string | null
}

export interface HardNegativePairwiseEvidence {
  irrelevantDocumentKey: string
  irrelevantRank: number

  relevantDocumentKey: string
  relevantCanonicalUrl: string
  relevantGrade: 1 | 2
  relevantRank: number
}

export interface HardNegativeOccurrence {
  datasetVersionId: string
  evaluationQueryId: string
  sourceQueryId: string
  snapshotId: string
  evaluationRunId: string
  stageTraceId: string | null

  documentKey: string
  canonicalUrl: string
  rawUrl: string
  title: string
  domain: string

  relevanceGrade: 0

  finalRank: number

  stagePath:
    HardNegativeStageObservation[]

  scoreEvidence:
    HardNegativeScoreEvidence[]

  firstObservedStage:
    string | null

  largestPromotion: {
    fromStageId: string
    toStageId: string
    rankDelta: number
  } | null

  outrankedGrade1Count: number
  outrankedGrade2Count: number

  pairwiseEvidence:
    HardNegativePairwiseEvidence[]

  timestamp: Date

  reasons:
    HardNegativeReason[]

  severity:
    HardNegativeSeverity

  warnings: string[]
}

export interface HardNegativeHistorySummary {
  occurrenceCount: number
  distinctRunCount: number

  top3Count: number
  top5Count: number
  top10Count: number

  firstSeen: Date
  lastSeen: Date

  bestRank: number
  worstRank: number
  meanRank: number
  medianRank: number

  pipelineSurvivalCount: number
}

export interface HardNegativeCandidate {
  documentKey: string
  canonicalUrl: string
  title: string
  domain: string

  relevanceGrade: 0

  severity:
    HardNegativeSeverity

  reasons:
    HardNegativeReason[]

  categories:
    HardNegativeCategory[]

  evaluationQueryId: string
  sourceQueryId: string

  finalRank: number

  outrankedGrade1Count: number
  outrankedGrade2Count: number

  history:
    HardNegativeHistorySummary

  occurrences:
    HardNegativeOccurrence[]

  topOccurrence:
    HardNegativeOccurrence
}

export interface HardNegativeQuerySummary {
  evaluationQueryId: string
  sourceQueryId: string

  grade0JudgedCount: number
  candidateCount: number

  top5IrrelevantCount: number
  top10IrrelevantCount: number

  outrankingGrade2Count: number
  repeatedCandidateCount: number

  criticalCount: number
  highCount: number

  topCandidate:
    HardNegativeCandidate | null

  warnings: string[]
}

export interface HardNegativeDomainSummary {
  domain: string

  candidateCount: number
  uniqueQueryCount: number
  repeatedOccurrenceCount: number
  top5Appearances: number

  severityCounts:
    Record<
      HardNegativeSeverity,
      number
    >
}

export interface HardNegativeAnalysis {
  policyVersion:
    typeof HARD_NEGATIVE_POLICY_VERSION

  datasetVersionId: string
  analyzedRunIds: string[]

  totalGrade0JudgedDocuments: number
  candidateCount: number

  severityCounts:
    Record<
      HardNegativeSeverity,
      number
    >

  repeatedCandidateCount: number

  candidates:
    HardNegativeCandidate[]

  querySummaries:
    HardNegativeQuerySummary[]

  domainSummaries:
    HardNegativeDomainSummary[]

  total: number
  limit: number
  offset: number

  warnings: string[]

  persisted: false
}