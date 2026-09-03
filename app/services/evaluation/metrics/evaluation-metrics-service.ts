import {
  databases,
  DATABASE_ID,
  COLLECTIONS,
} from "@/app/server/appwrite/appwrite-server"

import {
  createJudgmentKey,
  getDocumentIdentity,
} from "@/utils/canonicalize-document-url"

import { transformSnapshotDocument } from "@/utils/db-utils"

import type {
  EvaluationDatasetVersion,
  EvaluationQuery,
  RelevanceGrade,
  RelevanceJudgment,
} from "@/types/evaluation"

import type { RankingSnapshot } from "@/types/type"

import {
  AppwriteEvaluationRepository,
  type EvaluationRepository,
} from "../evaluation-dataset-service"

import {
  EvaluationError,
  invalid,
} from "../evaluation-errors"

import {
  aggregateEvaluation,
  evaluateAtCutoff,
  reciprocalRank,
} from "./calculations"

import {
  DEFAULT_EVALUATION_CUTOFFS,
  EVALUATION_METRIC_VERSION,
  type EvaluationMetricsResponse,
  type PerQueryEvaluationResult,
  type RankedEvaluationItem,
  type SnapshotSelection,
} from "./types"

/**
 * Reads ranking snapshots used by the evaluation-metrics workflow.
 */
export interface MetricSnapshotReader {
  getSnapshot(
    id: string,
  ): Promise<RankingSnapshot | null>
}

/**
 * Appwrite-backed snapshot reader for authoritative metric evaluation.
 */
class AppwriteMetricSnapshotReader
  implements MetricSnapshotReader
{
  async getSnapshot(
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
        (error as { code?: number })
          ?.code === 404
      ) {
        return null
      }

      throw new EvaluationError(
        "STORAGE_ERROR",
        "Failed to read metric snapshot",
        500,
      )
    }
  }
}

export interface EvaluationMetricsInput {
  cutoffs?: number[]
  snapshots: SnapshotSelection[]
}

/**
 * Validates and normalizes an authoritative evaluation-metrics request.
 */
export function parseEvaluationMetricsInput(
  value: unknown,
): {
  cutoffs: number[]
  snapshots: SnapshotSelection[]
} {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw invalid(
      "Metrics input must be an object",
    )
  }

  const raw =
    value as Record<string, unknown>

  if (
    Object.keys(raw).some(
      (key) =>
        key !== "cutoffs" &&
        key !== "snapshots",
    )
  ) {
    throw invalid(
      "Metrics input contains unsupported fields",
    )
  }

  const cutoffs =
    raw.cutoffs === undefined
      ? [
          ...DEFAULT_EVALUATION_CUTOFFS,
        ]
      : raw.cutoffs

  if (
    !Array.isArray(cutoffs) ||
    cutoffs.length === 0 ||
    cutoffs.length > 10 ||
    cutoffs.some(
      (cutoff) =>
        !Number.isInteger(
          cutoff,
        ) ||
        Number(cutoff) <= 0 ||
        Number(cutoff) > 100,
    )
  ) {
    throw invalid(
      "cutoffs must contain 1-10 positive integers no greater than 100",
    )
  }

  const normalizedCutoffs = [
    ...new Set(
      cutoffs.map(Number),
    ),
  ].sort(
    (a, b) =>
      a - b,
  )

  if (
    !Array.isArray(
      raw.snapshots,
    ) ||
    raw.snapshots.length === 0 ||
    raw.snapshots.length > 100
  ) {
    throw invalid(
      "snapshots must contain 1-100 explicit query/snapshot selections",
    )
  }

  const snapshots =
    raw.snapshots.map(
      (item, index) => {
        if (
          !item ||
          typeof item !== "object" ||
          Array.isArray(item)
        ) {
          throw invalid(
            `snapshots[${index}] must be an object`,
          )
        }

        const selection =
          item as Record<
            string,
            unknown
          >

        if (
          Object.keys(
            selection,
          ).some(
            (key) =>
              key !==
                "evaluationQueryId" &&
              key !==
                "snapshotId",
          ) ||
          typeof selection.evaluationQueryId !==
            "string" ||
          !selection.evaluationQueryId.trim() ||
          typeof selection.snapshotId !==
            "string" ||
          !selection.snapshotId.trim()
        ) {
          throw invalid(
            `snapshots[${index}] requires evaluationQueryId and snapshotId`,
          )
        }

        return {
          evaluationQueryId:
            selection.evaluationQueryId.trim(),

          snapshotId:
            selection.snapshotId.trim(),
        }
      },
    )

  if (
    new Set(
      snapshots.map(
        (item) =>
          item.evaluationQueryId,
      ),
    ).size !==
    snapshots.length
  ) {
    throw invalid(
      "Each evaluation query may be selected only once",
    )
  }

  return {
    cutoffs:
      normalizedCutoffs,
    snapshots,
  }
}

/**
 * Evaluates frozen benchmark snapshots against accepted relevance judgments.
 */
export class EvaluationMetricsService {
  constructor(
    private readonly repository: EvaluationRepository =
      new AppwriteEvaluationRepository(),
    private readonly snapshotReader: MetricSnapshotReader =
      new AppwriteMetricSnapshotReader(),
  ) {}

  /**
   * Evaluates explicitly selected snapshots for a frozen evaluation dataset.
   */
  async evaluate(
    ownerUserId: string,
    datasetId: string,
    rawInput: EvaluationMetricsInput,
  ): Promise<EvaluationMetricsResponse> {
    const input =
      parseEvaluationMetricsInput(
        rawInput,
      )

    const dataset =
      await this.repository.getDataset(
        datasetId,
      )

    if (!dataset) {
      throw new EvaluationError(
        "NOT_FOUND",
        "Evaluation dataset not found",
        404,
      )
    }

    if (
      dataset.ownerUserId !==
      ownerUserId
    ) {
      throw new EvaluationError(
        "UNAUTHORIZED",
        "Evaluation dataset access denied",
        403,
      )
    }

    if (
      dataset.status !== "frozen"
    ) {
      throw new EvaluationError(
        "DATASET_NOT_FROZEN",
        "Authoritative metrics require a frozen dataset",
        409,
      )
    }

    const queries =
      await this.repository.listQueries(
        datasetId,
      )

    const queryById =
      new Map(
        queries.map(
          (query) => [
            query.id,
            query,
          ],
        ),
      )

    const results:
      PerQueryEvaluationResult[] = []

    for (
      const selection of input.snapshots
    ) {
      const query =
        queryById.get(
          selection.evaluationQueryId,
        )

      if (!query) {
        throw new EvaluationError(
          "NOT_FOUND",
          "Evaluation query not found in dataset",
          404,
        )
      }

      const [
        snapshot,
        judgments,
      ] = await Promise.all([
        this.snapshotReader.getSnapshot(
          selection.snapshotId,
        ),

        this.repository.listJudgments(
          datasetId,
          query.id,
        ),
      ])

      if (!snapshot) {
        throw new EvaluationError(
          "NOT_FOUND",
          "Snapshot not found",
          404,
        )
      }

      results.push(
        this.evaluateQuery(
          ownerUserId,
          dataset,
          query,
          snapshot,
          judgments,
          input.cutoffs,
        ),
      )
    }

    return {
      metricVersion:
        EVALUATION_METRIC_VERSION,

      datasetVersionId:
        dataset.id,

      snapshotSelections:
        Object.fromEntries(
          input.snapshots.map(
            (item) => [
              item.evaluationQueryId,
              item.snapshotId,
            ],
          ),
        ),

      perQuery:
        results,

      aggregate:
        aggregateEvaluation(
          results,
          input.cutoffs,
        ),

      persisted: false,
    }
  }

  /**
   * Evaluates one snapshot against the authoritative accepted judgments for its
   * evaluation query.
   */
  private evaluateQuery(
    ownerUserId: string,
    dataset: EvaluationDatasetVersion,
    query: EvaluationQuery,
    snapshot: RankingSnapshot,
    judgments: RelevanceJudgment[],
    cutoffs: number[],
  ): PerQueryEvaluationResult {
    if (
      snapshot.userId !==
      ownerUserId
    ) {
      throw new EvaluationError(
        "UNAUTHORIZED",
        "Snapshot is not owned by the dataset owner",
        403,
      )
    }

    if (
      snapshot.queryId !==
      query.sourceQueryId
    ) {
      throw new EvaluationError(
        "SNAPSHOT_MISMATCH",
        "Snapshot does not belong to the benchmark source query",
        409,
      )
    }

    const warnings: string[] = []

    const snapshotConfig =
      typeof snapshot.metadata
        .configHash === "string"
        ? snapshot.metadata
            .configHash
        : undefined

    if (
      snapshotConfig &&
      snapshotConfig !==
        query.configHash
    ) {
      throw new EvaluationError(
        "CONFIG_MISMATCH",
        "Snapshot configuration does not match the frozen benchmark query",
        409,
      )
    }

    if (!snapshotConfig) {
      warnings.push(
        "Snapshot config compatibility cannot be verified.",
      )
    }

    const accepted =
      judgments.filter(
        (judgment) =>
          judgment.status ===
          "accepted",
      )

    const acceptedByDocument =
      new Map<
        string,
        RelevanceGrade
      >()

    /*
     * Validate provenance and canonical judgment identity for every stored
     * judgment, including non-accepted records.
     */
    for (
      const judgment of judgments
    ) {
      if (
        judgment.datasetVersionId !==
          dataset.id ||
        judgment.evaluationQueryId !==
          query.id ||
        judgment.sourceQueryId !==
          query.sourceQueryId
      ) {
        throw new EvaluationError(
          "INVALID_STATE",
          "Malformed or orphan judgment found",
          409,
        )
      }

      let identity

      try {
        identity =
          getDocumentIdentity(
            judgment.canonicalUrl,
          )
      } catch {
        throw new EvaluationError(
          "INVALID_STATE",
          "Judgment has an invalid canonical identity",
          409,
        )
      }

      if (
        identity.canonicalUrl !==
          judgment.canonicalUrl ||
        identity.documentKey !==
          judgment.documentKey ||
        createJudgmentKey(
          dataset.id,
          query.id,
          judgment.documentKey,
        ) !==
          judgment.judgmentKey
      ) {
        throw new EvaluationError(
          "INVALID_STATE",
          "Judgment canonical identity is inconsistent",
          409,
        )
      }
    }

    /*
     * Only accepted judgments become authoritative relevance labels.
     */
    for (
      const judgment of accepted
    ) {
      if (
        judgment.relevanceGrade ===
        null
      ) {
        throw new EvaluationError(
          "INVALID_STATE",
          "Accepted judgment is missing an authoritative grade",
          409,
        )
      }

      if (
        acceptedByDocument.has(
          judgment.documentKey,
        )
      ) {
        throw new EvaluationError(
          "INVALID_STATE",
          "Duplicate accepted document judgment found",
          409,
        )
      }

      acceptedByDocument.set(
        judgment.documentKey,
        judgment.relevanceGrade,
      )
    }

    const knownRelevant =
      new Map(
        [
          ...acceptedByDocument,
        ].filter(
          ([, grade]) =>
            grade >= 1,
        ),
      )

    if (
      accepted.length === 0
    ) {
      warnings.push(
        "No accepted judgments exist for this query.",
      )
    }

    if (
      knownRelevant.size === 0
    ) {
      warnings.push(
        "No accepted relevant documents exist for this query.",
      )
    }

    /*
     * Canonical duplicate search results are ignored after their first
     * occurrence. The retained result keeps its original snapshot rank.
     */
    const seen =
      new Set<string>()

    const duplicateRanks:
      number[] = []

    const ranked:
      RankedEvaluationItem[] = []

    snapshot.results.forEach(
      (result, index) => {
        const identity =
          getDocumentIdentity(
            result.url,
          )

        if (
          seen.has(
            identity.documentKey,
          )
        ) {
          duplicateRanks.push(
            index + 1,
          )

          return
        }

        seen.add(
          identity.documentKey,
        )

        ranked.push({
          rank:
            index + 1,

          documentKey:
            identity.documentKey,

          grade:
            acceptedByDocument.get(
              identity.documentKey,
            ) ?? null,
        })
      },
    )

    if (
      duplicateRanks.length
    ) {
      warnings.push(
        `${duplicateRanks.length} canonical duplicate result${
          duplicateRanks.length === 1
            ? " was"
            : "s were"
        } ignored.`,
      )
    }

    const metrics =
      cutoffs.map(
        (cutoff) =>
          evaluateAtCutoff(
            ranked,
            knownRelevant,
            duplicateRanks.filter(
              (rank) =>
                rank <= cutoff,
            ).length,
            cutoff,
          ),
      )

    /*
     * Low coverage does not invalidate metrics. It is surfaced as a warning
     * because judged precision can become unstable when most top-K results are
     * unjudged.
     */
    if (
      metrics.some(
        (metric) =>
          metric.judgmentCoverage
            .value !== null &&
          metric.judgmentCoverage
            .value < 0.5,
      )
    ) {
      warnings.push(
        "Judgment coverage is low; Judged Precision may be unreliable.",
      )
    }

    return {
      datasetVersionId:
        dataset.id,

      evaluationQueryId:
        query.id,

      sourceQueryId:
        query.sourceQueryId,

      snapshotId:
        snapshot.id,

      metricVersion:
        EVALUATION_METRIC_VERSION,

      eligible:
        accepted.length > 0 &&
        knownRelevant.size > 0,

      reciprocalRank:
        reciprocalRank(
          ranked,
        ),

      metrics,

      warnings,
    }
  }
}

export const evaluationMetricsService =
  new EvaluationMetricsService()