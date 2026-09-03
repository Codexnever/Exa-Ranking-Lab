import {
  databases,
  DATABASE_ID,
  COLLECTIONS,
  ID,
  Query,
} from "@/app/server/appwrite/appwrite-server"

import { transformQueryDocument } from "@/utils/db-utils"
import { computeConfigHash } from "@/utils/coverage-and-versioning"
import {
  CANONICALIZATION_VERSION,
  createEvaluationQueryKey,
} from "@/utils/canonicalize-document-url"

import type { QueryConfig } from "@/types/type"
import type {
  EvaluationDatasetDetail,
  EvaluationDatasetStatus,
  EvaluationDatasetVersion,
  EvaluationQuery,
  QueryFoundationReadiness,
  RelevanceJudgment,
} from "@/types/evaluation"

import {
  transformEvaluationDatasetDocument,
  transformEvaluationQueryDocument,
  transformRelevanceJudgmentDocument,
} from "./evaluation-document-transformers"

import {
  EvaluationError,
  invalid,
} from "./evaluation-errors"

import {
  normalizeFamilyKey,
  parseCloneInput,
  parseCreateDatasetInput,
  parseQueryIds,
} from "./evaluation-input-validation"

import {
  sha256,
  splitPayload,
} from "./evaluation-payload-codec"

export interface DatasetListOptions {
  status?: EvaluationDatasetStatus
  familyKey?: string
  limit: number
  offset: number
}

/**
 * Storage contract for evaluation datasets, queries, and judgments.
 */
export interface EvaluationRepository {
  createDataset(
    data: Omit<EvaluationDatasetVersion, "id">,
  ): Promise<EvaluationDatasetVersion>

  updateDataset(
    id: string,
    data: Partial<
      Pick<
        EvaluationDatasetVersion,
        | "queryCount"
        | "judgmentCount"
        | "conflictCount"
        | "status"
        | "frozenAt"
        | "frozenByUserId"
        | "updatedAt"
      >
    >,
  ): Promise<EvaluationDatasetVersion>

  getDataset(
    id: string,
  ): Promise<EvaluationDatasetVersion | null>

  listDatasets(
    ownerUserId: string,
    options: DatasetListOptions,
  ): Promise<EvaluationDatasetVersion[]>

  listFamily(
    ownerUserId: string,
    familyKey: string,
  ): Promise<EvaluationDatasetVersion[]>

  listQueries(
    datasetVersionId: string,
  ): Promise<EvaluationQuery[]>

  createQuery(
    query: Omit<EvaluationQuery, "id">,
  ): Promise<EvaluationQuery>

  getQuery(
    id: string,
  ): Promise<EvaluationQuery | null>

  deleteQuery(
    id: string,
  ): Promise<void>

  getJudgment(
    id: string,
  ): Promise<RelevanceJudgment | null>

  getJudgmentByKey(
    key: string,
  ): Promise<RelevanceJudgment | null>

  listJudgments(
    datasetVersionId: string,
    evaluationQueryId?: string,
  ): Promise<RelevanceJudgment[]>

  createJudgment(
    judgment: Omit<RelevanceJudgment, "id">,
  ): Promise<RelevanceJudgment>

  updateJudgment(
    judgment: RelevanceJudgment,
  ): Promise<RelevanceJudgment>
}

/**
 * Reads operational query definitions that can be copied into evaluation
 * dataset versions.
 */
export interface OperationalQueryReader {
  getQuery(
    id: string,
  ): Promise<QueryConfig | null>
}

/**
 * Detects Appwrite errors caused by missing or incompatible schema resources.
 */
function isSchemaFailure(
  error: unknown,
): boolean {
  const type =
    typeof error === "object" &&
    error !== null &&
    "type" in error
      ? String(
          (error as { type: unknown }).type,
        )
      : ""

  return /(?:collection|database|attribute|index)_not_found|general_argument_invalid/.test(
    type,
  )
}

/**
 * Converts Appwrite failures into stable evaluation-domain errors.
 */
function storageError(
  error: unknown,
  action: string,
): never {
  if (error instanceof EvaluationError) {
    throw error
  }

  if (isSchemaFailure(error)) {
    throw new EvaluationError(
      "SCHEMA_ERROR",
      "Evaluation storage schema is not provisioned or is incompatible",
      500,
    )
  }

  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error
      ? Number(
          (error as { code: unknown }).code,
        )
      : 0

  if (code === 404) {
    throw new EvaluationError(
      "NOT_FOUND",
      `${action} not found`,
      404,
    )
  }

  if (code === 409) {
    throw new EvaluationError(
      "CONFLICT",
      `${action} already exists`,
      409,
    )
  }

  throw new EvaluationError(
    "STORAGE_ERROR",
    `Failed to ${action}`,
    500,
  )
}

/**
 * Produces deterministic JSON for search configuration persistence and hashing.
 *
 * Object keys are recursively sorted while array ordering is preserved.
 */
const stableSearchConfig = (
  value: Record<string, unknown>,
): string => {
  const sort = (
    input: unknown,
  ): unknown => {
    if (Array.isArray(input)) {
      return input.map(sort)
    }

    if (
      input &&
      typeof input === "object"
    ) {
      return Object.fromEntries(
        Object.entries(
          input as Record<string, unknown>,
        )
          .sort(([a], [b]) =>
            a.localeCompare(b),
          )
          .map(([key, nestedValue]) => [
            key,
            sort(nestedValue),
          ]),
      )
    }

    return input
  }

  return JSON.stringify(sort(value))
}

/**
 * Appwrite-backed repository for persisted evaluation state.
 */
export class AppwriteEvaluationRepository
  implements EvaluationRepository
{
  async createDataset(
    data: Omit<EvaluationDatasetVersion, "id">,
  ): Promise<EvaluationDatasetVersion> {
    try {
      const document =
        await databases.createDocument(
          DATABASE_ID,
          COLLECTIONS.EVALUATION_DATASETS,
          ID.unique(),
          {
            familyKey: data.familyKey,
            name: data.name,
            ...(data.description
              ? {
                  description:
                    data.description,
                }
              : {}),
            version: data.version,
            status: data.status,
            ...(data.parentVersionId
              ? {
                  parentVersionId:
                    data.parentVersionId,
                }
              : {}),
            ownerUserId:
              data.ownerUserId,
            createdByUserId:
              data.createdByUserId,
            createdAt:
              data.createdAt.toISOString(),
            updatedAt:
              data.updatedAt.toISOString(),
            queryCount: data.queryCount,
            judgmentCount:
              data.judgmentCount,
            conflictCount:
              data.conflictCount,
            canonicalizationVersion:
              data.canonicalizationVersion,
          },
        )

      return transformEvaluationDatasetDocument(
        document,
      )
    } catch (error) {
      storageError(
        error,
        "create evaluation dataset",
      )
    }
  }

  async updateDataset(
    id: string,
    data: Partial<
      Pick<
        EvaluationDatasetVersion,
        | "queryCount"
        | "judgmentCount"
        | "conflictCount"
        | "status"
        | "frozenAt"
        | "frozenByUserId"
        | "updatedAt"
      >
    >,
  ): Promise<EvaluationDatasetVersion> {
    try {
      const document =
        await databases.updateDocument(
          DATABASE_ID,
          COLLECTIONS.EVALUATION_DATASETS,
          id,
          {
            ...(data.queryCount !==
            undefined
              ? {
                  queryCount:
                    data.queryCount,
                }
              : {}),
            ...(data.judgmentCount !==
            undefined
              ? {
                  judgmentCount:
                    data.judgmentCount,
                }
              : {}),
            ...(data.conflictCount !==
            undefined
              ? {
                  conflictCount:
                    data.conflictCount,
                }
              : {}),
            ...(data.status !== undefined
              ? {
                  status: data.status,
                }
              : {}),
            ...(data.frozenAt !== undefined
              ? {
                  frozenAt:
                    data.frozenAt.toISOString(),
                }
              : {}),
            ...(data.frozenByUserId !==
            undefined
              ? {
                  frozenByUserId:
                    data.frozenByUserId,
                }
              : {}),
            ...(data.updatedAt
              ? {
                  updatedAt:
                    data.updatedAt.toISOString(),
                }
              : {}),
          },
        )

      return transformEvaluationDatasetDocument(
        document,
      )
    } catch (error) {
      storageError(
        error,
        "update evaluation dataset",
      )
    }
  }

  async getDataset(
    id: string,
  ): Promise<EvaluationDatasetVersion | null> {
    try {
      return transformEvaluationDatasetDocument(
        await databases.getDocument(
          DATABASE_ID,
          COLLECTIONS.EVALUATION_DATASETS,
          id,
        ),
      )
    } catch (error) {
      if (isSchemaFailure(error)) {
        storageError(
          error,
          "read evaluation dataset",
        )
      }

      if (
        (error as { code?: number })?.code ===
        404
      ) {
        return null
      }

      storageError(
        error,
        "read evaluation dataset",
      )
    }
  }

  async listDatasets(
    ownerUserId: string,
    options: DatasetListOptions,
  ): Promise<EvaluationDatasetVersion[]> {
    try {
      const filters = [
        Query.equal(
          "ownerUserId",
          ownerUserId,
        ),
        Query.orderDesc("createdAt"),
        Query.limit(options.limit),
        Query.offset(options.offset),
      ]

      if (options.status) {
        filters.push(
          Query.equal(
            "status",
            options.status,
          ),
        )
      }

      if (options.familyKey) {
        filters.push(
          Query.equal(
            "familyKey",
            options.familyKey,
          ),
        )
      }

      const result =
        await databases.listDocuments(
          DATABASE_ID,
          COLLECTIONS.EVALUATION_DATASETS,
          filters,
        )

      return result.documents.map(
        transformEvaluationDatasetDocument,
      )
    } catch (error) {
      storageError(
        error,
        "list evaluation datasets",
      )
    }
  }

  async listFamily(
    ownerUserId: string,
    familyKey: string,
  ): Promise<EvaluationDatasetVersion[]> {
    try {
      const result =
        await databases.listDocuments(
          DATABASE_ID,
          COLLECTIONS.EVALUATION_DATASETS,
          [
            Query.equal(
              "ownerUserId",
              ownerUserId,
            ),
            Query.equal(
              "familyKey",
              familyKey,
            ),
            Query.orderDesc("version"),
            Query.limit(100),
          ],
        )

      return result.documents.map(
        transformEvaluationDatasetDocument,
      )
    } catch (error) {
      storageError(
        error,
        "list dataset family",
      )
    }
  }

  /**
   * Loads evaluation-query headers and optional persisted search configuration.
   *
   * Both collections are paginated independently and joined by evaluation
   * query ID before transformation.
   */
  async listQueries(
    datasetVersionId: string,
  ): Promise<EvaluationQuery[]> {
    try {
      const headers: Record<
        string,
        unknown
      >[] = []

      let offset = 0

      while (true) {
        const result =
          await databases.listDocuments(
            DATABASE_ID,
            COLLECTIONS.EVALUATION_QUERIES,
            [
              Query.equal(
                "datasetVersionId",
                datasetVersionId,
              ),
              Query.orderAsc("queryKey"),
              Query.limit(500),
              Query.offset(offset),
            ],
          )

        headers.push(
          ...(result.documents as Record<
            string,
            unknown
          >[]),
        )

        offset += result.documents.length

        if (
          result.documents.length < 500
        ) {
          break
        }
      }

      const configs: Record<
        string,
        unknown
      >[] = []

      offset = 0

      while (true) {
        const result =
          await databases.listDocuments(
            DATABASE_ID,
            COLLECTIONS.EVALUATION_QUERY_CONFIGS,
            [
              Query.equal(
                "datasetVersionId",
                datasetVersionId,
              ),
              Query.limit(500),
              Query.offset(offset),
            ],
          )

        configs.push(
          ...(result.documents as Record<
            string,
            unknown
          >[]),
        )

        offset += result.documents.length

        if (
          result.documents.length < 500
        ) {
          break
        }
      }

      const configsByQueryId =
        new Map(
          configs.map((config) => [
            String(
              config.evaluationQueryId,
            ),
            config,
          ]),
        )

      return headers.map((header) => {
        const queryId = String(
          header.$id,
        )

        const config =
          configsByQueryId.get(queryId)

        return transformEvaluationQueryDocument(
          {
            ...header,
            ...(config
              ? {
                  searchConfigJson:
                    config.searchConfigJson,
                }
              : {}),
          },
          {
            config,
          },
        )
      })
    } catch (error) {
      storageError(
        error,
        "list evaluation queries",
      )
    }
  }

  /**
   * Persists an evaluation-query header and its optional search configuration.
   *
   * If configuration persistence fails, the previously created header is
   * removed so callers do not observe a partially created query.
   */
  async createQuery(
    query: Omit<EvaluationQuery, "id">,
  ): Promise<EvaluationQuery> {
    const id = ID.unique()

    const configJson =
      query.searchConfig
        ? stableSearchConfig(
            query.searchConfig,
          )
        : undefined

    if (
      configJson &&
      configJson.length > 8192
    ) {
      throw new EvaluationError(
        "INVALID_INPUT",
        "searchConfig exceeds the 8192-character limit",
        400,
      )
    }

    try {
      const payload = {
        datasetVersionId:
          query.datasetVersionId,
        sourceQueryId:
          query.sourceQueryId,
        queryKey: query.queryKey,
        name: query.name,
        queryText: query.queryText,
        category: query.category,
        includeDomainsJson:
          JSON.stringify(
            query.filters.includeDomains ??
              [],
          ),
        excludeDomainsJson:
          JSON.stringify(
            query.filters.excludeDomains ??
              [],
          ),
        ...(query.filters.startDate
          ? {
              startDate: new Date(
                query.filters.startDate,
              ).toISOString(),
            }
          : {}),
        ...(query.filters.endDate
          ? {
              endDate: new Date(
                query.filters.endDate,
              ).toISOString(),
            }
          : {}),
        numResults:
          query.filters.numResults,
        configHash: query.configHash,
        createdAt:
          query.createdAt.toISOString(),
        createdByUserId:
          query.createdByUserId,
      }

      const document =
        await databases.createDocument(
          DATABASE_ID,
          COLLECTIONS.EVALUATION_QUERIES,
          id,
          payload,
        )

      if (configJson) {
        try {
          await databases.createDocument(
            DATABASE_ID,
            COLLECTIONS.EVALUATION_QUERY_CONFIGS,
            id,
            {
              evaluationQueryId: id,
              datasetVersionId:
                query.datasetVersionId,
              searchConfigJson:
                configJson,
              configHash:
                query.configHash,
              createdAt:
                query.createdAt.toISOString(),
              createdByUserId:
                query.createdByUserId,
            },
          )
        } catch (error) {
          try {
            await databases.deleteDocument(
              DATABASE_ID,
              COLLECTIONS.EVALUATION_QUERIES,
              id,
            )
          } catch {}

          throw error
        }
      }

      return transformEvaluationQueryDocument(
        {
          ...document,
          ...(configJson
            ? {
                searchConfigJson:
                  configJson,
              }
            : {}),
        },
      )
    } catch (error) {
      storageError(
        error,
        "create evaluation query",
      )
    }
  }

  async getQuery(
    id: string,
  ): Promise<EvaluationQuery | null> {
    try {
      const document =
        (await databases.getDocument(
          DATABASE_ID,
          COLLECTIONS.EVALUATION_QUERIES,
          id,
        )) as Record<string, unknown>

      let config:
        | Record<string, unknown>
        | undefined

      try {
        config =
          (await databases.getDocument(
            DATABASE_ID,
            COLLECTIONS.EVALUATION_QUERY_CONFIGS,
            id,
          )) as Record<string, unknown>
      } catch (error) {
        if (
          (error as { code?: number })
            ?.code !== 404
        ) {
          throw error
        }
      }

      return transformEvaluationQueryDocument(
        {
          ...document,
          ...(config
            ? {
                searchConfigJson:
                  config.searchConfigJson,
              }
            : {}),
        },
        {
          config,
        },
      )
    } catch (error) {
      if (
        (error as { code?: number })?.code ===
        404
      ) {
        return null
      }

      storageError(
        error,
        "read evaluation query",
      )
    }
  }

  async deleteQuery(
    id: string,
  ): Promise<void> {
    try {
      try {
        await databases.deleteDocument(
          DATABASE_ID,
          COLLECTIONS.EVALUATION_QUERY_CONFIGS,
          id,
        )
      } catch (error) {
        if (
          (error as { code?: number })
            ?.code !== 404
        ) {
          throw error
        }
      }

      await databases.deleteDocument(
        DATABASE_ID,
        COLLECTIONS.EVALUATION_QUERIES,
        id,
      )
    } catch (error) {
      storageError(
        error,
        "delete evaluation query",
      )
    }
  }

  async getJudgment(
    id: string,
  ): Promise<RelevanceJudgment | null> {
    try {
      return transformRelevanceJudgmentDocument(
        await databases.getDocument(
          DATABASE_ID,
          COLLECTIONS.RELEVANCE_JUDGMENTS,
          id,
        ),
      )
    } catch (error) {
      if (
        (error as { code?: number })?.code ===
        404
      ) {
        return null
      }

      storageError(
        error,
        "read relevance judgment",
      )
    }
  }

  async getJudgmentByKey(
    key: string,
  ): Promise<RelevanceJudgment | null> {
    const items =
      await this.listJudgmentsByFilters([
        Query.equal(
          "judgmentKey",
          key,
        ),
      ])

    return items[0] ?? null
  }

  async listJudgments(
    datasetVersionId: string,
    evaluationQueryId?: string,
  ): Promise<RelevanceJudgment[]> {
    const filters = [
      Query.equal(
        "datasetVersionId",
        datasetVersionId,
      ),
    ]

    if (evaluationQueryId) {
      filters.push(
        Query.equal(
          "evaluationQueryId",
          evaluationQueryId,
        ),
      )
    }

    return this.listJudgmentsByFilters(
      filters,
    )
  }

  /**
   * Creates a judgment and stores its evidence payload separately.
   */
  async createJudgment(
    judgment: Omit<RelevanceJudgment, "id">,
  ): Promise<RelevanceJudgment> {
    const id = ID.unique()

    try {
      const evidence =
        await this.writeEvidence(
          judgment,
          id,
        )

      const document =
        await databases.createDocument(
          DATABASE_ID,
          COLLECTIONS.RELEVANCE_JUDGMENTS,
          id,
          this.judgmentPayload(
            judgment,
            evidence,
          ),
        )

      const payload =
        await this.loadEvidence(
          id,
          judgment.datasetVersionId,
          evidence.revision,
        )

      return transformRelevanceJudgmentDocument(
        {
          ...document,
          assessmentsJson:
            JSON.stringify(
              payload.assessments,
            ),
          sourceFeedbackIdsJson:
            JSON.stringify(
              payload.sourceFeedbackIds,
            ),
          sourceSnapshotIdsJson:
            JSON.stringify(
              payload.sourceSnapshotIds,
            ),
          observedRawUrlsJson:
            JSON.stringify(
              payload.observedRawUrls,
            ),
          observedContentHashesJson:
            JSON.stringify(
              payload.observedContentHashes,
            ),
        },
      )
    } catch (error) {
      try {
        await databases.deleteDocument(
          DATABASE_ID,
          COLLECTIONS.RELEVANCE_JUDGMENTS,
          id,
        )
      } catch {}

      storageError(
        error,
        "create relevance judgment",
      )
    }
  }

  /**
   * Updates a judgment after writing a new immutable evidence revision.
   */
  async updateJudgment(
    judgment: RelevanceJudgment,
  ): Promise<RelevanceJudgment> {
    try {
      const evidence =
        await this.writeEvidence(
          judgment,
          judgment.id,
        )

      const document =
        await databases.updateDocument(
          DATABASE_ID,
          COLLECTIONS.RELEVANCE_JUDGMENTS,
          judgment.id,
          this.judgmentPayload(
            judgment,
            evidence,
          ),
        )

      const payload =
        await this.loadEvidence(
          judgment.id,
          judgment.datasetVersionId,
          evidence.revision,
        )

      return transformRelevanceJudgmentDocument(
        {
          ...document,
          assessmentsJson:
            JSON.stringify(
              payload.assessments,
            ),
          sourceFeedbackIdsJson:
            JSON.stringify(
              payload.sourceFeedbackIds,
            ),
          sourceSnapshotIdsJson:
            JSON.stringify(
              payload.sourceSnapshotIds,
            ),
          observedRawUrlsJson:
            JSON.stringify(
              payload.observedRawUrls,
            ),
          observedContentHashesJson:
            JSON.stringify(
              payload.observedContentHashes,
            ),
        },
      )
    } catch (error) {
      storageError(
        error,
        "update relevance judgment",
      )
    }
  }

  /**
   * Lists judgments using paginated Appwrite queries and rehydrates their
   * external evidence payloads before transformation.
   */
  private async listJudgmentsByFilters(
    filters: string[],
  ): Promise<RelevanceJudgment[]> {
    try {
      const output:
        RelevanceJudgment[] = []

      let offset = 0

      while (true) {
        const result =
          await databases.listDocuments(
            DATABASE_ID,
            COLLECTIONS.RELEVANCE_JUDGMENTS,
            [
              ...filters,
              Query.limit(500),
              Query.offset(offset),
            ],
          )

        for (
          const document of result.documents as Record<
            string,
            unknown
          >[]
        ) {
          const payload =
            await this.loadEvidence(
              String(document.$id),
              String(
                document.datasetVersionId,
              ),
              String(
                document.evidenceRevision,
              ),
            )

          output.push(
            transformRelevanceJudgmentDocument(
              {
                ...document,
                assessmentsJson:
                  JSON.stringify(
                    payload.assessments,
                  ),
                sourceFeedbackIdsJson:
                  JSON.stringify(
                    payload.sourceFeedbackIds,
                  ),
                sourceSnapshotIdsJson:
                  JSON.stringify(
                    payload.sourceSnapshotIds,
                  ),
                observedRawUrlsJson:
                  JSON.stringify(
                    payload.observedRawUrls,
                  ),
                observedContentHashesJson:
                  JSON.stringify(
                    payload.observedContentHashes,
                  ),
              },
            ),
          )
        }

        offset += result.documents.length

        if (
          result.documents.length < 500
        ) {
          return output
        }
      }
    } catch (error) {
      storageError(
        error,
        "list relevance judgments",
      )
    }
  }

  /**
   * Reassembles a chunked evidence revision and validates its persisted shape.
   */
  private async loadEvidence(
    judgmentId: string,
    datasetVersionId: string,
    revision: string,
  ): Promise<Record<string, unknown>> {
    const rows =
      await databases.listDocuments(
        DATABASE_ID,
        COLLECTIONS.RELEVANCE_JUDGMENT_PAYLOADS,
        [
          Query.equal(
            "judgmentId",
            judgmentId,
          ),
          Query.equal(
            "datasetVersionId",
            datasetVersionId,
          ),
          Query.equal(
            "evidenceRevision",
            revision,
          ),
          Query.orderAsc("chunkIndex"),
          Query.limit(100),
        ],
      )

    const ordered = [
      ...rows.documents,
    ].sort(
      (a, b) =>
        Number(a.chunkIndex) -
        Number(b.chunkIndex),
    )

    if (!ordered.length) {
      throw new TypeError(
        "Judgment evidence payload is missing",
      )
    }

    const raw = ordered
      .map((row) =>
        String(row.payloadChunk),
      )
      .join("")

    let value: unknown

    try {
      value = JSON.parse(raw)
    } catch {
      throw new TypeError(
        "Judgment evidence payload is malformed JSON",
      )
    }

    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value)
    ) {
      throw new TypeError(
        "Judgment evidence payload must be an object",
      )
    }

    return value as Record<
      string,
      unknown
    >
  }

  /**
   * Stores large judgment evidence as chunked revisioned payload documents.
   */
  private async writeEvidence(
    judgment:
      | Omit<RelevanceJudgment, "id">
      | RelevanceJudgment,
    id: string,
  ) {
    const revision =
      `${judgment.updatedAt.toISOString()}-${judgment.updatedByUserId}`.slice(
        0,
        64,
      )

    const raw = JSON.stringify({
      assessments:
        judgment.assessments,
      sourceFeedbackIds:
        judgment.sourceFeedbackIds,
      sourceSnapshotIds:
        judgment.sourceSnapshotIds,
      observedRawUrls:
        judgment.observedRawUrls,
      observedContentHashes:
        judgment.observedContentHashes,
    })

    const chunks = splitPayload(raw)
    const payloadHash = sha256(raw)

    for (
      let index = 0;
      index < chunks.length;
      index++
    ) {
      await databases.createDocument(
        DATABASE_ID,
        COLLECTIONS.RELEVANCE_JUDGMENT_PAYLOADS,
        ID.unique(),
        {
          judgmentId: id,
          datasetVersionId:
            judgment.datasetVersionId,
          evidenceRevision: revision,
          chunkIndex: index,
          chunkCount: chunks.length,
          payloadChunk: chunks[index],
          payloadHash,
          createdAt:
            judgment.updatedAt.toISOString(),
          createdByUserId:
            judgment.updatedByUserId,
        },
      )
    }

    return {
      revision,
      payloadHash,
      chunkCount: chunks.length,
    }
  }

  /**
   * Builds the persisted judgment header that references an evidence revision.
   */
  private judgmentPayload(
    judgment:
      | Omit<RelevanceJudgment, "id">
      | RelevanceJudgment,
    evidence?: {
      revision: string
      payloadHash: string
      chunkCount: number
    },
  ) {
    return {
      judgmentKey:
        judgment.judgmentKey,
      datasetVersionId:
        judgment.datasetVersionId,
      evaluationQueryId:
        judgment.evaluationQueryId,
      sourceQueryId:
        judgment.sourceQueryId,
      documentKey:
        judgment.documentKey,
      canonicalUrl:
        judgment.canonicalUrl,
      domain: judgment.domain,
      relevanceGrade:
        judgment.relevanceGrade,
      status: judgment.status,
      source: judgment.source,
      evidenceRevision:
        evidence?.revision ?? "legacy",
      evidencePayloadHash:
        evidence?.payloadHash ??
        "legacy",
      evidenceChunkCount:
        evidence?.chunkCount ?? 1,
      rationale:
        judgment.rationale ?? null,
      intent:
        judgment.intent ?? null,
      subtopic:
        judgment.subtopic ?? null,
      createdAt:
        judgment.createdAt.toISOString(),
      createdByUserId:
        judgment.createdByUserId,
      updatedAt:
        judgment.updatedAt.toISOString(),
      updatedByUserId:
        judgment.updatedByUserId,
      acceptedAt:
        judgment.acceptedAt?.toISOString() ??
        null,
      acceptedByUserId:
        judgment.acceptedByUserId ??
        null,
    }
  }
}

/**
 * Appwrite-backed reader for the operational query collection.
 */
class AppwriteOperationalQueryReader
  implements OperationalQueryReader
{
  async getQuery(
    id: string,
  ): Promise<QueryConfig | null> {
    try {
      return transformQueryDocument(
        await databases.getDocument(
          DATABASE_ID,
          COLLECTIONS.QUERIES,
          id,
        ),
        false,
      )
    } catch (error) {
      if (isSchemaFailure(error)) {
        storageError(
          error,
          "read operational query",
        )
      }

      if (
        (error as { code?: number })?.code ===
        404
      ) {
        return null
      }

      storageError(
        error,
        "read operational query",
      )
    }
  }
}

/**
 * Coordinates evaluation dataset lifecycle operations.
 *
 * Draft datasets may receive benchmark queries. Frozen versions are immutable
 * inputs for evaluation and can be cloned into a new draft version.
 */
export class EvaluationDatasetService {
  constructor(
    private readonly repository: EvaluationRepository =
      new AppwriteEvaluationRepository(),
    private readonly queryReader: OperationalQueryReader =
      new AppwriteOperationalQueryReader(),
  ) {}

  /**
   * Creates the first draft version of an evaluation dataset family.
   */
  async createDataset(
    ownerUserId: string,
    input: {
      name: string
      description?: string
      familyKey?: string
    },
  ): Promise<EvaluationDatasetVersion> {
    this.requiredOwner(ownerUserId)

    input =
      parseCreateDatasetInput(input)

    const familyKey = input.familyKey
      ? normalizeFamilyKey(
          input.familyKey,
        )
      : `${normalizeFamilyKey(
          input.name,
        )}-${ID.unique()
          .slice(0, 8)
          .toLowerCase()}`

    const now = new Date()

    return this.repository.createDataset({
      familyKey,
      name: input.name,
      description:
        input.description,
      version: 1,
      status: "draft",
      ownerUserId,
      createdByUserId:
        ownerUserId,
      createdAt: now,
      updatedAt: now,
      queryCount: 0,
      judgmentCount: 0,
      conflictCount: 0,
      canonicalizationVersion:
        CANONICALIZATION_VERSION,
    })
  }

  listDatasets(
    ownerUserId: string,
    options: DatasetListOptions,
  ) {
    this.requiredOwner(ownerUserId)

    return this.repository.listDatasets(
      ownerUserId,
      options,
    )
  }

  /**
   * Returns a dataset together with its benchmark queries and freeze readiness.
   */
  async getDatasetDetail(
    ownerUserId: string,
    id: string,
  ): Promise<EvaluationDatasetDetail> {
    const dataset =
      await this.ownedDataset(
        ownerUserId,
        id,
      )

    const queries =
      await this.repository.listQueries(
        id,
      )

    const judgments =
      await this.repository.listJudgments(
        id,
      )

    return {
      dataset,
      queries,
      readiness:
        this.freezeReadiness(
          dataset,
          queries,
          judgments,
        ),
    }
  }

  /**
   * Copies owned operational queries into a draft evaluation dataset.
   *
   * Existing query keys are skipped so repeated requests remain idempotent.
   */
  async addOperationalQueries(
    ownerUserId: string,
    datasetId: string,
    queryIds: string[],
  ): Promise<{
    dataset: EvaluationDatasetVersion
    queries: EvaluationQuery[]
    added: number
  }> {
    queryIds = parseQueryIds({
      queryIds,
    })

    const dataset =
      await this.ownedDataset(
        ownerUserId,
        datasetId,
      )

    if (dataset.status !== "draft") {
      throw new EvaluationError(
        "DATASET_NOT_DRAFT",
        "Queries can only be added to a draft dataset",
        409,
      )
    }

    const existing =
      await this.repository.listQueries(
        datasetId,
      )

    const byKey = new Map(
      existing.map((query) => [
        query.queryKey,
        query,
      ]),
    )

    let added = 0

    for (const queryId of queryIds) {
      const key =
        createEvaluationQueryKey(
          datasetId,
          queryId,
        )

      if (byKey.has(key)) {
        continue
      }

      const operational =
        await this.queryReader.getQuery(
          queryId,
        )

      if (!operational) {
        throw new EvaluationError(
          "NOT_FOUND",
          `Operational query ${queryId} not found`,
          404,
        )
      }

      if (
        operational.userId !==
        ownerUserId
      ) {
        throw new EvaluationError(
          "UNAUTHORIZED",
          "Operational query is not owned by the dataset owner",
          403,
        )
      }

      const snapshot =
        await this.repository.createQuery(
          this.snapshotQuery(
            datasetId,
            operational,
            ownerUserId,
            key,
          ),
        )

      byKey.set(key, snapshot)
      added++
    }

    const queries = [
      ...byKey.values(),
    ].sort((a, b) =>
      a.queryKey.localeCompare(
        b.queryKey,
      ),
    )

    const updated =
      await this.repository.updateDataset(
        datasetId,
        {
          queryCount: queries.length,
          updatedAt: new Date(),
        },
      )

    return {
      dataset: updated,
      queries,
      added,
    }
  }

  /**
   * Clones a frozen dataset version into the next available draft version.
   *
   * Version allocation is retried on conflicts because concurrent clones may
   * attempt to reserve the same family version.
   */
  async cloneFrozenDataset(
    ownerUserId: string,
    parentId: string,
    overrides: {
      name?: string
      description?: string
    } = {},
  ): Promise<EvaluationDatasetDetail> {
    overrides =
      parseCloneInput(overrides)

    const parent =
      await this.ownedDataset(
        ownerUserId,
        parentId,
      )

    if (parent.status !== "frozen") {
      throw new EvaluationError(
        "DATASET_NOT_FROZEN",
        "Only a frozen dataset version can be cloned",
        409,
      )
    }

    const parentQueries =
      await this.repository.listQueries(
        parentId,
      )

    let clone:
      | EvaluationDatasetVersion
      | undefined

    for (
      let attempt = 0;
      attempt < 3 && !clone;
      attempt++
    ) {
      const family =
        await this.repository.listFamily(
          ownerUserId,
          parent.familyKey,
        )

      const version =
        Math.max(
          ...family.map(
            (item) => item.version,
          ),
          parent.version,
        ) + 1

      const now = new Date()

      try {
        clone =
          await this.repository.createDataset(
            {
              familyKey:
                parent.familyKey,
              name:
                overrides.name ??
                parent.name,
              description:
                overrides.description ??
                parent.description,
              version,
              status: "draft",
              parentVersionId:
                parent.id,
              ownerUserId,
              createdByUserId:
                ownerUserId,
              createdAt: now,
              updatedAt: now,
              queryCount: 0,
              judgmentCount: 0,
              conflictCount: 0,
              canonicalizationVersion:
                CANONICALIZATION_VERSION,
            },
          )
      } catch (error) {
        if (
          !(
            error instanceof
            EvaluationError
          ) ||
          error.code !== "CONFLICT" ||
          attempt === 2
        ) {
          throw error
        }
      }
    }

    if (!clone) {
      throw new EvaluationError(
        "CONFLICT",
        "Could not allocate a dataset version",
        409,
      )
    }

    const copied:
      EvaluationQuery[] = []

    const copiedAt = new Date()

    for (
      const source of parentQueries
    ) {
      const definition = {
        ...source,
      }

      delete (
        definition as Partial<EvaluationQuery>
      ).id

      copied.push(
        await this.repository.createQuery(
          {
            ...definition,
            datasetVersionId:
              clone.id,
            queryKey:
              createEvaluationQueryKey(
                clone.id,
                source.sourceQueryId,
              ),
            filters: {
              ...source.filters,
              includeDomains: [
                ...(source.filters
                  .includeDomains ?? []),
              ],
              excludeDomains: [
                ...(source.filters
                  .excludeDomains ?? []),
              ],
            },
            createdAt: copiedAt,
            createdByUserId:
              ownerUserId,
          },
        ),
      )
    }

    const updated =
      await this.repository.updateDataset(
        clone.id,
        {
          queryCount: copied.length,
          updatedAt: new Date(),
        },
      )

    return {
      dataset: updated,
      queries: copied,
      readiness:
        this.freezeReadiness(
          updated,
          copied,
        ),
    }
  }

  /**
   * Freezes a draft dataset once all query and judgment readiness checks pass.
   */
  async freezeDataset(
    ownerUserId: string,
    datasetId: string,
  ): Promise<EvaluationDatasetDetail> {
    const dataset =
      await this.ownedDataset(
        ownerUserId,
        datasetId,
      )

    if (dataset.status !== "draft") {
      throw new EvaluationError(
        "DATASET_NOT_DRAFT",
        "Only a draft dataset can be frozen",
        409,
      )
    }

    const queries =
      await this.repository.listQueries(
        datasetId,
      )

    const judgments =
      await this.repository.listJudgments(
        datasetId,
      )

    const readiness =
      this.freezeReadiness(
        dataset,
        queries,
        judgments,
      )

    if (
      !readiness.fullEvaluationFreezeReady
    ) {
      throw new EvaluationError(
        "INVALID_STATE",
        `Dataset is not ready to freeze: ${readiness.reasons.join(
          "; ",
        )}`,
        409,
      )
    }

    const now = new Date()

    const frozen =
      await this.repository.updateDataset(
        datasetId,
        {
          status: "frozen",
          frozenAt: now,
          frozenByUserId:
            ownerUserId,
          updatedAt: now,
        },
      )

    return {
      dataset: frozen,
      queries,
      readiness:
        this.freezeReadiness(
          frozen,
          queries,
          judgments,
        ),
    }
  }

  /**
   * Evaluates whether a dataset has enough consistent query and judgment
   * state to become an immutable evaluation version.
   */
  freezeReadiness(
    dataset: EvaluationDatasetVersion,
    queries: EvaluationQuery[],
    judgments: RelevanceJudgment[] = [],
  ): QueryFoundationReadiness {
    const accepted =
      judgments.filter(
        (judgment) =>
          judgment.status ===
          "accepted",
      )

    const conflicted =
      judgments.filter(
        (judgment) =>
          judgment.status ===
          "conflicted",
      )

    const queryIds = new Set(
      queries.map(
        (query) => query.id,
      ),
    )

    const queryFoundationChecks = {
      hasQueries:
        queries.length > 0,

      canonicalizationVersionPresent:
        Boolean(
          dataset.canonicalizationVersion.trim(),
        ),

      queryCountConsistent:
        dataset.queryCount ===
        queries.length,

      noOrphanQueries:
        queries.every(
          (query) =>
            query.datasetVersionId ===
            dataset.id,
        ),
    }

    const checks = {
      ...queryFoundationChecks,

      noConflicts:
        conflicted.length === 0,

      judgmentCountConsistent:
        dataset.judgmentCount ===
        accepted.length,

      conflictCountConsistent:
        dataset.conflictCount ===
        conflicted.length,

      noOrphanJudgments:
        judgments.every(
          (judgment) =>
            judgment.datasetVersionId ===
              dataset.id &&
            queryIds.has(
              judgment.evaluationQueryId,
            ),
        ),

      hasAcceptedJudgments:
        accepted.length > 0,

      everyQueryHasAcceptedJudgment:
        queries.length > 0 &&
        queries.every((query) =>
          accepted.some(
            (judgment) =>
              judgment.evaluationQueryId ===
              query.id,
          ),
        ),
    }

    const queryFoundationReady =
      Object.values(
        queryFoundationChecks,
      ).every(Boolean)

    const acceptedGradesValid =
      accepted.every(
        (judgment) =>
          judgment.relevanceGrade === 0 ||
          judgment.relevanceGrade === 1 ||
          judgment.relevanceGrade === 2,
      )

    const judgmentFoundationReady =
      queryFoundationReady &&
      checks.noConflicts &&
      checks.judgmentCountConsistent &&
      checks.conflictCountConsistent &&
      checks.noOrphanJudgments &&
      checks.hasAcceptedJudgments &&
      checks.everyQueryHasAcceptedJudgment &&
      acceptedGradesValid

    const reasons: string[] = []

    if (!checks.hasQueries) {
      reasons.push(
        "Add at least one benchmark query",
      )
    }

    if (
      !checks.canonicalizationVersionPresent
    ) {
      reasons.push(
        "Canonicalization version is missing",
      )
    }

    if (
      !checks.queryCountConsistent
    ) {
      reasons.push(
        "Stored query count does not match benchmark queries",
      )
    }

    if (!checks.noOrphanQueries) {
      reasons.push(
        "Orphan benchmark queries were found",
      )
    }

    if (
      !checks.judgmentCountConsistent
    ) {
      reasons.push(
        "Stored accepted judgment count is inconsistent",
      )
    }

    if (
      !checks.conflictCountConsistent
    ) {
      reasons.push(
        "Stored conflict count is inconsistent",
      )
    }

    if (!checks.noConflicts) {
      reasons.push(
        `${conflicted.length} unresolved conflict${
          conflicted.length === 1
            ? ""
            : "s"
        }`,
      )
    }

    if (!checks.noOrphanJudgments) {
      reasons.push(
        "Orphan judgments were found",
      )
    }

    if (
      !checks.hasAcceptedJudgments
    ) {
      reasons.push(
        "No accepted judgments exist",
      )
    }

    if (
      !checks.everyQueryHasAcceptedJudgment
    ) {
      reasons.push(
        "Every benchmark query needs an accepted judgment",
      )
    }

    if (!acceptedGradesValid) {
      reasons.push(
        "An accepted judgment has an invalid grade",
      )
    }

    const fullEvaluationFreezeReady =
      queryFoundationReady &&
      judgmentFoundationReady &&
      reasons.length === 0

    return {
      queryFoundationReady,
      judgmentFoundationReady,
      fullEvaluationFreezeReady,
      checks,

      pendingPhases: [
        ...(judgmentFoundationReady
          ? []
          : ["judgments" as const]),

        ...(checks.noConflicts &&
        checks.conflictCountConsistent
          ? []
          : [
              "conflict_resolution" as const,
            ]),

        ...(fullEvaluationFreezeReady
          ? []
          : ["final_freeze" as const]),
      ],

      reasons,
    }
  }

  /**
   * Converts an operational query into an immutable evaluation-query snapshot.
   */
  private snapshotQuery(
    datasetVersionId: string,
    query: QueryConfig,
    userId: string,
    queryKey: string,
  ): Omit<EvaluationQuery, "id"> {
    const numResults =
      query.filters.numResults ?? 50

    if (
      !Number.isInteger(numResults) ||
      numResults <= 0
    ) {
      throw invalid(
        "Operational query numResults must be a positive integer",
      )
    }

    return {
      datasetVersionId,
      sourceQueryId: query.id,
      queryKey,
      name: query.name,
      queryText: query.query,
      category: query.category,

      filters: {
        includeDomains: [
          ...(query.filters
            .includeDomains ?? []),
        ],
        excludeDomains: [
          ...(query.filters
            .excludeDomains ?? []),
        ],
        ...(query.filters.startDate
          ? {
              startDate:
                query.filters.startDate,
            }
          : {}),
        ...(query.filters.endDate
          ? {
              endDate:
                query.filters.endDate,
            }
          : {}),
        numResults,
      },

      configHash:
        computeConfigHash(query),
      createdAt: new Date(),
      createdByUserId: userId,
    }
  }

  /**
   * Loads a dataset and verifies ownership before any mutation or read.
   */
  private async ownedDataset(
    userId: string,
    id: string,
  ) {
    this.requiredOwner(userId)

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
      dataset.ownerUserId !== userId
    ) {
      throw new EvaluationError(
        "UNAUTHORIZED",
        "Evaluation dataset access denied",
        403,
      )
    }

    return dataset
  }

  /**
   * Ensures evaluation operations have an authenticated dataset owner.
   */
  private requiredOwner(
    value: string,
  ) {
    if (!value?.trim()) {
      throw invalid(
        "Authenticated owner ID is required",
      )
    }
  }
}

export const evaluationDatasetService =
  new EvaluationDatasetService()