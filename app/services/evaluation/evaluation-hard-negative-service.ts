import {
  databases,
  DATABASE_ID,
  COLLECTIONS,
} from "@/app/server/appwrite/appwrite-server"

import { transformSnapshotDocument } from "@/utils/db-utils"
import { getDocumentIdentity } from "@/utils/canonicalize-document-url"

import type { RankingSnapshot } from "@/types/type"
import type {
  RelevanceJudgment,
} from "@/types/evaluation"
import type {
  HardNegativeAnalysis,
  HardNegativeOccurrence,
  HardNegativeSeverity,
} from "@/types/evaluation-hard-negatives"

import { HARD_NEGATIVE_POLICY_VERSION } from "@/types/evaluation-hard-negatives"
import { HARD_NEGATIVE_POLICY as POLICY } from "./hard-negative-policy"

import {
  baseReasons,
  consolidate,
  domainSummaries,
  querySummaries,
  sortCandidates,
  stageEvidence,
} from "./evaluation-hard-negative-calculations"

import {
  evaluationDatasetService,
  type EvaluationDatasetService,
} from "./evaluation-dataset-service"

import {
  evaluationRunService,
  type EvaluationRunService,
} from "./evaluation-run-service"

import {
  relevanceJudgmentService,
  type RelevanceJudgmentService,
} from "./relevance-judgment-service"

import {
  evaluationStageTraceService,
  type EvaluationStageTraceService,
} from "./evaluation-stage-trace-service"

import {
  EvaluationError,
  invalid,
} from "./evaluation-errors"

import { canonicalSnapshot } from "./evaluation-document-movement"

/**
 * Reads ranking snapshots used by hard-negative analysis.
 */
export interface HardNegativeSnapshotReader {
  get(
    id: string,
  ): Promise<RankingSnapshot | null>
}

/**
 * Appwrite-backed snapshot reader for hard-negative analysis.
 */
class AppwriteHardNegativeSnapshotReader
  implements HardNegativeSnapshotReader
{
  async get(
    id: string,
  ): Promise<RankingSnapshot | null> {
    try {
      return transformSnapshotDocument(
        await databases.getDocument(
          DATABASE_ID,
          COLLECTIONS.SNAPSHOTS,
          id,
        ),
        false,
      )
    } catch (error) {
      if (
        (error as { code?: number })?.code ===
        404
      ) {
        return null
      }

      throw new EvaluationError(
        "STORAGE_ERROR",
        "Failed to load hard-negative snapshot",
        500,
      )
    }
  }
}

export interface HardNegativeOptions {
  evaluationQueryId?: string
  runId?: string
  severity?: HardNegativeSeverity
  limit?: number
  offset?: number
}

/**
 * Validates a numeric pagination parameter against the configured range.
 */
const page = (
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
  name: string,
) => {
  const result = value ?? fallback

  if (
    !Number.isInteger(result) ||
    result < min ||
    result > max
  ) {
    throw invalid(
      `${name} must be an integer between ${min} and ${max}`,
    )
  }

  return result
}

/**
 * Analyzes accepted grade-0 judgments to identify hard-negative documents.
 *
 * Candidates are derived from immutable evaluation runs, final ranking
 * snapshots, accepted relevance judgments, and optional stage-trace evidence.
 */
export class EvaluationHardNegativeService {
  constructor(
    private readonly datasets: EvaluationDatasetService =
      evaluationDatasetService,
    private readonly runs: EvaluationRunService =
      evaluationRunService,
    private readonly judgments: RelevanceJudgmentService =
      relevanceJudgmentService,
    private readonly traces: EvaluationStageTraceService =
      evaluationStageTraceService,
    private readonly snapshots: HardNegativeSnapshotReader =
      new AppwriteHardNegativeSnapshotReader(),
  ) {}

  /**
   * Runs hard-negative analysis for a frozen evaluation dataset.
   */
  async analyze(
    userId: string,
    datasetId: string,
    options: HardNegativeOptions = {},
  ): Promise<HardNegativeAnalysis> {
    if (
      !userId?.trim() ||
      !datasetId?.trim()
    ) {
      throw invalid(
        "Authenticated owner and dataset ID are required",
      )
    }

    if (
      options.severity &&
      !(
        [
          "low",
          "medium",
          "high",
          "critical",
        ] as const
      ).includes(options.severity)
    ) {
      throw invalid(
        "severity is invalid",
      )
    }

    const limit = page(
      options.limit,
      50,
      1,
      100,
      "limit",
    )

    const offset = page(
      options.offset,
      0,
      0,
      10_000,
      "offset",
    )

    const detail =
      await this.datasets.getDatasetDetail(
        userId,
        datasetId,
      )

    /*
     * Hard-negative analysis must operate against an immutable dataset so
     * judgments and benchmark query membership remain stable across runs.
     */
    if (
      detail.dataset.status !== "frozen"
    ) {
      throw new EvaluationError(
        "DATASET_NOT_FROZEN",
        "Hard-negative analysis requires a frozen dataset",
        409,
      )
    }

    const listed =
      await this.runs.listRuns(
        userId,
        datasetId,
        {
          limit: POLICY.maxRuns,
          offset: 0,
        },
      )

    if (!listed.runs.length) {
      return this.empty(
        datasetId,
        limit,
        offset,
        [
          "No immutable evaluation runs are available.",
        ],
      )
    }

    const allRuns =
      await Promise.all(
        listed.runs.map(
          (summary) =>
            this.runs.getRun(
              userId,
              datasetId,
              summary.id,
            ),
        ),
      )

    /*
     * A specifically requested run is included even when it falls outside the
     * bounded historical run window.
     */
    if (
      options.runId &&
      !allRuns.some(
        (run) =>
          run.id === options.runId,
      )
    ) {
      allRuns.push(
        await this.runs.getRun(
          userId,
          datasetId,
          options.runId,
        ),
      )
    }

    const queryById = new Map(
      detail.queries.map(
        (query) => [
          query.id,
          query,
        ],
      ),
    )

    const judgmentCache =
      new Map<
        string,
        RelevanceJudgment[]
      >()

    const grade0Counts =
      new Map<
        string,
        {
          sourceQueryId: string
          count: number
        }
      >()

    const occurrences:
      HardNegativeOccurrence[] = []

    const warnings: string[] = []

    const queryWarnings =
      new Map<
        string,
        string[]
      >()

    for (const run of allRuns) {
      for (const result of run.perQuery) {
        if (
          options.evaluationQueryId &&
          result.evaluationQueryId !==
            options.evaluationQueryId
        ) {
          continue
        }

        const query =
          queryById.get(
            result.evaluationQueryId,
          )

        if (
          !query ||
          query.sourceQueryId !==
            result.sourceQueryId
        ) {
          throw new EvaluationError(
            "INVALID_STATE",
            "Evaluation run query provenance is inconsistent",
            409,
          )
        }

        let accepted =
          judgmentCache.get(query.id)

        if (!accepted) {
          accepted =
            await this.judgments.getAcceptedJudgmentsForEvaluationQuery(
              userId,
              datasetId,
              query.id,
            )

          this.validateJudgments(
            accepted,
            datasetId,
            query.id,
            query.sourceQueryId,
          )

          judgmentCache.set(
            query.id,
            accepted,
          )

          grade0Counts.set(
            query.id,
            {
              sourceQueryId:
                query.sourceQueryId,
              count: accepted.filter(
                (judgment) =>
                  judgment.relevanceGrade ===
                  0,
              ).length,
            },
          )
        }

        const snapshot =
          await this.snapshots.get(
            result.snapshotId,
          )

        if (!snapshot) {
          throw new EvaluationError(
            "NOT_FOUND",
            "Evaluation run snapshot not found",
            404,
          )
        }

        if (
          snapshot.userId !== userId
        ) {
          throw new EvaluationError(
            "UNAUTHORIZED",
            "Evaluation run snapshot access denied",
            403,
          )
        }

        if (
          snapshot.queryId !==
          query.sourceQueryId
        ) {
          throw new EvaluationError(
            "SNAPSHOT_MISMATCH",
            "Evaluation run snapshot belongs to another source query",
            409,
          )
        }

        const trace =
          await this.trace(
            userId,
            datasetId,
            query.id,
            query.sourceQueryId,
            snapshot.id,
            queryWarnings,
          )

        const canonical =
          canonicalSnapshot(snapshot)

        const byKey = new Map(
          canonical.documents.map(
            (document) => [
              document.documentKey,
              document,
            ],
          ),
        )

        const truth = new Map(
          accepted.map(
            (judgment) => [
              judgment.documentKey,
              judgment.relevanceGrade!,
            ],
          ),
        )

        const relevantRanked =
          canonical.documents.flatMap(
            (document) => {
              const grade =
                truth.get(
                  document.documentKey,
                )

              return grade === 1 ||
                grade === 2
                ? [
                    {
                      ...document,
                      grade,
                    },
                  ]
                : []
            },
          )

        /*
         * Only accepted grade-0 documents that actually appear in the ranking
         * can become hard-negative occurrences.
         */
        for (
          const judgment of accepted.filter(
            (item) =>
              item.relevanceGrade === 0,
          )
        ) {
          const document =
            byKey.get(
              judgment.documentKey,
            )

          if (!document) {
            continue
          }

          const below =
            relevantRanked.filter(
              (item) =>
                item.rank >
                document.rank,
            )

          const pairwise =
            below.map((item) => ({
              irrelevantDocumentKey:
                judgment.documentKey,
              irrelevantRank:
                document.rank,
              relevantDocumentKey:
                item.documentKey,
              relevantCanonicalUrl:
                item.canonicalUrl,
              relevantGrade:
                item.grade,
              relevantRank:
                item.rank,
            }))

          const stage =
            stageEvidence(
              judgment.documentKey,
              trace?.stages ?? [],
            )

          const reasons =
            baseReasons(
              document.rank,
              pairwise.filter(
                (item) =>
                  item.relevantGrade ===
                  2,
              ).length,
              stage,
            )

          const raw =
            snapshot.results[
              document.rank - 1
            ]

          occurrences.push({
            datasetVersionId:
              datasetId,
            evaluationQueryId:
              query.id,
            sourceQueryId:
              query.sourceQueryId,
            snapshotId:
              snapshot.id,
            evaluationRunId:
              run.id,
            stageTraceId:
              trace?.id ?? null,
            documentKey:
              judgment.documentKey,
            canonicalUrl:
              judgment.canonicalUrl,
            rawUrl:
              document.rawUrl,
            title:
              document.title,
            domain:
              document.domain,
            relevanceGrade: 0,
            finalRank:
              document.rank,
            stagePath:
              stage.path,

            scoreEvidence: [
              ...(Number.isFinite(
                raw?.score,
              )
                ? [
                    {
                      stageId:
                        "final_snapshot",
                      stageType:
                        "final",
                      provider: null,
                      score:
                        raw.score,
                      scoreType:
                        "snapshot_score",
                    },
                  ]
                : []),

              ...stage.scoreEvidence,
            ],

            firstObservedStage:
              stage.firstObservedStage,

            largestPromotion:
              stage.largestPromotion,

            outrankedGrade1Count:
              pairwise.filter(
                (item) =>
                  item.relevantGrade ===
                  1,
              ).length,

            outrankedGrade2Count:
              pairwise.filter(
                (item) =>
                  item.relevantGrade ===
                  2,
              ).length,

            pairwiseEvidence:
              pairwise,

            timestamp:
              snapshot.timestamp,

            reasons,
            severity: "low",

            warnings: trace
              ? []
              : [
                  "No unique linked stage trace was available for this occurrence.",
                ],
          })
        }
      }
    }

    /*
     * Occurrences are consolidated per dataset, evaluation query, and canonical
     * document so recurrence can influence final candidate severity.
     */
    const grouped =
      new Map<
        string,
        HardNegativeOccurrence[]
      >()

    for (
      const occurrence of occurrences
    ) {
      const key =
        `${occurrence.datasetVersionId}:${occurrence.evaluationQueryId}:${occurrence.documentKey}`

      grouped.set(
        key,
        [
          ...(grouped.get(key) ??
            []),
          occurrence,
        ],
      )
    }

    let candidates =
      sortCandidates(
        [...grouped.values()].flatMap(
          (values) => {
            const candidate =
              consolidate(values)

            return candidate
              ? [candidate]
              : []
          },
        ),
      )

    /*
     * Repeated domain-level false positives are surfaced when the same domain
     * appears across multiple candidates or a candidate recurs historically.
     */
    const domainCounts =
      new Map<string, number>()

    for (
      const candidate of candidates
    ) {
      domainCounts.set(
        candidate.domain,
        (
          domainCounts.get(
            candidate.domain,
          ) ?? 0
        ) + 1,
      )
    }

    for (
      const candidate of candidates
    ) {
      if (
        (
          domainCounts.get(
            candidate.domain,
          ) ?? 0
        ) > 1 ||
        candidate.history
          .occurrenceCount > 1
      ) {
        candidate.categories = [
          ...new Set([
            ...candidate.categories,
            "DOMAIN_REPEATED_FALSE_POSITIVE" as const,
          ]),
        ]
      }
    }

    if (options.runId) {
      candidates =
        candidates.filter(
          (candidate) =>
            candidate.occurrences.some(
              (item) =>
                item.evaluationRunId ===
                options.runId,
            ),
        )
    }

    if (options.severity) {
      candidates =
        candidates.filter(
          (candidate) =>
            candidate.severity ===
            options.severity,
        )
    }

    const total =
      candidates.length

    const paged =
      candidates.slice(
        offset,
        offset + limit,
      )

    const counts = {
      low: candidates.filter(
        (candidate) =>
          candidate.severity === "low",
      ).length,

      medium: candidates.filter(
        (candidate) =>
          candidate.severity ===
          "medium",
      ).length,

      high: candidates.filter(
        (candidate) =>
          candidate.severity === "high",
      ).length,

      critical: candidates.filter(
        (candidate) =>
          candidate.severity ===
          "critical",
      ).length,
    }

    if (
      listed.total >
      POLICY.maxRuns
    ) {
      warnings.push(
        `History was bounded to the newest ${POLICY.maxRuns} runs.`,
      )
    }

    return {
      policyVersion:
        HARD_NEGATIVE_POLICY_VERSION,
      datasetVersionId:
        datasetId,
      analyzedRunIds:
        allRuns.map(
          (run) => run.id,
        ),

      totalGrade0JudgedDocuments:
        [...grade0Counts.values()]
          .reduce(
            (sum, item) =>
              sum + item.count,
            0,
          ),

      candidateCount:
        total,

      severityCounts:
        counts,

      repeatedCandidateCount:
        candidates.filter(
          (candidate) =>
            candidate.reasons.includes(
              "REPEATED_HIGH_RANK_FALSE_POSITIVE",
            ),
        ).length,

      candidates: paged,

      querySummaries:
        querySummaries(
          candidates,
          grade0Counts,
          queryWarnings,
        ),

      domainSummaries:
        domainSummaries(
          candidates,
        ),

      total,
      limit,
      offset,

      warnings: [
        ...new Set(warnings),
      ],

      persisted: false,
    }
  }

  /**
   * Verifies accepted judgment provenance and canonical identity consistency.
   */
  private validateJudgments(
    judgments: RelevanceJudgment[],
    datasetId: string,
    queryId: string,
    sourceQueryId: string,
  ) {
    const seen =
      new Set<string>()

    for (
      const judgment of judgments
    ) {
      if (
        judgment.status !==
          "accepted" ||
        judgment.relevanceGrade ===
          null ||
        judgment.datasetVersionId !==
          datasetId ||
        judgment.evaluationQueryId !==
          queryId ||
        judgment.sourceQueryId !==
          sourceQueryId
      ) {
        throw new EvaluationError(
          "INVALID_STATE",
          "Accepted judgment provenance is malformed",
          409,
        )
      }

      const identity =
        getDocumentIdentity(
          judgment.canonicalUrl,
        )

      if (
        identity.documentKey !==
          judgment.documentKey ||
        identity.canonicalUrl !==
          judgment.canonicalUrl ||
        seen.has(
          judgment.documentKey,
        )
      ) {
        throw new EvaluationError(
          "INVALID_STATE",
          "Accepted judgment canonical identity is malformed",
          409,
        )
      }

      seen.add(
        judgment.documentKey,
      )
    }
  }

  /**
   * Resolves a unique stage trace linked to the analyzed snapshot.
   *
   * Ambiguous traces are excluded rather than selecting one arbitrarily.
   */
  private async trace(
    userId: string,
    datasetId: string,
    evaluationQueryId: string,
    sourceQueryId: string,
    snapshotId: string,
    warnings: Map<
      string,
      string[]
    >,
  ) {
    const listed =
      await this.traces.list(
        userId,
        {
          snapshotId,
          limit: 3,
          offset: 0,
        },
      )

    const compatible = []

    for (
      const summary of listed.traces
    ) {
      const trace =
        await this.traces.get(
          userId,
          summary.id,
        )

      if (
        trace.datasetVersionId ===
          datasetId &&
        trace.evaluationQueryId ===
          evaluationQueryId &&
        trace.sourceQueryId ===
          sourceQueryId &&
        trace.snapshotId ===
          snapshotId
      ) {
        compatible.push(trace)
      }
    }

    if (
      compatible.length === 1
    ) {
      return compatible[0]
    }

    if (
      compatible.length > 1
    ) {
      warnings.set(
        evaluationQueryId,
        [
          ...(warnings.get(
            evaluationQueryId,
          ) ?? []),

          `Snapshot ${snapshotId} has ambiguous linked stage traces; stage evidence was omitted.`,
        ],
      )
    }

    return null
  }

  /**
   * Returns a stable empty analysis result when no evaluation runs exist.
   */
  private empty(
    datasetId: string,
    limit: number,
    offset: number,
    warnings: string[],
  ): HardNegativeAnalysis {
    return {
      policyVersion:
        HARD_NEGATIVE_POLICY_VERSION,
      datasetVersionId:
        datasetId,
      analyzedRunIds: [],
      totalGrade0JudgedDocuments: 0,
      candidateCount: 0,

      severityCounts: {
        low: 0,
        medium: 0,
        high: 0,
        critical: 0,
      },

      repeatedCandidateCount: 0,
      candidates: [],
      querySummaries: [],
      domainSummaries: [],
      total: 0,
      limit,
      offset,
      warnings,
      persisted: false,
    }
  }
}

export const evaluationHardNegativeService =
  new EvaluationHardNegativeService()