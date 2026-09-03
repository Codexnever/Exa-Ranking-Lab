import type { EvaluationStageTrace } from "@/types/evaluation-stage-trace"

import type {
  HardNegativeCandidate,
  HardNegativeCategory,
  HardNegativeDomainSummary,
  HardNegativeHistorySummary,
  HardNegativeOccurrence,
  HardNegativeQuerySummary,
  HardNegativeReason,
  HardNegativeSeverity,
} from "@/types/evaluation-hard-negatives"

import { HARD_NEGATIVE_POLICY as POLICY } from "./hard-negative-policy"

const severityOrder: Record<
  HardNegativeSeverity,
  number
> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
}

/**
 * Calculates the median value for a non-empty numeric collection.
 */
const median = (
  values: number[],
) => {
  const sorted = [...values].sort(
    (a, b) => a - b,
  )

  const midpoint = Math.floor(
    sorted.length / 2,
  )

  return sorted.length % 2
    ? sorted[midpoint]
    : (
        sorted[midpoint - 1] +
        sorted[midpoint]
      ) / 2
}

/**
 * Reconstructs the path of a document through recorded evaluation stages.
 *
 * The returned evidence captures where the document appeared, how its rank
 * changed between stages, whether it survived the full pipeline, and any
 * available provider score observations.
 */
export function stageEvidence(
  documentKey: string,
  stages: EvaluationStageTrace[],
) {
  const orderedStages = [
    ...stages,
  ].sort(
    (a, b) => a.order - b.order,
  )

  const path = orderedStages
    .map((stage) => {
      const document =
        stage.documents.find(
          (item) =>
            item.documentKey ===
            documentKey,
        )

      return document
        ? {
            stageId: stage.id,
            stageType: stage.type,
            stageName: stage.name,
            rank: document.rank,
            score: document.score,
            scoreType:
              document.scoreType,
            provider: stage.provider,
          }
        : null
    })
    .filter(
      (
        item,
      ): item is NonNullable<
        typeof item
      > => Boolean(item),
    )

  const promotions = path
    .slice(1)
    .flatMap(
      (next, index) => {
        const previous =
          path[index]

        return previous.rank !== null &&
          next.rank !== null &&
          previous.rank - next.rank > 0
          ? [
              {
                fromStageId:
                  previous.stageId,
                toStageId:
                  next.stageId,
                rankDelta:
                  previous.rank -
                  next.rank,
              },
            ]
          : []
      },
    )

  const largestPromotion =
    promotions.sort(
      (a, b) =>
        b.rankDelta -
        a.rankDelta,
    )[0] ?? null

  return {
    path,
    firstObservedStage:
      path[0]?.stageId ?? null,
    largestPromotion,

    /*
     * A document survives the pipeline only when it appears in every recorded
     * stage and the trace contains more than one stage.
     */
    survivesPipeline:
      orderedStages.length > 1 &&
      path.length ===
        orderedStages.length,

    scoreEvidence:
      path.flatMap((item) =>
        item.score === null
          ? []
          : [
              {
                stageId:
                  item.stageId,
                stageType:
                  item.stageType,
                provider:
                  item.provider,
                score: item.score,
                scoreType:
                  item.scoreType,
              },
            ],
      ),
  }
}

/**
 * Produces the direct reason codes for a hard-negative occurrence.
 *
 * These reasons describe observed ranking behavior before historical
 * recurrence signals are added during candidate consolidation.
 */
export function baseReasons(
  finalRank: number,
  outrankedGrade2: number,
  stage: ReturnType<
    typeof stageEvidence
  >,
): HardNegativeReason[] {
  const reasons:
    HardNegativeReason[] = []

  if (
    finalRank <= POLICY.topRank
  ) {
    reasons.push(
      "HIGH_FINAL_RANK",
    )
  }

  if (finalRank <= POLICY.topK) {
    reasons.push(
      "TOP_K_IRRELEVANT",
    )
  }

  if (outrankedGrade2 > 0) {
    reasons.push(
      "OUTRANKS_HIGHLY_RELEVANT",
    )
  }

  if (stage.survivesPipeline) {
    reasons.push(
      "SURVIVES_PIPELINE",
    )
  }

  if (
    (
      stage.largestPromotion
        ?.rankDelta ?? 0
    ) >= POLICY.materialPromotion
  ) {
    reasons.push(
      "IRRELEVANT_DOWNSTREAM_PROMOTION",
    )
  }

  return reasons
}

/**
 * Summarizes the historical behavior of one hard-negative document.
 */
export function history(
  occurrences: HardNegativeOccurrence[],
): HardNegativeHistorySummary {
  const sortedOccurrences = [
    ...occurrences,
  ].sort(
    (a, b) =>
      a.timestamp.getTime() -
      b.timestamp.getTime(),
  )

  const ranks =
    sortedOccurrences.map(
      (item) => item.finalRank,
    )

  const runs = new Set(
    sortedOccurrences.map(
      (item) =>
        item.evaluationRunId,
    ),
  )

  return {
    occurrenceCount:
      sortedOccurrences.length,
    distinctRunCount: runs.size,

    top3Count: ranks.filter(
      (rank) => rank <= 3,
    ).length,

    top5Count: ranks.filter(
      (rank) => rank <= 5,
    ).length,

    top10Count: ranks.filter(
      (rank) => rank <= 10,
    ).length,

    firstSeen:
      sortedOccurrences[0].timestamp,

    lastSeen:
      sortedOccurrences.at(-1)!
        .timestamp,

    bestRank:
      Math.min(...ranks),

    worstRank:
      Math.max(...ranks),

    meanRank:
      ranks.reduce(
        (sum, rank) =>
          sum + rank,
        0,
      ) / ranks.length,

    medianRank:
      median(ranks),

    pipelineSurvivalCount:
      sortedOccurrences.filter(
        (item) =>
          item.reasons.includes(
            "SURVIVES_PIPELINE",
          ),
      ).length,
  }
}

/**
 * Assigns hard-negative severity using rank, relevance displacement,
 * pipeline survival, and repeated historical appearances.
 */
export function severity(
  finalRank: number,
  outrankedGrade2: number,
  value: HardNegativeHistorySummary,
  reasons: HardNegativeReason[],
): HardNegativeSeverity {
  if (
    finalRank ===
      POLICY.criticalRank ||
    outrankedGrade2 >= 2 ||
    value.top3Count >=
      POLICY.repeatedTop3RunsForCritical
  ) {
    return "critical"
  }

  if (
    finalRank <= POLICY.highRank ||
    outrankedGrade2 > 0 ||
    (
      reasons.includes(
        "SURVIVES_PIPELINE",
      ) &&
      finalRank <= 5
    ) ||
    value.top5Count >=
      POLICY.repeatedTop5RunsForHigh
  ) {
    return "high"
  }

  if (
    finalRank <= POLICY.topK ||
    reasons.includes(
      "IRRELEVANT_DOWNSTREAM_PROMOTION",
    ) ||
    value.top10Count >=
      POLICY.repeatedTop10Runs
  ) {
    return "medium"
  }

  return "low"
}

/**
 * Maps hard-negative reason codes into broader diagnostic categories.
 */
const categories = (
  reasons: HardNegativeReason[],
): HardNegativeCategory[] => {
  const output:
    HardNegativeCategory[] = []

  if (
    reasons.includes(
      "HIGH_FINAL_RANK",
    ) ||
    reasons.includes(
      "TOP_K_IRRELEVANT",
    )
  ) {
    output.push(
      "TOP_RANK_FALSE_POSITIVE",
    )
  }

  if (
    reasons.includes(
      "REPEATED_HIGH_RANK_FALSE_POSITIVE",
    )
  ) {
    output.push(
      "REPEATED_FALSE_POSITIVE",
    )
  }

  if (
    reasons.includes(
      "OUTRANKS_HIGHLY_RELEVANT",
    )
  ) {
    output.push(
      "IRRELEVANT_ABOVE_HIGHLY_RELEVANT",
    )
  }

  if (
    reasons.includes(
      "IRRELEVANT_DOWNSTREAM_PROMOTION",
    )
  ) {
    output.push(
      "IRRELEVANT_DOWNSTREAM_PROMOTION",
    )
  }

  if (
    reasons.includes(
      "SURVIVES_PIPELINE",
    )
  ) {
    output.push(
      "IRRELEVANT_PIPELINE_SURVIVAL",
    )
  }

  if (
    reasons.includes(
      "PERSISTENT_QUERY_FALSE_POSITIVE",
    )
  ) {
    output.push(
      "QUERY_PERSISTENT_FALSE_POSITIVE",
    )
  }

  return output
}

/**
 * Consolidates repeated occurrences of the same judged-irrelevant document
 * into a single hard-negative candidate.
 *
 * Historical recurrence can add persistent reason codes and may increase the
 * severity of both the consolidated candidate and its individual occurrences.
 */
export function consolidate(
  occurrences: HardNegativeOccurrence[],
): HardNegativeCandidate | null {
  if (!occurrences.length) {
    return null
  }

  const historicalSummary =
    history(occurrences)

  const reasons = [
    ...new Set(
      occurrences.flatMap(
        (item) => item.reasons,
      ),
    ),
  ]

  if (
    historicalSummary.top10Count >=
      POLICY.repeatedTop10Runs &&
    historicalSummary.distinctRunCount >=
      POLICY.repeatedTop10Runs
  ) {
    reasons.push(
      "REPEATED_HIGH_RANK_FALSE_POSITIVE",
      "PERSISTENT_QUERY_FALSE_POSITIVE",
    )
  }

  /*
   * The representative occurrence is the best observed rank. When ranks are
   * equal, the most recent occurrence is preferred.
   */
  const topOccurrence = [
    ...occurrences,
  ].sort(
    (a, b) =>
      a.finalRank -
        b.finalRank ||
      b.timestamp.getTime() -
        a.timestamp.getTime(),
  )[0]

  if (!reasons.length) {
    return null
  }

  const candidateSeverity =
    severity(
      topOccurrence.finalRank,
      Math.max(
        ...occurrences.map(
          (item) =>
            item.outrankedGrade2Count,
        ),
      ),
      historicalSummary,
      reasons,
    )

  /*
   * Recurrence-derived reasons are propagated back to each occurrence so its
   * stored severity reflects the candidate's historical context.
   */
  for (
    const occurrence of occurrences
  ) {
    occurrence.reasons = [
      ...new Set([
        ...occurrence.reasons,
        ...reasons.filter(
          (reason) =>
            reason.startsWith(
              "REPEATED",
            ) ||
            reason.startsWith(
              "PERSISTENT",
            ),
        ),
      ]),
    ]

    occurrence.severity =
      severity(
        occurrence.finalRank,
        occurrence.outrankedGrade2Count,
        historicalSummary,
        occurrence.reasons,
      )
  }

  return {
    documentKey:
      topOccurrence.documentKey,
    canonicalUrl:
      topOccurrence.canonicalUrl,
    title:
      topOccurrence.title,
    domain:
      topOccurrence.domain,
    relevanceGrade: 0,
    severity:
      candidateSeverity,
    reasons: [
      ...new Set(reasons),
    ],
    categories:
      categories(reasons),
    evaluationQueryId:
      topOccurrence.evaluationQueryId,
    sourceQueryId:
      topOccurrence.sourceQueryId,
    finalRank:
      topOccurrence.finalRank,

    outrankedGrade1Count:
      Math.max(
        ...occurrences.map(
          (item) =>
            item.outrankedGrade1Count,
        ),
      ),

    outrankedGrade2Count:
      Math.max(
        ...occurrences.map(
          (item) =>
            item.outrankedGrade2Count,
        ),
      ),

    history:
      historicalSummary,

    occurrences: [
      ...occurrences,
    ].sort(
      (a, b) =>
        a.timestamp.getTime() -
        b.timestamp.getTime(),
    ),

    topOccurrence,
  }
}

/**
 * Sorts candidates by severity, strongest final rank, recurrence, and document
 * identity to provide deterministic diagnostic ordering.
 */
export function sortCandidates(
  values: HardNegativeCandidate[],
) {
  return [...values].sort(
    (a, b) =>
      severityOrder[b.severity] -
        severityOrder[a.severity] ||
      a.finalRank -
        b.finalRank ||
      b.history.occurrenceCount -
        a.history.occurrenceCount ||
      a.documentKey.localeCompare(
        b.documentKey,
      ),
  )
}

/**
 * Builds per-query hard-negative summaries from consolidated candidates.
 */
export function querySummaries(
  candidates: HardNegativeCandidate[],
  grade0Counts: Map<
    string,
    {
      sourceQueryId: string
      count: number
    }
  >,
  warnings: Map<
    string,
    string[]
  >,
): HardNegativeQuerySummary[] {
  return [...grade0Counts]
    .map(
      ([
        evaluationQueryId,
        base,
      ]) => {
        const values =
          sortCandidates(
            candidates.filter(
              (item) =>
                item.evaluationQueryId ===
                evaluationQueryId,
            ),
          )

        return {
          evaluationQueryId,
          sourceQueryId:
            base.sourceQueryId,
          grade0JudgedCount:
            base.count,
          candidateCount:
            values.length,

          top5IrrelevantCount:
            values.filter(
              (item) =>
                item.occurrences.some(
                  (occurrence) =>
                    occurrence.finalRank <=
                    5,
                ),
            ).length,

          top10IrrelevantCount:
            values.filter(
              (item) =>
                item.occurrences.some(
                  (occurrence) =>
                    occurrence.finalRank <=
                    10,
                ),
            ).length,

          outrankingGrade2Count:
            values.filter(
              (item) =>
                item.outrankedGrade2Count >
                0,
            ).length,

          repeatedCandidateCount:
            values.filter(
              (item) =>
                item.reasons.includes(
                  "REPEATED_HIGH_RANK_FALSE_POSITIVE",
                ),
            ).length,

          criticalCount:
            values.filter(
              (item) =>
                item.severity ===
                "critical",
            ).length,

          highCount:
            values.filter(
              (item) =>
                item.severity ===
                "high",
            ).length,

          topCandidate:
            values[0] ?? null,

          warnings:
            warnings.get(
              evaluationQueryId,
            ) ?? [],
        }
      },
    )
    .sort(
      (a, b) =>
        b.candidateCount -
          a.candidateCount ||
        a.evaluationQueryId.localeCompare(
          b.evaluationQueryId,
        ),
    )
}

/**
 * Aggregates hard-negative candidates by domain.
 *
 * The summary captures how broadly a domain appears across queries, how often
 * its candidates recur, and the severity distribution of those candidates.
 */
export function domainSummaries(
  candidates: HardNegativeCandidate[],
): HardNegativeDomainSummary[] {
  const groups = new Map<
    string,
    HardNegativeCandidate[]
  >()

  for (
    const candidate of candidates
  ) {
    groups.set(
      candidate.domain,
      [
        ...(groups.get(
          candidate.domain,
        ) ?? []),
        candidate,
      ],
    )
  }

  return [...groups]
    .map(
      ([domain, values]) => ({
        domain,
        candidateCount:
          values.length,

        uniqueQueryCount:
          new Set(
            values.map(
              (item) =>
                item.evaluationQueryId,
            ),
          ).size,

        repeatedOccurrenceCount:
          values.reduce(
            (sum, item) =>
              sum +
              Math.max(
                0,
                item.history
                  .occurrenceCount - 1,
              ),
            0,
          ),

        top5Appearances:
          values.reduce(
            (sum, item) =>
              sum +
              item.history.top5Count,
            0,
          ),

        severityCounts: {
          low: values.filter(
            (item) =>
              item.severity === "low",
          ).length,

          medium: values.filter(
            (item) =>
              item.severity ===
              "medium",
          ).length,

          high: values.filter(
            (item) =>
              item.severity === "high",
          ).length,

          critical: values.filter(
            (item) =>
              item.severity ===
              "critical",
          ).length,
        },
      }),
    )
    .sort(
      (a, b) =>
        b.candidateCount -
          a.candidateCount ||
        a.domain.localeCompare(
          b.domain,
        ),
    )
}