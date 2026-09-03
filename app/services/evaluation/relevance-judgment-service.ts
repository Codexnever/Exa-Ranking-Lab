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
  RankingSnapshot,
  SearchResult,
} from "@/types/type"

import type {
  EvaluationDatasetVersion,
  EvaluationQuery,
  EvaluationQueryJudgments,
  JudgmentAssessment,
  JudgmentSummary,
  RelevanceGrade,
  RelevanceJudgment,
} from "@/types/evaluation"

import {
  AppwriteEvaluationRepository,
  type EvaluationRepository,
} from "./evaluation-dataset-service"

import {
  EvaluationError,
  invalid,
} from "./evaluation-errors"

import {
  parseAdjudicationInput,
  parseJudgmentBatch,
  type ParsedJudgmentLabel,
} from "./evaluation-input-validation"

const MAX_ASSESSMENTS = 50
const MAX_PROVENANCE_ITEMS = 50

const JSON_LIMITS = {
  assessments: 16_384,
  feedback: 4_096,
  snapshots: 4_096,
  rawUrls: 16_384,
  hashes: 8_192,
}

/**
 * Reads ranking snapshots used as evidence for direct relevance judgments.
 */
export interface SnapshotReader {
  getSnapshot(
    id: string,
  ): Promise<RankingSnapshot | null>
}

/**
 * Appwrite-backed snapshot reader for relevance judgment workflows.
 */
class AppwriteSnapshotReader
  implements SnapshotReader
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
        "Failed to read snapshot",
        500,
      )
    }
  }
}

export interface JudgmentBatch {
  snapshotId: string
  labels: ParsedJudgmentLabel[]
}

/**
 * Deduplicates provenance values and enforces the bounded history limit.
 */
function uniqueBounded(
  values: string[],
  name: string,
): string[] {
  const result = [
    ...new Set(values),
  ]

  if (
    result.length >
    MAX_PROVENANCE_ITEMS
  ) {
    throw new EvaluationError(
      "PROVENANCE_LIMIT",
      `${name} exceeds ${MAX_PROVENANCE_ITEMS} entries`,
      409,
    )
  }

  return result
}

/**
 * Verifies that a serialized provenance field fits its persisted byte limit.
 */
function assertJson(
  value: unknown,
  limit: number,
  name: string,
) {
  if (
    Buffer.byteLength(
      JSON.stringify(value),
      "utf8",
    ) > limit
  ) {
    throw new EvaluationError(
      "PROVENANCE_LIMIT",
      `${name} exceeds its storage limit`,
      409,
    )
  }
}

/**
 * Builds the stable deduplication identity for one judgment assessment.
 */
function assessmentKey(
  assessment: JudgmentAssessment,
  documentKey: string,
) {
  return [
    assessment.assessorUserId,
    assessment.proposedGrade,
    assessment.sourceSnapshotId ??
      "",
    assessment.sourceFeedbackId ??
      "",
    documentKey,
  ].join("\n")
}

/**
 * Manages relevance judgments and their immutable provenance evidence.
 */
export class RelevanceJudgmentService {
  constructor(
    private readonly repository: EvaluationRepository,
    private readonly snapshotReader: SnapshotReader =
      new AppwriteSnapshotReader(),
  ) {}

  /**
   * Applies direct relevance labels from an authoritative ranking snapshot.
   *
   * The complete request is resolved before the first mutation so an invalid
   * later label cannot leave an otherwise avoidable partially applied batch.
   */
  async submitDirectLabels(
    ownerUserId: string,
    datasetId: string,
    evaluationQueryId: string,
    batch: JudgmentBatch,
  ): Promise<EvaluationQueryJudgments> {
    batch =
      parseJudgmentBatch(batch)

    const {
      dataset,
      query,
    } = await this.context(
      ownerUserId,
      datasetId,
      evaluationQueryId,
      true,
    )

    const snapshot =
      await this.snapshotReader.getSnapshot(
        batch.snapshotId,
      )

    if (!snapshot) {
      throw new EvaluationError(
        "NOT_FOUND",
        "Snapshot not found",
        404,
      )
    }

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

    /*
     * Resolve every submitted URL against the snapshot before starting writes.
     * This reduces avoidable partial mutations when one label is invalid.
     */
    const resolved =
      batch.labels.map(
        (label) => ({
          label,
          result: this.result(
            snapshot,
            label.resultUrl,
          ),
        }),
      )

    let mutationStarted =
      false

    try {
      for (
        const {
          label,
          result,
        } of resolved
      ) {
        mutationStarted = true

        await this.applyProposal(
          dataset,
          query,
          snapshot,
          result,
          label,
          ownerUserId,
        )
      }
    } finally {
      /*
       * Appwrite does not provide a cross-document transaction for this flow.
       * Reconciliation restores server-owned counters after any started batch,
       * including one interrupted by a persistence failure.
       */
      if (mutationStarted) {
        await this.reconcileCounts(
          dataset.id,
        )
      }
    }

    return this.getJudgmentsForEvaluationQuery(
      ownerUserId,
      datasetId,
      evaluationQueryId,
    )
  }

  /**
   * Resolves a conflicted judgment through curator adjudication.
   */
  async adjudicate(
    ownerUserId: string,
    datasetId: string,
    judgmentId: string,
    grade: RelevanceGrade,
    rationale: string,
  ): Promise<RelevanceJudgment> {
    ;({
      grade,
      rationale,
    } = parseAdjudicationInput({
      grade,
      rationale,
    }))

    const dataset =
      await this.ownedDataset(
        ownerUserId,
        datasetId,
        true,
      )

    const judgment =
      await this.repository.getJudgment(
        judgmentId,
      )

    if (
      !judgment ||
      judgment.datasetVersionId !==
        dataset.id
    ) {
      throw new EvaluationError(
        "NOT_FOUND",
        "Relevance judgment not found",
        404,
      )
    }

    if (
      judgment.status !==
      "conflicted"
    ) {
      throw new EvaluationError(
        "INVALID_STATE",
        "Only a conflicted judgment can be adjudicated",
        409,
      )
    }

    if (!rationale.trim()) {
      throw invalid(
        "A rationale is required to adjudicate a conflict",
      )
    }

    const now = new Date()

    const assessment:
      JudgmentAssessment = {
      assessorUserId:
        ownerUserId,
      proposedGrade:
        grade,
      rationale:
        rationale.trim(),
      source:
        "curator_adjudication",
      createdAt:
        now,
    }

    const updated = {
      ...judgment,

      status:
        "accepted" as const,

      relevanceGrade:
        grade,

      rationale:
        rationale.trim(),

      assessments:
        this.appendAssessment(
          judgment.assessments,
          assessment,
          judgment.documentKey,
        ),

      updatedAt:
        now,

      updatedByUserId:
        ownerUserId,

      acceptedAt:
        now,

      acceptedByUserId:
        ownerUserId,
    }

    this.assertStorageBounds(
      updated,
    )

    const saved =
      await this.repository.updateJudgment(
        updated,
      )

    await this.reconcileCounts(
      dataset.id,
    )

    return saved
  }

  /**
   * Returns all judgments and their summary for one evaluation query.
   */
  async getJudgmentsForEvaluationQuery(
    ownerUserId: string,
    datasetId: string,
    evaluationQueryId: string,
  ): Promise<EvaluationQueryJudgments> {
    const {
      dataset,
      query,
    } = await this.context(
      ownerUserId,
      datasetId,
      evaluationQueryId,
      false,
    )

    const judgments =
      await this.repository.listJudgments(
        datasetId,
        evaluationQueryId,
      )

    return {
      dataset,
      query,
      judgments,
      summary:
        this.summary(judgments),
    }
  }

  /**
   * Returns accepted judgments with an authoritative relevance grade.
   */
  async getAcceptedJudgmentsForEvaluationQuery(
    ownerUserId: string,
    datasetId: string,
    evaluationQueryId: string,
  ): Promise<RelevanceJudgment[]> {
    const detail =
      await this.getJudgmentsForEvaluationQuery(
        ownerUserId,
        datasetId,
        evaluationQueryId,
      )

    return detail.judgments.filter(
      (judgment) =>
        judgment.status ===
          "accepted" &&
        judgment.relevanceGrade !==
          null,
    )
  }

  /**
   * Applies one direct-label proposal to the canonical judgment identified by
   * dataset version, evaluation query, and canonical document identity.
   */
  private async applyProposal(
    dataset: EvaluationDatasetVersion,
    query: EvaluationQuery,
    snapshot: RankingSnapshot,
    result: SearchResult,
    label: ParsedJudgmentLabel,
    userId: string,
  ) {
    const identity =
      getDocumentIdentity(
        result.url,
      )

    const key =
      createJudgmentKey(
        dataset.id,
        query.id,
        identity.documentKey,
      )

    const now = new Date()

    const assessment:
      JudgmentAssessment = {
      assessorUserId:
        userId,
      proposedGrade:
        label.grade,
      source:
        "direct_label",
      sourceSnapshotId:
        snapshot.id,
      observedRawUrl:
        result.url,
      observedContentHash:
        result.contentHash,
      createdAt:
        now,

      ...(label.rationale
        ? {
            rationale:
              label.rationale,
          }
        : {}),
    }

    let existing =
      await this.repository.getJudgmentByKey(
        key,
      )

    /*
     * The first proposal for a canonical document creates an accepted judgment.
     */
    if (!existing) {
      const judgment:
        Omit<
          RelevanceJudgment,
          "id"
        > = {
        judgmentKey:
          key,
        datasetVersionId:
          dataset.id,
        evaluationQueryId:
          query.id,
        sourceQueryId:
          query.sourceQueryId,
        documentKey:
          identity.documentKey,
        canonicalUrl:
          identity.canonicalUrl,

        domain:
          result.domain ||
          new URL(
            identity.canonicalUrl,
          ).hostname,

        status:
          "accepted",
        relevanceGrade:
          label.grade,
        source:
          "direct_label",

        assessments: [
          assessment,
        ],

        sourceFeedbackIds: [],

        sourceSnapshotIds: [
          snapshot.id,
        ],

        observedRawUrls: [
          result.url,
        ],

        observedContentHashes:
          result.contentHash
            ? [
                result.contentHash,
              ]
            : [],

        ...(label.rationale
          ? {
              rationale:
                label.rationale,
            }
          : {}),

        createdAt:
          now,

        createdByUserId:
          userId,

        updatedAt:
          now,

        updatedByUserId:
          userId,

        acceptedAt:
          now,

        acceptedByUserId:
          userId,
      }

      this.assertStorageBounds(
        judgment,
      )

      try {
        await this.repository.createJudgment(
          judgment,
        )

        return
      } catch (error) {
        /*
         * A concurrent creator may win the unique-key race. In that case,
         * reload the canonical judgment and continue as an update.
         */
        if (
          !(
            error instanceof
              EvaluationError
          ) ||
          error.code !==
            "CONFLICT"
        ) {
          throw error
        }

        existing =
          await this.repository.getJudgmentByKey(
            key,
          )

        if (!existing) {
          throw error
        }
      }
    }

    const assessments =
      this.appendAssessment(
        existing.assessments,
        assessment,
        identity.documentKey,
      )

    const isDuplicate =
      assessments.length ===
      existing.assessments.length

    const sourceSnapshotIds =
      uniqueBounded(
        [
          ...existing.sourceSnapshotIds,
          snapshot.id,
        ],
        "sourceSnapshotIds",
      )

    const observedRawUrls =
      uniqueBounded(
        [
          ...existing.observedRawUrls,
          result.url,
        ],
        "observedRawUrls",
      )

    const observedContentHashes =
      uniqueBounded(
        [
          ...existing.observedContentHashes,
          ...(result.contentHash
            ? [
                result.contentHash,
              ]
            : []),
        ],
        "observedContentHashes",
      )

    /*
     * Avoid a persistence write when the proposal and every provenance field
     * are already represented by the existing judgment.
     */
    if (
      isDuplicate &&
      sourceSnapshotIds.length ===
        existing.sourceSnapshotIds
          .length &&
      observedRawUrls.length ===
        existing.observedRawUrls
          .length &&
      observedContentHashes.length ===
        existing
          .observedContentHashes
          .length
    ) {
      return
    }

    const conflicted =
      existing.status ===
        "conflicted" ||
      (
        existing.status ===
          "accepted" &&
        existing.relevanceGrade !==
          label.grade
      )

    const updated:
      RelevanceJudgment = {
      ...existing,

      assessments,
      sourceSnapshotIds,
      observedRawUrls,
      observedContentHashes,

      status:
        conflicted
          ? "conflicted"
          : "accepted",

      relevanceGrade:
        conflicted
          ? null
          : label.grade,

      updatedAt:
        now,

      updatedByUserId:
        userId,

      ...(conflicted
        ? {
            acceptedAt:
              undefined,
            acceptedByUserId:
              undefined,
          }
        : {
            acceptedAt:
              existing.acceptedAt ??
              now,
            acceptedByUserId:
              existing.acceptedByUserId ??
              userId,
          }),
    }

    this.assertStorageBounds(
      updated,
    )

    await this.repository.updateJudgment(
      updated,
    )
  }

  /**
   * Resolves a submitted URL to the canonical matching result in a snapshot.
   */
  private result(
    snapshot: RankingSnapshot,
    rawUrl: string,
  ): SearchResult {
    const target =
      getDocumentIdentity(
        rawUrl,
      ).documentKey

    const result =
      snapshot.results.find(
        (item) => {
          try {
            return (
              getDocumentIdentity(
                item.url,
              ).documentKey ===
              target
            )
          } catch {
            return false
          }
        },
      )

    if (!result) {
      throw new EvaluationError(
        "RESULT_NOT_FOUND",
        "Submitted result URL is not present in the snapshot",
        404,
      )
    }

    return result
  }

  /**
   * Appends an assessment unless its stable provenance identity already exists.
   */
  private appendAssessment(
    existing: JudgmentAssessment[],
    next: JudgmentAssessment,
    documentKey: string,
  ) {
    if (
      existing.some(
        (item) =>
          assessmentKey(
            item,
            documentKey,
          ) ===
          assessmentKey(
            next,
            documentKey,
          ),
      )
    ) {
      return existing
    }

    if (
      existing.length >=
      MAX_ASSESSMENTS
    ) {
      throw new EvaluationError(
        "PROVENANCE_LIMIT",
        `assessments exceeds ${MAX_ASSESSMENTS} entries`,
        409,
      )
    }

    return [
      ...existing,
      next,
    ]
  }

  /**
   * Enforces persisted JSON size limits for judgment provenance fields.
   */
  private assertStorageBounds(
    judgment:
      | Omit<
          RelevanceJudgment,
          "id"
        >
      | RelevanceJudgment,
  ) {
    assertJson(
      judgment.assessments,
      JSON_LIMITS.assessments,
      "assessmentsJson",
    )

    assertJson(
      judgment.sourceFeedbackIds,
      JSON_LIMITS.feedback,
      "sourceFeedbackIdsJson",
    )

    assertJson(
      judgment.sourceSnapshotIds,
      JSON_LIMITS.snapshots,
      "sourceSnapshotIdsJson",
    )

    assertJson(
      judgment.observedRawUrls,
      JSON_LIMITS.rawUrls,
      "observedRawUrlsJson",
    )

    assertJson(
      judgment.observedContentHashes,
      JSON_LIMITS.hashes,
      "observedContentHashesJson",
    )
  }

  /**
   * Summarizes judgment workflow states.
   */
  private summary(
    items: RelevanceJudgment[],
  ): JudgmentSummary {
    return {
      accepted:
        items.filter(
          (item) =>
            item.status ===
            "accepted",
        ).length,

      pending:
        items.filter(
          (item) =>
            item.status ===
            "pending",
        ).length,

      conflicted:
        items.filter(
          (item) =>
            item.status ===
            "conflicted",
        ).length,

      total:
        items.length,
    }
  }

  /**
   * Recomputes dataset judgment counters from persisted source-of-truth rows.
   */
  private async reconcileCounts(
    datasetId: string,
  ) {
    const items =
      await this.repository.listJudgments(
        datasetId,
      )

    await this.repository.updateDataset(
      datasetId,
      {
        judgmentCount:
          items.filter(
            (item) =>
              item.status ===
              "accepted",
          ).length,

        conflictCount:
          items.filter(
            (item) =>
              item.status ===
              "conflicted",
          ).length,

        updatedAt:
          new Date(),
      },
    )
  }

  /**
   * Loads and authorizes a dataset, optionally requiring draft mutability.
   */
  private async ownedDataset(
    userId: string,
    id: string,
    mutable: boolean,
  ) {
    const dataset =
      await this.repository.getDataset(
        id,
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
      userId
    ) {
      throw new EvaluationError(
        "UNAUTHORIZED",
        "Evaluation dataset access denied",
        403,
      )
    }

    if (
      mutable &&
      dataset.status !== "draft"
    ) {
      throw new EvaluationError(
        "DATASET_NOT_DRAFT",
        "Judgments can only be changed on a draft dataset",
        409,
      )
    }

    return dataset
  }

  /**
   * Loads the owned dataset and verifies that the evaluation query belongs to
   * that exact dataset version.
   */
  private async context(
    userId: string,
    datasetId: string,
    queryId: string,
    mutable: boolean,
  ) {
    const dataset =
      await this.ownedDataset(
        userId,
        datasetId,
        mutable,
      )

    const query =
      await this.repository.getQuery(
        queryId,
      )

    if (
      !query ||
      query.datasetVersionId !==
        dataset.id
    ) {
      throw new EvaluationError(
        "NOT_FOUND",
        "Evaluation query not found in dataset",
        404,
      )
    }

    return {
      dataset,
      query,
    }
  }
}

/**
 * Creates a relevance judgment service with injectable persistence dependencies.
 */
export function createRelevanceJudgmentService(
  repository: EvaluationRepository,
  snapshotReader?: SnapshotReader,
) {
  return new RelevanceJudgmentService(
    repository,
    snapshotReader,
  )
}

export const relevanceJudgmentService =
  new RelevanceJudgmentService(
    new AppwriteEvaluationRepository(),
  )