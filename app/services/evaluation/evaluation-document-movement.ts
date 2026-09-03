import { getDocumentIdentity } from "@/utils/canonicalize-document-url"

import type { RankingSnapshot } from "@/types/type"
import type {
  RelevanceGrade,
  RelevanceJudgment,
} from "@/types/evaluation"
import type {
  AggregateDocumentEvidence,
  CanonicalSnapshotRepresentation,
  DiagnosticPattern,
  DocumentEvidenceReason,
  DocumentMovementSummary,
  JudgedDocumentMovement,
  QueryDocumentMovementEvidence,
  RelevanceMovementCategory,
  TopKTransition,
} from "@/types/evaluation-document-movement"
import { DOCUMENT_MOVEMENT_POLICY_VERSION } from "@/types/evaluation-document-movement"
import type { PerQueryMetricDelta } from "@/types/evaluation-comparison"

import { DOCUMENT_MOVEMENT_POLICY } from "./document-movement-policy"

/**
 * Converts a ranking snapshot into its canonical document representation.
 *
 * Multiple raw URLs that resolve to the same canonical document are collapsed
 * to the first occurrence so document movement is measured once per identity.
 */
export function canonicalSnapshot(
  snapshot: RankingSnapshot,
): CanonicalSnapshotRepresentation {
  const seen = new Set<string>()
  const documents =
    [] as CanonicalSnapshotRepresentation["documents"]

  let duplicates = 0

  snapshot.results.forEach((result, index) => {
    const identity = getDocumentIdentity(
      result.url,
    )

    if (seen.has(identity.documentKey)) {
      duplicates++
      return
    }

    seen.add(identity.documentKey)

    documents.push({
      documentKey: identity.documentKey,
      canonicalUrl: identity.canonicalUrl,
      rawUrl: result.url,
      rank: index + 1,
      title: result.title,
      domain:
        result.domain ||
        new URL(
          identity.canonicalUrl,
        ).hostname,
      contentHash:
        result.contentHash ?? "",
    })
  })

  return {
    snapshotId: snapshot.id,
    documents,
    duplicateCanonicalResultsIgnored:
      duplicates,
    warnings: duplicates
      ? [
          `${duplicates} canonical duplicate result${
            duplicates === 1
              ? " was"
              : "s were"
          } ignored.`,
        ]
      : [],
  }
}

/**
 * Classifies how a document moved relative to a specific top-k boundary.
 */
export function topKTransition(
  beforeRank: number | null,
  afterRank: number | null,
  cutoff: number,
): TopKTransition {
  const before =
    beforeRank !== null &&
    beforeRank <= cutoff

  const after =
    afterRank !== null &&
    afterRank <= cutoff

  if (!before && after) {
    return "entered"
  }

  if (before && !after) {
    return "left"
  }

  return before && after
    ? "remained_inside"
    : "remained_outside"
}

/**
 * Converts a relevance grade into its human-readable interpretation.
 */
const meaning = (
  grade: RelevanceGrade,
) =>
  grade === 2
    ? ("highly relevant" as const)
    : grade === 1
      ? ("relevant" as const)
      : ("judged irrelevant" as const)

/**
 * Classifies document movement from its before and after ranking positions.
 */
const movement = (
  before: number | null,
  after: number | null,
) =>
  before === null && after === null
    ? ("unknown" as const)
    : before === null
      ? ("entered_ranking" as const)
      : after === null
        ? ("left_ranking" as const)
        : before === after
          ? ("unchanged" as const)
          : before > after
            ? ("moved_up" as const)
            : ("moved_down" as const)

/**
 * Returns whether a document crossed any evaluated top-k boundary.
 */
const hasBoundary = (
  transitions: Array<{
    cutoff: number
    transition: TopKTransition
  }>,
) =>
  transitions.some(
    (item) =>
      item.transition === "entered" ||
      item.transition === "left",
  )

/**
 * Maps a judged document movement into a relevance-aware movement category.
 */
function category(
  grade: RelevanceGrade,
  type: ReturnType<typeof movement>,
  material: boolean,
): RelevanceMovementCategory {
  if (type === "unknown") {
    return "absent_both"
  }

  if (!material) {
    return "neutral"
  }

  const winner =
    type === "moved_up" ||
    type === "entered_ranking"

  if (grade === 2) {
    return winner
      ? "highly_relevant_winner"
      : "highly_relevant_loser"
  }

  if (grade === 1) {
    return winner
      ? "relevant_winner"
      : "relevant_loser"
  }

  return winner
    ? "judged_irrelevant_winner"
    : "judged_irrelevant_loser"
}

/**
 * Produces evidence reason codes for a judged document movement.
 *
 * Top-k boundary changes take precedence over ordinary rank movement so
 * explanations reflect the most consequential observed change.
 */
function reasons(
  grade: RelevanceGrade,
  type: ReturnType<typeof movement>,
  transitions: Array<{
    cutoff: number
    transition: TopKTransition
  }>,
  material: boolean,
): DocumentEvidenceReason[] {
  if (!material) {
    return [
      "NO_JUDGED_DOCUMENT_MOVEMENT",
    ]
  }

  const left = transitions.some(
    (item) =>
      item.transition === "left",
  )

  const entered = transitions.some(
    (item) =>
      item.transition === "entered",
  )

  if (grade === 2 && left) {
    return [
      "HIGHLY_RELEVANT_LEFT_TOP_K",
      ...(type === "left_ranking"
        ? [
            "RELEVANT_DISAPPEARED" as const,
          ]
        : []),
    ]
  }

  if (grade >= 1 && left) {
    return [
      "RELEVANT_LEFT_TOP_K",
      ...(type === "left_ranking"
        ? [
            "RELEVANT_DISAPPEARED" as const,
          ]
        : []),
    ]
  }

  if (
    grade === 2 &&
    (
      type === "moved_down" ||
      type === "left_ranking"
    )
  ) {
    return [
      "HIGHLY_RELEVANT_MOVED_DOWN",
    ]
  }

  if (
    grade === 1 &&
    (
      type === "moved_down" ||
      type === "left_ranking"
    )
  ) {
    return [
      "RELEVANT_MOVED_DOWN",
    ]
  }

  if (
    grade === 2 &&
    (
      type === "moved_up" ||
      type === "entered_ranking"
    )
  ) {
    return [
      "HIGHLY_RELEVANT_MOVED_UP",
      ...(type === "entered_ranking"
        ? [
            "RELEVANT_APPEARED" as const,
          ]
        : []),
    ]
  }

  if (
    grade === 1 &&
    (
      entered ||
      type === "moved_up" ||
      type === "entered_ranking"
    )
  ) {
    return [
      "RELEVANT_ENTERED_TOP_K",
      ...(type === "entered_ranking"
        ? [
            "RELEVANT_APPEARED" as const,
          ]
        : []),
    ]
  }

  if (
    grade === 0 &&
    (
      entered ||
      type === "moved_up" ||
      type === "entered_ranking"
    )
  ) {
    return [
      entered
        ? "IRRELEVANT_ENTERED_TOP_K"
        : "IRRELEVANT_MOVED_UP",
    ]
  }

  return [
    "NO_JUDGED_DOCUMENT_MOVEMENT",
  ]
}

/**
 * Creates an empty movement summary with stable defaults.
 */
const emptySummary =
  (): DocumentMovementSummary => ({
    judgedDocumentsConsidered: 0,
    presentBefore: 0,
    presentAfter: 0,
    highlyRelevantMovedUp: 0,
    highlyRelevantMovedDown: 0,
    relevantMovedUp: 0,
    relevantMovedDown: 0,
    irrelevantMovedUp: 0,
    irrelevantMovedDown: 0,
    relevantEnteredTop5: 0,
    relevantLeftTop5: 0,
    relevantEnteredTop10: 0,
    relevantLeftTop10: 0,
    irrelevantEnteredTop5: 0,
    irrelevantEnteredTop10: 0,
    canonicalDuplicatesIgnored: 0,
    beforeCoverageAt10: null,
    afterCoverageAt10: null,
  })

/**
 * Checks whether a movement contains a specific top-k transition.
 */
const transition = (
  item: JudgedDocumentMovement,
  k: number,
  value: TopKTransition,
) =>
  item.topKTransitions.some(
    (entry) =>
      entry.cutoff === k &&
      entry.transition === value,
  )

/**
 * Aggregates document-level movement evidence into summary counters.
 */
function summarize(
  items: JudgedDocumentMovement[],
  duplicates = 0,
  beforeCoverage: number | null = null,
  afterCoverage: number | null = null,
) {
  const summary = emptySummary()

  summary.judgedDocumentsConsidered =
    items.length

  summary.presentBefore =
    items.filter(
      (item) => item.beforePresent,
    ).length

  summary.presentAfter =
    items.filter(
      (item) => item.afterPresent,
    ).length

  summary.highlyRelevantMovedUp =
    items.filter(
      (item) =>
        item.relevanceGrade === 2 &&
        item.category ===
          "highly_relevant_winner",
    ).length

  summary.highlyRelevantMovedDown =
    items.filter(
      (item) =>
        item.relevanceGrade === 2 &&
        item.category ===
          "highly_relevant_loser",
    ).length

  summary.relevantMovedUp =
    items.filter(
      (item) =>
        item.relevanceGrade === 1 &&
        item.category ===
          "relevant_winner",
    ).length

  summary.relevantMovedDown =
    items.filter(
      (item) =>
        item.relevanceGrade === 1 &&
        item.category ===
          "relevant_loser",
    ).length

  summary.irrelevantMovedUp =
    items.filter(
      (item) =>
        item.relevanceGrade === 0 &&
        item.category ===
          "judged_irrelevant_winner",
    ).length

  summary.irrelevantMovedDown =
    items.filter(
      (item) =>
        item.relevanceGrade === 0 &&
        item.category ===
          "judged_irrelevant_loser",
    ).length

  for (const k of [5, 10]) {
    const relevantEntered =
      items.filter(
        (item) =>
          item.relevanceGrade >= 1 &&
          transition(
            item,
            k,
            "entered",
          ),
      ).length

    const relevantLeft =
      items.filter(
        (item) =>
          item.relevanceGrade >= 1 &&
          transition(
            item,
            k,
            "left",
          ),
      ).length

    const irrelevantEntered =
      items.filter(
        (item) =>
          item.relevanceGrade === 0 &&
          transition(
            item,
            k,
            "entered",
          ),
      ).length

    if (k === 5) {
      summary.relevantEnteredTop5 =
        relevantEntered
      summary.relevantLeftTop5 =
        relevantLeft
      summary.irrelevantEnteredTop5 =
        irrelevantEntered
    } else {
      summary.relevantEnteredTop10 =
        relevantEntered
      summary.relevantLeftTop10 =
        relevantLeft
      summary.irrelevantEnteredTop10 =
        irrelevantEntered
    }
  }

  summary.canonicalDuplicatesIgnored =
    duplicates

  summary.beforeCoverageAt10 =
    beforeCoverage

  summary.afterCoverageAt10 =
    afterCoverage

  return summary
}

/**
 * Sorts the strongest relevance losses first.
 *
 * Boundary exits are prioritized, followed by relevance grade, rank movement,
 * and document identity for deterministic ordering.
 */
const lossSort = (
  a: JudgedDocumentMovement,
  b: JudgedDocumentMovement,
) =>
  Number(
    b.topKTransitions.some(
      (transition) =>
        transition.transition === "left",
    ),
  ) -
    Number(
      a.topKTransitions.some(
        (transition) =>
          transition.transition === "left",
      ),
    ) ||
  b.relevanceGrade -
    a.relevanceGrade ||
  (a.rankDelta ?? -1) -
    (b.rankDelta ?? -1) ||
  a.documentKey.localeCompare(
    b.documentKey,
  )

/**
 * Sorts the strongest relevance gains first.
 */
const gainSort = (
  a: JudgedDocumentMovement,
  b: JudgedDocumentMovement,
) =>
  Number(
    b.topKTransitions.some(
      (transition) =>
        transition.transition ===
        "entered",
    ),
  ) -
    Number(
      a.topKTransitions.some(
        (transition) =>
          transition.transition ===
          "entered",
      ),
    ) ||
  b.relevanceGrade -
    a.relevanceGrade ||
  (b.rankDelta ?? 0) -
    (a.rankDelta ?? 0) ||
  a.documentKey.localeCompare(
    b.documentKey,
  )

/**
 * Compares judged documents across two aligned ranking snapshots.
 *
 * Accepted judgments are matched by canonical document identity. Each document
 * is classified by rank movement, top-k boundary transitions, relevance grade,
 * and materiality according to the document movement policy.
 */
export function analyzeJudgedDocumentMovement(
  evaluationQueryId: string,
  beforeSnapshot: RankingSnapshot,
  afterSnapshot: RankingSnapshot,
  judgments: RelevanceJudgment[],
  cutoffs: number[] =
    DOCUMENT_MOVEMENT_POLICY.cutoffs as unknown as number[],
  coverage?: {
    before: number | null
    after: number | null
  },
): QueryDocumentMovementEvidence {
  const before =
    canonicalSnapshot(beforeSnapshot)

  const after =
    canonicalSnapshot(afterSnapshot)

  const beforeMap = new Map(
    before.documents.map((item) => [
      item.documentKey,
      item,
    ]),
  )

  const afterMap = new Map(
    after.documents.map((item) => [
      item.documentKey,
      item,
    ]),
  )

  const accepted = judgments.filter(
    (item) =>
      item.status === "accepted" &&
      item.relevanceGrade !== null,
  )

  const seen = new Set<string>()

  const movements = accepted
    .map((judgment) => {
      /*
       * Accepted judgments must belong to the same evaluation query and use
       * the canonical identity policy expected by this movement analysis.
       */
      if (
        judgment.evaluationQueryId !==
        evaluationQueryId
      ) {
        throw new TypeError(
          "Accepted judgment belongs to a different evaluation query",
        )
      }

      if (
        judgment.relevanceGrade !== 0 &&
        judgment.relevanceGrade !== 1 &&
        judgment.relevanceGrade !== 2
      ) {
        throw new TypeError(
          "Accepted judgment grade is malformed",
        )
      }

      const judgmentIdentity =
        getDocumentIdentity(
          judgment.canonicalUrl,
        )

      if (
        judgmentIdentity.canonicalUrl !==
          judgment.canonicalUrl ||
        judgmentIdentity.documentKey !==
          judgment.documentKey
      ) {
        throw new TypeError(
          "Judgment canonical identity is malformed",
        )
      }

      if (
        seen.has(
          judgment.documentKey,
        )
      ) {
        throw new TypeError(
          "Duplicate accepted canonical judgment",
        )
      }

      seen.add(judgment.documentKey)

      const beforeDocument =
        beforeMap.get(
          judgment.documentKey,
        )

      const afterDocument =
        afterMap.get(
          judgment.documentKey,
        )

      const beforeRank =
        beforeDocument?.rank ?? null

      const afterRank =
        afterDocument?.rank ?? null

      const movementType = movement(
        beforeRank,
        afterRank,
      )

      const rankDelta =
        beforeRank !== null &&
        afterRank !== null
          ? beforeRank - afterRank
          : null

      const topKTransitions =
        cutoffs.map((cutoff) => ({
          cutoff,
          transition: topKTransition(
            beforeRank,
            afterRank,
            cutoff,
          ),
        }))

      /*
       * A movement is material when it crosses a top-k boundary, enters or
       * leaves the ranking, or exceeds the configured rank-change threshold.
       */
      const material =
        (
          rankDelta !== null &&
          Math.abs(rankDelta) >=
            DOCUMENT_MOVEMENT_POLICY.materialRankChange
        ) ||
        hasBoundary(
          topKTransitions,
        ) ||
        movementType ===
          "entered_ranking" ||
        movementType ===
          "left_ranking"

      return {
        evaluationQueryId,
        documentKey:
          judgment.documentKey,
        canonicalUrl:
          judgment.canonicalUrl,
        relevanceGrade:
          judgment.relevanceGrade!,
        relevanceMeaning:
          meaning(
            judgment.relevanceGrade!,
          ),
        beforeRank,
        afterRank,
        rankDelta,
        beforePresent:
          Boolean(beforeDocument),
        afterPresent:
          Boolean(afterDocument),
        beforeRawUrl:
          beforeDocument?.rawUrl ??
          null,
        afterRawUrl:
          afterDocument?.rawUrl ??
          null,
        beforeSnapshotId:
          beforeSnapshot.id,
        afterSnapshotId:
          afterSnapshot.id,
        movementType,
        category: category(
          judgment.relevanceGrade!,
          movementType,
          material,
        ),
        material,
        topKTransitions,
        title:
          afterDocument?.title ??
          beforeDocument?.title ??
          judgment.canonicalUrl,
        domain:
          afterDocument?.domain ??
          beforeDocument?.domain ??
          judgment.domain,
        contentChanged:
          beforeDocument &&
          afterDocument &&
          beforeDocument.contentHash &&
          afterDocument.contentHash
            ? beforeDocument.contentHash !==
              afterDocument.contentHash
            : null,
        reasons: reasons(
          judgment.relevanceGrade!,
          movementType,
          topKTransitions,
          material,
        ),
        warnings: [],
      } satisfies JudgedDocumentMovement
    })
    .sort((a, b) =>
      a.documentKey.localeCompare(
        b.documentKey,
      ),
    )

  const losses = movements
    .filter(
      (item) =>
        item.relevanceGrade >= 1 &&
        (
          item.category.endsWith(
            "loser",
          ) ||
          item.movementType ===
            "left_ranking"
        ),
    )
    .sort(lossSort)

  const gains = movements
    .filter(
      (item) =>
        item.relevanceGrade >= 1 &&
        item.category.endsWith(
          "winner",
        ),
    )
    .sort(gainSort)

  const promotions = movements
    .filter(
      (item) =>
        item.relevanceGrade === 0 &&
        item.category ===
          "judged_irrelevant_winner",
    )
    .sort(gainSort)

  const reasonSet = [
    ...new Set(
      movements.flatMap(
        (item) => item.reasons,
      ),
    ),
  ]

  return {
    policyVersion:
      DOCUMENT_MOVEMENT_POLICY_VERSION,
    evaluationQueryId,
    beforeSnapshotId:
      beforeSnapshot.id,
    afterSnapshotId:
      afterSnapshot.id,
    movements,
    summary: summarize(
      movements,
      before.duplicateCanonicalResultsIgnored +
        after.duplicateCanonicalResultsIgnored,
      coverage?.before ?? null,
      coverage?.after ?? null,
    ),
    largestLosses: losses.slice(
      0,
      DOCUMENT_MOVEMENT_POLICY.evidenceLimit,
    ),
    largestGains: gains.slice(
      0,
      DOCUMENT_MOVEMENT_POLICY.evidenceLimit,
    ),
    judgedIrrelevantPromotions:
      promotions.slice(
        0,
        DOCUMENT_MOVEMENT_POLICY.evidenceLimit,
      ),
    relevantDrops: losses.slice(
      0,
      DOCUMENT_MOVEMENT_POLICY.evidenceLimit,
    ),
    reasons: reasonSet,
    warnings: [
      ...before.warnings,
      ...after.warnings,
    ],
  }
}

/**
 * Aggregates per-query document movement evidence into a comparison-level
 * diagnostic summary.
 *
 * Diagnostic patterns are associations between observed movement and metric
 * deltas. They do not identify a causal retrieval or reranking mechanism.
 */
export function aggregateDocumentEvidence(
  queries: QueryDocumentMovementEvidence[],
  perQuery: PerQueryMetricDelta[],
): AggregateDocumentEvidence {
  const movements = queries.flatMap(
    (item) => item.movements,
  )

  const losses = queries
    .flatMap(
      (item) => item.largestLosses,
    )
    .sort(lossSort)
    .slice(
      0,
      DOCUMENT_MOVEMENT_POLICY.evidenceLimit,
    )

  const gains = queries
    .flatMap(
      (item) => item.largestGains,
    )
    .sort(gainSort)
    .slice(
      0,
      DOCUMENT_MOVEMENT_POLICY.evidenceLimit,
    )

  const promotions = queries
    .flatMap(
      (item) =>
        item.judgedIrrelevantPromotions,
    )
    .sort(gainSort)
    .slice(
      0,
      DOCUMENT_MOVEMENT_POLICY.evidenceLimit,
    )

  const drops = queries
    .flatMap(
      (item) => item.relevantDrops,
    )
    .sort(lossSort)
    .slice(
      0,
      DOCUMENT_MOVEMENT_POLICY.evidenceLimit,
    )

  const reasons = [
    ...new Set(
      queries.flatMap(
        (item) => item.reasons,
      ),
    ),
  ]

  const patterns: DiagnosticPattern[] =
    []

  const ndcg = perQuery.flatMap(
    (item) =>
      item.byCutoff
        .filter(
          (cutoff) =>
            cutoff.cutoff === 10 &&
            cutoff.ndcg.delta !== null,
        )
        .map(
          (cutoff) =>
            cutoff.ndcg.delta!,
        ),
  )

  const recall = perQuery.flatMap(
    (item) =>
      item.byCutoff
        .filter(
          (cutoff) =>
            cutoff.cutoff === 10 &&
            cutoff.benchmarkRecall
              .delta !== null,
        )
        .map(
          (cutoff) =>
            cutoff.benchmarkRecall
              .delta!,
        ),
  )

  const mean = (
    values: number[],
  ) =>
    values.length
      ? values.reduce(
          (sum, value) =>
            sum + value,
          0,
        ) / values.length
      : 0

  if (
    mean(ndcg) <= -0.01 &&
    Math.abs(mean(recall)) < 0.05 &&
    drops.length &&
    promotions.length
  ) {
    patterns.push(
      "ORDERING_LOSS_PATTERN",
    )
  }

  if (
    mean(recall) <= -0.01 &&
    drops.some(
      (item) =>
        item.movementType ===
          "left_ranking" ||
        item.topKTransitions.some(
          (transition) =>
            transition.transition ===
            "left",
        ),
    )
  ) {
    patterns.push(
      "RELEVANT_DISAPPEARANCE_PATTERN",
    )
  }

  if (
    mean(ndcg) >= 0.01 &&
    gains.length
  ) {
    patterns.push(
      "RELEVANCE_ORDERING_IMPROVEMENT_PATTERN",
    )
  }

  const highlyRelevantLosses =
    losses.filter(
      (item) =>
        item.relevanceGrade === 2,
    ).length

  const relevantLosses =
    losses.length -
    highlyRelevantLosses

  const explanation =
    !movements.length
      ? "No accepted judged document movement was available."
      : `${highlyRelevantLosses} highly relevant and ${relevantLosses} relevant document${
          relevantLosses === 1
            ? ""
            : "s"
        } lost ranking prominence, ${gains.length} relevant document${
          gains.length === 1
            ? ""
            : "s"
        } gained prominence, and ${promotions.length} judged-irrelevant document${
          promotions.length === 1
            ? ""
            : "s"
        } moved upward. This movement evidence is associated with the metric change and does not identify a retrieval or reranking cause.`

  return {
    policyVersion:
      DOCUMENT_MOVEMENT_POLICY_VERSION,
    summary: summarize(
      movements,
      queries.reduce(
        (sum, query) =>
          sum +
          query.summary
            .canonicalDuplicatesIgnored,
        0,
      ),
    ),
    largestDocumentLosses: losses,
    largestDocumentGains: gains,
    judgedIrrelevantPromotions:
      promotions,
    relevantDrops: drops,
    diagnosticPatterns: patterns,
    explanation,
    reasons,
  }
}