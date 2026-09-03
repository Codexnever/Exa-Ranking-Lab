import {
  databases,
  DATABASE_ID,
  COLLECTIONS,
  ID,
  Query,
} from "@/app/server/appwrite/appwrite-server"

import { getDocumentIdentity } from "@/utils/canonicalize-document-url"

import type {
  EvaluationStrategy,
  StrategyExecution,
  StrategyExecutionDocument,
  StrategyExecutionSource,
  StrategyLatencyType,
  StrategyStatus,
  StrategyType,
} from "@/types/evaluation-strategy"

import { canonicalizeStageDocuments } from "./evaluation-stage-trace-calculations"
import { strategyConfigHash } from "./evaluation-strategy-calculations"

import {
  evaluationDatasetService,
  type EvaluationDatasetService,
} from "./evaluation-dataset-service"

import {
  evaluationStageTraceService,
  type EvaluationStageTraceService,
} from "./evaluation-stage-trace-service"

import {
  EvaluationError,
  invalid,
} from "./evaluation-errors"

import { STRATEGY_BENCHMARK_POLICY as POLICY } from "./strategy-benchmark-policy"

import {
  createManifest,
  deterministicJson,
  manifestJson,
  parseManifest,
  type PayloadManifest,
} from "./evaluation-payload-codec"

import {
  evaluationPayloadRepository,
  type EvaluationPayloadRepository,
  type PayloadRevisionRef,
} from "./evaluation-payload-repository"

type Doc = Record<string, unknown>

/**
 * Persistence contract for strategy definitions, executions, and ranked
 * execution documents.
 */
export interface StrategyRepository {
  createStrategy(
    id: string,
    data: Doc,
  ): Promise<Doc>

  deleteStrategy(
    id: string,
  ): Promise<void>

  updateStrategy(
    id: string,
    data: Doc,
  ): Promise<Doc>

  getStrategy(
    id: string,
  ): Promise<Doc | null>

  listStrategies(
    userId: string,
    includeArchived: boolean,
  ): Promise<Doc[]>

  createExecution(
    id: string,
    data: Doc,
  ): Promise<Doc>

  createExecutionDocument(
    id: string,
    data: Doc,
  ): Promise<Doc>

  deleteExecution(
    id: string,
  ): Promise<void>

  deleteExecutionDocuments(
    id: string,
  ): Promise<void>

  getExecution(
    id: string,
  ): Promise<Doc | null>

  listExecutions(
    userId: string,
    datasetId: string,
    strategyId?: string,
    evaluationQueryId?: string,
  ): Promise<Doc[]>

  listExecutionDocuments(
    executionId: string,
  ): Promise<Doc[]>
}

/**
 * Converts persistence failures into stable evaluation-domain errors.
 */
function storage(
  error: unknown,
  action: string,
): never {
  if (
    error instanceof EvaluationError
  ) {
    throw error
  }

  if (
    (error as { code?: number })
      ?.code === 404
  ) {
    throw new EvaluationError(
      "NOT_FOUND",
      `${action} not found`,
      404,
    )
  }

  throw new EvaluationError(
    "STORAGE_ERROR",
    `Failed to ${action}`,
    500,
  )
}

/**
 * Appwrite-backed persistence for strategies and executions.
 */
export class AppwriteStrategyRepository
  implements StrategyRepository
{
  async createStrategy(
    id: string,
    data: Doc,
  ) {
    try {
      return (
        await databases.createDocument(
          DATABASE_ID,
          COLLECTIONS.EVALUATION_STRATEGIES,
          id,
          data,
        )
      ) as unknown as Doc
    } catch (error) {
      storage(
        error,
        "create strategy",
      )
    }
  }

  async updateStrategy(
    id: string,
    data: Doc,
  ) {
    try {
      return (
        await databases.updateDocument(
          DATABASE_ID,
          COLLECTIONS.EVALUATION_STRATEGIES,
          id,
          data,
        )
      ) as unknown as Doc
    } catch (error) {
      storage(
        error,
        "update strategy status",
      )
    }
  }

  async deleteStrategy(
    id: string,
  ) {
    try {
      await databases.deleteDocument(
        DATABASE_ID,
        COLLECTIONS.EVALUATION_STRATEGIES,
        id,
      )
    } catch (error) {
      if (
        (error as { code?: number })
          ?.code !== 404
      ) {
        storage(
          error,
          "delete incomplete strategy",
        )
      }
    }
  }

  async getStrategy(
    id: string,
  ) {
    try {
      return (
        await databases.getDocument(
          DATABASE_ID,
          COLLECTIONS.EVALUATION_STRATEGIES,
          id,
        )
      ) as unknown as Doc
    } catch (error) {
      if (
        (error as { code?: number })
          ?.code === 404
      ) {
        return null
      }

      storage(
        error,
        "read strategy",
      )
    }
  }

  async listStrategies(
    userId: string,
    includeArchived: boolean,
  ) {
    try {
      const result =
        await databases.listDocuments(
          DATABASE_ID,
          COLLECTIONS.EVALUATION_STRATEGIES,
          [
            Query.equal(
              "createdByUserId",
              userId,
            ),
            ...(includeArchived
              ? []
              : [
                  Query.equal(
                    "status",
                    "active",
                  ),
                ]),
            Query.orderDesc(
              "createdAt",
            ),
            Query.limit(100),
          ],
        )

      return result.documents as unknown as Doc[]
    } catch (error) {
      storage(
        error,
        "list strategies",
      )
    }
  }

  async createExecution(
    id: string,
    data: Doc,
  ) {
    try {
      return (
        await databases.createDocument(
          DATABASE_ID,
          COLLECTIONS.EVALUATION_STRATEGY_EXECUTIONS,
          id,
          data,
        )
      ) as unknown as Doc
    } catch (error) {
      storage(
        error,
        "create strategy execution",
      )
    }
  }

  async createExecutionDocument(
    id: string,
    data: Doc,
  ) {
    try {
      return (
        await databases.createDocument(
          DATABASE_ID,
          COLLECTIONS.EVALUATION_STRATEGY_EXECUTION_DOCUMENTS,
          id,
          data,
        )
      ) as unknown as Doc
    } catch (error) {
      storage(
        error,
        "create strategy execution document",
      )
    }
  }

  async deleteExecution(
    id: string,
  ) {
    try {
      await databases.deleteDocument(
        DATABASE_ID,
        COLLECTIONS.EVALUATION_STRATEGY_EXECUTIONS,
        id,
      )
    } catch (error) {
      if (
        (error as { code?: number })
          ?.code !== 404
      ) {
        storage(
          error,
          "delete incomplete execution",
        )
      }
    }
  }

  async deleteExecutionDocuments(
    id: string,
  ) {
    for (
      const document of await this.listExecutionDocuments(
        id,
      )
    ) {
      await databases.deleteDocument(
        DATABASE_ID,
        COLLECTIONS.EVALUATION_STRATEGY_EXECUTION_DOCUMENTS,
        String(document.$id),
      )
    }
  }

  async getExecution(
    id: string,
  ) {
    try {
      return (
        await databases.getDocument(
          DATABASE_ID,
          COLLECTIONS.EVALUATION_STRATEGY_EXECUTIONS,
          id,
        )
      ) as unknown as Doc
    } catch (error) {
      if (
        (error as { code?: number })
          ?.code === 404
      ) {
        return null
      }

      storage(
        error,
        "read strategy execution",
      )
    }
  }

  async listExecutions(
    userId: string,
    datasetId: string,
    strategyId?: string,
    evaluationQueryId?: string,
  ) {
    try {
      const result =
        await databases.listDocuments(
          DATABASE_ID,
          COLLECTIONS.EVALUATION_STRATEGY_EXECUTIONS,
          [
            Query.equal(
              "datasetVersionId",
              datasetId,
            ),
            Query.equal(
              "createdByUserId",
              userId,
            ),
            ...(strategyId
              ? [
                  Query.equal(
                    "strategyId",
                    strategyId,
                  ),
                ]
              : []),
            ...(evaluationQueryId
              ? [
                  Query.equal(
                    "evaluationQueryId",
                    evaluationQueryId,
                  ),
                ]
              : []),
            Query.orderDesc(
              "createdAt",
            ),
            Query.limit(500),
          ],
        )

      return result.documents as unknown as Doc[]
    } catch (error) {
      storage(
        error,
        "list strategy executions",
      )
    }
  }

  async listExecutionDocuments(
    id: string,
  ) {
    try {
      const result =
        await databases.listDocuments(
          DATABASE_ID,
          COLLECTIONS.EVALUATION_STRATEGY_EXECUTION_DOCUMENTS,
          [
            Query.equal(
              "executionId",
              id,
            ),
            Query.orderAsc(
              "rank",
            ),
            Query.limit(500),
          ],
        )

      return result.documents as unknown as Doc[]
    } catch (error) {
      storage(
        error,
        "read strategy execution documents",
      )
    }
  }
}

/**
 * Reads a required non-empty string from a persisted record.
 */
const required = (
  document: Doc,
  key: string,
) => {
  const value = document[key]

  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new TypeError(
      `${key} is required`,
    )
  }

  return value
}

/**
 * Reads an optional persisted string.
 */
const nullable = (
  value: unknown,
) =>
  value === null ||
  value === undefined
    ? null
    : required(
        { value },
        "value",
      )

/**
 * Parses a persisted date.
 */
const date = (
  value: unknown,
) => {
  const result = new Date(
    String(value),
  )

  if (
    Number.isNaN(
      result.getTime(),
    )
  ) {
    throw new TypeError(
      "date is malformed",
    )
  }

  return result
}

/**
 * Validates a persisted integer.
 */
const integer = (
  value: unknown,
  name: string,
  min = 0,
) => {
  if (
    !Number.isInteger(value) ||
    Number(value) < min
  ) {
    throw new TypeError(
      `${name} is malformed`,
    )
  }

  return Number(value)
}

/**
 * Requires a plain object with Object.prototype.
 */
const plainObject = (
  value: unknown,
  name: string,
) => {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !==
      Object.prototype
  ) {
    throw new TypeError(
      `${name} is malformed`,
    )
  }

  return value as Record<
    string,
    unknown
  >
}

type StrategyHeader =
  Omit<
    EvaluationStrategy,
    "configuration"
  > & {
    payloadRevision: string
    payloadManifest: PayloadManifest
  }

/**
 * Validates and transforms the physical strategy header.
 *
 * Strategy configuration itself lives in a revisioned payload and is hydrated
 * separately.
 */
export function transformStrategyHeader(
  document: Doc,
): StrategyHeader {
  if (
    "configurationJson" in
    document
  ) {
    throw new TypeError(
      "Legacy or mixed strategy representation is unsupported",
    )
  }

  const type =
    required(
      document,
      "type",
    ) as StrategyType

  const status =
    required(
      document,
      "status",
    ) as StrategyStatus

  const latencyType =
    required(
      document,
      "latencyType",
    ) as StrategyLatencyType

  if (
    ![
      "keyword",
      "dense",
      "hybrid",
      "reranked",
      "external",
      "custom",
    ].includes(type) ||
    ![
      "active",
      "archived",
    ].includes(status) ||
    ![
      "end_to_end",
      "retrieval_only",
      "rerank_only",
      "custom",
    ].includes(latencyType)
  ) {
    throw new TypeError(
      "strategy enum is malformed",
    )
  }

  const payloadRevision =
    required(
      document,
      "payloadRevision",
    )

  if (
    !/^[a-f0-9]{64}$/.test(
      payloadRevision,
    )
  ) {
    throw new TypeError(
      "strategy payload revision is malformed",
    )
  }

  const payloadManifest =
    parseManifest(
      required(
        document,
        "payloadManifestJson",
      ),
      "strategy",
    )

  return {
    id: required(
      document,
      "$id",
    ),

    name: required(
      document,
      "name",
    ),

    type,

    description:
      String(
        document.description ?? "",
      ),

    provider:
      nullable(
        document.provider,
      ),

    model:
      nullable(
        document.model,
      ),

    configHash:
      required(
        document,
        "configHash",
      ),

    latencyType,
    status,

    executionCount:
      integer(
        document.executionCount,
        "executionCount",
      ),

    createdAt:
      date(
        document.createdAt,
      ),

    createdByUserId:
      required(
        document,
        "createdByUserId",
      ),

    archivedAt:
      document.archivedAt
        ? date(
            document.archivedAt,
          )
        : null,

    payloadRevision,
    payloadManifest,
  }
}

/**
 * Rehydrates a complete strategy and verifies its configuration hash.
 */
export function transformStrategy(
  document: Doc,
  configurationValue: unknown,
): EvaluationStrategy {
  const header =
    transformStrategyHeader(
      document,
    )

  const configuration =
    plainObject(
      configurationValue,
      "configuration",
    )

  const result:
    EvaluationStrategy = {
    id: header.id,
    name: header.name,
    type: header.type,
    description:
      header.description,
    provider:
      header.provider,
    model:
      header.model,
    configuration,
    configHash:
      header.configHash,
    latencyType:
      header.latencyType,
    status:
      header.status,
    executionCount:
      header.executionCount,
    createdAt:
      header.createdAt,
    createdByUserId:
      header.createdByUserId,
    archivedAt:
      header.archivedAt,
  }

  if (
    strategyConfigHash(
      result,
    ) !== result.configHash
  ) {
    throw new TypeError(
      "strategy configuration hash is inconsistent",
    )
  }

  return result
}

/**
 * Reconstructs and validates a persisted strategy execution.
 */
export function transformExecution(
  header: Doc,
  documents: Doc[],
  providerMetadata: unknown = {},
): StrategyExecution {
  if (
    "providerMetadataJson" in
    header
  ) {
    throw new TypeError(
      "Legacy or mixed execution representation is unsupported",
    )
  }

  const resultCount =
    integer(
      header.resultCount,
      "resultCount",
      1,
    )

  const transformedDocuments:
    StrategyExecutionDocument[] =
    documents.map(
      (document) => {
        const canonicalUrl =
          required(
            document,
            "canonicalUrl",
          )

        const identity =
          getDocumentIdentity(
            canonicalUrl,
          )

        if (
          identity.canonicalUrl !==
            canonicalUrl ||
          identity.documentKey !==
            document.documentKey
        ) {
          throw new TypeError(
            "strategy execution canonical identity is malformed",
          )
        }

        return {
          documentKey:
            identity.documentKey,
          canonicalUrl,
          rawUrl:
            required(
              document,
              "rawUrl",
            ),
          rank:
            integer(
              document.rank,
              "rank",
              1,
            ),
          score:
            document.score === null ||
            document.score === undefined
              ? null
              : Number(
                  document.score,
                ),
          scoreType:
            nullable(
              document.scoreType,
            ),
          title:
            nullable(
              document.title,
            ),
          domain:
            required(
              document,
              "domain",
            ),
        }
      },
    )

  const source =
    required(
      header,
      "source",
    ) as StrategyExecutionSource

  const latencyType =
    required(
      header,
      "latencyType",
    ) as StrategyLatencyType

  if (
    ![
      "native",
      "imported",
    ].includes(source) ||
    ![
      "end_to_end",
      "retrieval_only",
      "rerank_only",
      "custom",
    ].includes(latencyType)
  ) {
    throw new TypeError(
      "strategy execution enum is malformed",
    )
  }

  if (
    resultCount >
      POLICY.maximumResultsPerExecution ||
    transformedDocuments.length !==
      resultCount ||
    new Set(
      transformedDocuments.map(
        (document) =>
          document.documentKey,
      ),
    ).size !==
      transformedDocuments.length ||
    transformedDocuments.some(
      (document, index) =>
        (
          index > 0 &&
          document.rank <=
            transformedDocuments[
              index - 1
            ].rank
        ) ||
        (
          document.score !== null &&
          !Number.isFinite(
            document.score,
          )
        ),
    )
  ) {
    throw new TypeError(
      "strategy execution documents are malformed",
    )
  }

  return {
    id: required(
      header,
      "$id",
    ),

    strategyId:
      required(
        header,
        "strategyId",
      ),

    datasetVersionId:
      required(
        header,
        "datasetVersionId",
      ),

    evaluationQueryId:
      required(
        header,
        "evaluationQueryId",
      ),

    sourceQueryId:
      required(
        header,
        "sourceQueryId",
      ),

    queryText:
      required(
        header,
        "queryText",
      ),

    source,

    configHash:
      required(
        header,
        "configHash",
      ),

    requestedResultCount:
      header.requestedResultCount ===
        null ||
      header.requestedResultCount ===
        undefined
        ? null
        : integer(
            header.requestedResultCount,
            "requestedResultCount",
            1,
          ),

    resultCount,

    latencyMs:
      header.latencyMs === null ||
      header.latencyMs === undefined
        ? null
        : Number(
            header.latencyMs,
          ),

    latencyType,

    stageTraceId:
      nullable(
        header.stageTraceId,
      ),

    providerMetadata:
      plainObject(
        providerMetadata,
        "providerMetadata",
      ),

    duplicateCanonicalResultsIgnored:
      integer(
        header.duplicateCanonicalResultsIgnored,
        "duplicates",
      ),

    documents:
      transformedDocuments,

    createdAt:
      date(
        header.createdAt,
      ),

    createdByUserId:
      required(
        header,
        "createdByUserId",
      ),
  }
}

/**
 * Builds a payload reference for a strategy configuration revision.
 */
function strategyPayloadRef(
  header: Doc,
  ownerUserId: string,
): PayloadRevisionRef {
  const value =
    transformStrategyHeader(
      header,
    )

  return {
    ownerUserId,
    entityType:
      "strategy",
    entityId:
      value.id,
    payloadRevision:
      value.payloadRevision,
    manifest:
      value.payloadManifest,
  }
}

/**
 * Builds the stable map key used for hydrated payload revisions.
 */
function payloadKey(
  ref: Pick<
    PayloadRevisionRef,
    | "entityType"
    | "entityId"
    | "payloadRevision"
  >,
) {
  return `${ref.entityType}:${ref.entityId}:${ref.payloadRevision}`
}

/**
 * Builds a payload reference for optional execution provider metadata.
 *
 * Revision and manifest must either both exist or both be absent.
 */
function executionPayloadRef(
  header: Doc,
  ownerUserId: string,
): PayloadRevisionRef | null {
  const revision =
    header.payloadRevision

  const manifestJsonValue =
    header.payloadManifestJson

  const hasRevision =
    revision !== null &&
    revision !== undefined &&
    revision !== ""

  const hasManifest =
    manifestJsonValue !== null &&
    manifestJsonValue !== undefined &&
    manifestJsonValue !== ""

  if (
    hasRevision !== hasManifest
  ) {
    throw new TypeError(
      "Execution payload revision and manifest must both be present or absent",
    )
  }

  if (!hasRevision) {
    return null
  }

  const payloadRevision =
    required(
      header,
      "payloadRevision",
    )

  if (
    !/^[a-f0-9]{64}$/.test(
      payloadRevision,
    )
  ) {
    throw new TypeError(
      "execution payload revision is malformed",
    )
  }

  return {
    ownerUserId,
    datasetVersionId:
      required(
        header,
        "datasetVersionId",
      ),
    entityType:
      "strategy_execution",
    entityId:
      required(
        header,
        "$id",
      ),
    payloadRevision,
    manifest:
      parseManifest(
        required(
          header,
          "payloadManifestJson",
        ),
        "strategy_execution",
      ),
  }
}

/**
 * Coordinates strategy lifecycle and immutable strategy execution persistence.
 */
export class EvaluationStrategyService {
  constructor(
    private readonly repository: StrategyRepository =
      new AppwriteStrategyRepository(),
    private readonly datasets: EvaluationDatasetService =
      evaluationDatasetService,
    private readonly traces: EvaluationStageTraceService =
      evaluationStageTraceService,
    private readonly payloads: Pick<
      EvaluationPayloadRepository,
      | "writeRevision"
      | "readRevision"
      | "batchReadRevisions"
      | "deleteRevision"
    > = evaluationPayloadRepository,
  ) {}

  /**
   * Creates an active strategy with revisioned configuration provenance.
   */
  async createStrategy(
    userId: string,
    input: unknown,
  ) {
    const raw =
      this.object(input)

    const allowed = [
      "name",
      "type",
      "description",
      "provider",
      "model",
      "configuration",
      "latencyType",
    ]

    if (
      Object.keys(raw).some(
        (key) =>
          !allowed.includes(key),
      )
    ) {
      throw invalid(
        "Strategy input contains unsupported fields",
      )
    }

    const name =
      this.text(
        raw.name,
        "name",
        256,
      )

    const type =
      raw.type as StrategyType

    const latencyType =
      raw.latencyType as StrategyLatencyType

    if (
      ![
        "keyword",
        "dense",
        "hybrid",
        "reranked",
        "external",
        "custom",
      ].includes(type)
    ) {
      throw invalid(
        "Strategy type is invalid",
      )
    }

    if (
      ![
        "end_to_end",
        "retrieval_only",
        "rerank_only",
        "custom",
      ].includes(latencyType)
    ) {
      throw invalid(
        "latencyType is invalid",
      )
    }

    const configuration =
      this.configuration(
        raw.configuration,
      )

    const provider =
      this.optional(
        raw.provider,
        "provider",
        256,
      )

    const model =
      this.optional(
        raw.model,
        "model",
        256,
      )

    const configHash =
      strategyConfigHash({
        type,
        provider,
        model,
        latencyType,
        configuration,
      })

    const strategyId =
      ID.unique()

    const prepared =
      createManifest({
        strategy_configuration:
          configuration,
      })

    const payloadRevision =
      prepared.revision

    try {
      const manifest =
        await this.payloads.writeRevision({
          ownerUserId: userId,
          entityType:
            "strategy",
          entityId:
            strategyId,
          payloadRevision,
          values: {
            strategy_configuration:
              configuration,
          },
        })

      const hydrated =
        await this.payloads.readRevision({
          ownerUserId: userId,
          entityType:
            "strategy",
          entityId:
            strategyId,
          payloadRevision,
          manifest,
        })

      const verified =
        this.configuration(
          hydrated.strategy_configuration,
        )

      if (
        strategyConfigHash({
          type,
          provider,
          model,
          latencyType,
          configuration:
            verified,
        }) !== configHash
      ) {
        throw new EvaluationError(
          "INVALID_STATE",
          "Strategy configuration hash verification failed",
          409,
        )
      }

      const data = {
        name,
        type,

        description:
          this.optional(
            raw.description,
            "description",
            2000,
          ) ?? "",

        provider,
        model,
        payloadRevision,

        payloadManifestJson:
          manifestJson(
            manifest,
          ),

        configHash,
        latencyType,
        status:
          "active",
        executionCount: 0,

        createdAt:
          new Date().toISOString(),

        createdByUserId:
          userId,

        archivedAt: null,
      }

      const header =
        await this.repository.createStrategy(
          strategyId,
          data,
        )

      return await this.getStrategy(
        userId,
        required(
          header,
          "$id",
        ),
      )
    } catch (error) {
      const cleanup =
        await Promise.allSettled([
          this.repository.deleteStrategy(
            strategyId,
          ),

          this.payloads.deleteRevision({
            ownerUserId: userId,
            entityType:
              "strategy",
            entityId:
              strategyId,
            payloadRevision,
          }),
        ])

      if (
        cleanup.some(
          (result) =>
            result.status ===
            "rejected",
        )
      ) {
        console.error(
          "[Strategy] cleanup failed for a newly generated strategy",
        )
      }

      throw error
    }
  }

  /**
   * Lists strategies and hydrates their revisioned configuration payloads.
   */
  async listStrategies(
    userId: string,
    includeArchived = false,
  ) {
    const headers =
      await this.repository.listStrategies(
        userId,
        includeArchived,
      )

    for (const header of headers) {
      if (
        header.createdByUserId !==
        userId
      ) {
        throw new EvaluationError(
          "INVALID_STATE",
          "Strategy listing contains foreign records",
          409,
        )
      }
    }

    const refs =
      headers.map(
        (header) =>
          strategyPayloadRef(
            header,
            userId,
          ),
      )

    const payloads =
      await this.payloads.batchReadRevisions(
        refs,
      )

    return headers.map(
      (header, index) =>
        transformStrategy(
          header,
          payloads.get(
            payloadKey(
              refs[index],
            ),
          )?.strategy_configuration,
        ),
    )
  }

  /**
   * Loads and verifies a single owned strategy.
   */
  async getStrategy(
    userId: string,
    id: string,
  ) {
    if (!id?.trim()) {
      throw invalid(
        "Strategy ID is required",
      )
    }

    const document =
      await this.repository.getStrategy(
        id,
      )

    if (!document) {
      throw new EvaluationError(
        "NOT_FOUND",
        "Strategy not found",
        404,
      )
    }

    if (
      document.createdByUserId !==
      userId
    ) {
      throw new EvaluationError(
        "UNAUTHORIZED",
        "Strategy access denied",
        403,
      )
    }

    const ref =
      strategyPayloadRef(
        document,
        userId,
      )

    const payload =
      await this.payloads.readRevision(
        ref,
      )

    return transformStrategy(
      document,
      payload.strategy_configuration,
    )
  }

  /**
   * Archives a strategy while preserving historical executions.
   */
  async archiveStrategy(
    userId: string,
    id: string,
  ) {
    const strategy =
      await this.getStrategy(
        userId,
        id,
      )

    if (
      strategy.status ===
      "archived"
    ) {
      return strategy
    }

    const updated =
      await this.repository.updateStrategy(
        id,
        {
          status: "archived",
          archivedAt:
            new Date().toISOString(),
        },
      )

    return transformStrategy(
      updated,
      strategy.configuration,
    )
  }

  /**
   * Persists one immutable strategy execution against a frozen evaluation
   * query.
   */
  async createExecution(
    userId: string,
    datasetId: string,
    input: unknown,
  ) {
    const raw =
      this.object(input)

    const allowed = [
      "strategyId",
      "evaluationQueryId",
      "source",
      "results",
      "requestedResultCount",
      "latencyMs",
      "stageTraceId",
      "providerMetadata",
    ]

    if (
      Object.keys(raw).some(
        (key) =>
          !allowed.includes(key),
      )
    ) {
      throw invalid(
        "Execution input contains unsupported fields",
      )
    }

    const detail =
      await this.datasets.getDatasetDetail(
        userId,
        datasetId,
      )

    if (
      detail.dataset.status !==
      "frozen"
    ) {
      throw new EvaluationError(
        "DATASET_NOT_FROZEN",
        "Strategy execution requires a frozen dataset",
        409,
      )
    }

    const strategy =
      await this.getStrategy(
        userId,
        this.text(
          raw.strategyId,
          "strategyId",
          64,
        ),
      )

    if (
      strategy.status !== "active"
    ) {
      throw new EvaluationError(
        "INVALID_STATE",
        "Archived strategies cannot receive executions",
        409,
      )
    }

    const evaluationQueryId =
      this.text(
        raw.evaluationQueryId,
        "evaluationQueryId",
        64,
      )

    const query =
      detail.queries.find(
        (item) =>
          item.id ===
          evaluationQueryId,
      )

    if (!query) {
      throw new EvaluationError(
        "NOT_FOUND",
        "Evaluation query is not in the dataset",
        404,
      )
    }

    if (
      !Array.isArray(
        raw.results,
      ) ||
      !raw.results.length ||
      raw.results.length >
        POLICY.maximumResultsPerExecution
    ) {
      throw invalid(
        `results must contain 1-${POLICY.maximumResultsPerExecution} documents`,
      )
    }

    for (
      const item of raw.results as Array<
        Record<string, unknown>
      >
    ) {
      if (
        !item ||
        typeof item !== "object" ||
        Array.isArray(item)
      ) {
        throw invalid(
          "Each execution result must be an object",
        )
      }

      if (
        [
          "documentKey",
          "canonicalUrl",
          "rank",
          "relevanceGrade",
          "metrics",
          "configHash",
        ].some(
          (key) =>
            key in item,
        )
      ) {
        throw invalid(
          "Server derives canonical identity and ranks",
        )
      }

      if (
        typeof item.url !==
          "string" ||
        !item.url.trim() ||
        item.url.length > 2048
      ) {
        throw invalid(
          "Execution result URL is invalid",
        )
      }

      if (
        item.scoreType !== undefined &&
        item.scoreType !== null &&
        (
          typeof item.scoreType !==
            "string" ||
          item.scoreType.length >
            128
        )
      ) {
        throw invalid(
          "Execution scoreType is invalid",
        )
      }

      if (
        item.title !== undefined &&
        item.title !== null &&
        (
          typeof item.title !==
            "string" ||
          item.title.length >
            1000
        )
      ) {
        throw invalid(
          "Execution title is invalid",
        )
      }
    }

    const prepared =
      canonicalizeStageDocuments(
        (
          raw.results as Array<
            Record<
              string,
              unknown
            >
          >
        ).map(
          (item) => ({
            url:
              item.url as string,
            score:
              item.score as
                | number
                | undefined,
            scoreType:
              item.scoreType as
                | string
                | undefined,
            title:
              item.title as
                | string
                | undefined,
          }),
        ),
      )

    const latencyMs =
      raw.latencyMs === undefined ||
      raw.latencyMs === null
        ? null
        : Number(
            raw.latencyMs,
          )

    if (
      latencyMs !== null &&
      (
        !Number.isFinite(
          latencyMs,
        ) ||
        latencyMs < 0
      )
    ) {
      throw invalid(
        "latencyMs must be non-negative",
      )
    }

    const source =
      raw.source as StrategyExecutionSource

    if (
      source !== "native" &&
      source !== "imported"
    ) {
      throw invalid(
        "Execution source is invalid",
      )
    }

    if (
      raw.requestedResultCount !==
        undefined &&
      raw.requestedResultCount !==
        null &&
      (
        !Number.isInteger(
          raw.requestedResultCount,
        ) ||
        Number(
          raw.requestedResultCount,
        ) < 1
      )
    ) {
      throw invalid(
        "requestedResultCount must be a positive integer",
      )
    }

    const stageTraceId =
      this.optional(
        raw.stageTraceId,
        "stageTraceId",
        64,
      )

    /*
     * A linked trace must describe the same frozen dataset/query. When a final
     * stage exists, its canonical ranking must match the imported execution.
     */
    if (stageTraceId) {
      const trace =
        await this.traces.get(
          userId,
          stageTraceId,
        )

      if (
        trace.datasetVersionId !==
          datasetId ||
        trace.evaluationQueryId !==
          query.id ||
        trace.sourceQueryId !==
          query.sourceQueryId
      ) {
        throw new EvaluationError(
          "INVALID_STATE",
          "Stage trace is incompatible with strategy execution",
          409,
        )
      }

      const finalStage =
        trace.stages.find(
          (stage) =>
            stage.type ===
            "final",
        )

      if (
        finalStage &&
        (
          finalStage.documents.length !==
            prepared.documents.length ||
          finalStage.documents.some(
            (
              document,
              index,
            ) =>
              document.documentKey !==
                prepared.documents[
                  index
                ].documentKey ||
              document.rank !==
                prepared.documents[
                  index
                ].rank,
          )
        )
      ) {
        throw new EvaluationError(
          "INVALID_STATE",
          "Stage trace final ranking does not match imported strategy results",
          409,
        )
      }
    }

    const executionId =
      ID.unique()

    const createdAt =
      new Date()

    const metadata =
      raw.providerMetadata ===
        undefined ||
      raw.providerMetadata ===
        null
        ? null
        : this.configuration(
            raw.providerMetadata,
          )

    const hasMetadata =
      metadata !== null &&
      Object.keys(
        metadata,
      ).length > 0

    const preparedMetadata =
      hasMetadata
        ? createManifest({
            provider_metadata:
              metadata,
          })
        : null

    const payloadRevision =
      preparedMetadata?.revision ??
      null

    let counterIncremented =
      false

    try {
      let manifest:
        | PayloadManifest
        | null = null

      if (
        hasMetadata &&
        payloadRevision
      ) {
        manifest =
          await this.payloads.writeRevision({
            ownerUserId: userId,
            datasetVersionId:
              datasetId,
            entityType:
              "strategy_execution",
            entityId:
              executionId,
            payloadRevision,
            values: {
              provider_metadata:
                metadata,
            },
          })

        const verified =
          await this.payloads.readRevision({
            ownerUserId: userId,
            datasetVersionId:
              datasetId,
            entityType:
              "strategy_execution",
            entityId:
              executionId,
            payloadRevision,
            manifest,
          })

        this.configuration(
          verified.provider_metadata,
        )
      }

      for (
        const document of prepared.documents
      ) {
        await this.repository.createExecutionDocument(
          ID.unique(),
          {
            executionId,
            documentKey:
              document.documentKey,
            canonicalUrl:
              document.canonicalUrl,
            rawUrl:
              document.rawUrl,
            rank:
              document.rank,
            score:
              document.score ===
              null
                ? null
                : String(
                    document.score,
                  ),
            scoreType:
              document.scoreType,
            title:
              document.title,
            domain:
              document.domain,
          },
        )
      }

      const header =
        await this.repository.createExecution(
          executionId,
          {
            strategyId:
              strategy.id,
            datasetVersionId:
              datasetId,
            evaluationQueryId:
              query.id,
            sourceQueryId:
              query.sourceQueryId,
            queryText:
              query.queryText,
            source,
            configHash:
              strategy.configHash,
            requestedResultCount:
              raw.requestedResultCount ??
              null,
            resultCount:
              prepared.documents.length,
            latencyMs:
              latencyMs === null
                ? null
                : String(
                    latencyMs,
                  ),
            latencyType:
              strategy.latencyType,
            stageTraceId,

            ...(payloadRevision &&
            manifest
              ? {
                  payloadRevision,
                  payloadManifestJson:
                    manifestJson(
                      manifest,
                    ),
                }
              : {}),

            duplicateCanonicalResultsIgnored:
              prepared.duplicates,

            createdAt:
              createdAt.toISOString(),

            createdByUserId:
              userId,
          },
        )

      await this.repository.updateStrategy(
        strategy.id,
        {
          executionCount:
            strategy.executionCount +
            1,
        },
      )

      counterIncremented = true

      return await this.getExecution(
        userId,
        required(
          header,
          "$id",
        ),
      )
    } catch (error) {
      const cleanup =
        await Promise.allSettled([
          this.repository.deleteExecution(
            executionId,
          ),

          this.repository.deleteExecutionDocuments(
            executionId,
          ),

          ...(payloadRevision
            ? [
                this.payloads.deleteRevision({
                  ownerUserId:
                    userId,
                  entityType:
                    "strategy_execution" as const,
                  entityId:
                    executionId,
                  payloadRevision,
                }),
              ]
            : []),

          ...(counterIncremented
            ? [
                this.repository.updateStrategy(
                  strategy.id,
                  {
                    executionCount:
                      strategy.executionCount,
                  },
                ),
              ]
            : []),
        ])

      if (
        cleanup.some(
          (result) =>
            result.status ===
            "rejected",
        )
      ) {
        console.error(
          "[StrategyExecution] cleanup failed for a newly generated execution",
        )
      }

      throw error
    }
  }

  /**
   * Loads and fully validates one strategy execution.
   */
  async getExecution(
    userId: string,
    id: string,
  ) {
    const header =
      await this.repository.getExecution(
        id,
      )

    if (!header) {
      throw new EvaluationError(
        "NOT_FOUND",
        "Strategy execution not found",
        404,
      )
    }

    if (
      header.createdByUserId !==
      userId
    ) {
      throw new EvaluationError(
        "UNAUTHORIZED",
        "Strategy execution access denied",
        403,
      )
    }

    const strategy =
      await this.getStrategy(
        userId,
        required(
          header,
          "strategyId",
        ),
      )

    if (
      strategy.configHash !==
      header.configHash
    ) {
      throw new EvaluationError(
        "INVALID_STATE",
        "Execution strategy configuration hash is inconsistent",
        409,
      )
    }

    const detail =
      await this.datasets.getDatasetDetail(
        userId,
        required(
          header,
          "datasetVersionId",
        ),
      )

    const query =
      detail.queries.find(
        (item) =>
          item.id ===
          header.evaluationQueryId,
      )

    if (
      !query ||
      query.sourceQueryId !==
        header.sourceQueryId ||
      query.queryText !==
        header.queryText
    ) {
      throw new EvaluationError(
        "INVALID_STATE",
        "Execution dataset/query linkage is inconsistent",
        409,
      )
    }

    const ref =
      executionPayloadRef(
        header,
        userId,
      )

    const metadata =
      ref
        ? (
            await this.payloads.readRevision(
              ref,
            )
          ).provider_metadata
        : {}

    return transformExecution(
      header,
      await this.repository.listExecutionDocuments(
        id,
      ),
      metadata,
    )
  }

  /**
   * Lists and fully hydrates matching strategy executions.
   */
  async listExecutions(
    userId: string,
    datasetId: string,
    strategyId?: string,
    evaluationQueryId?: string,
  ) {
    const documents =
      await this.repository.listExecutions(
        userId,
        datasetId,
        strategyId,
        evaluationQueryId,
      )

    const results = []

    for (
      const header of documents
    ) {
      if (
        header.createdByUserId !==
        userId
      ) {
        throw new EvaluationError(
          "UNAUTHORIZED",
          "Strategy execution listing contains foreign records",
          403,
        )
      }

      results.push(
        await this.getExecution(
          userId,
          required(
            header,
            "$id",
          ),
        ),
      )
    }

    return results
  }

  /**
   * Validates that an input payload is an object.
   */
  private object(
    value: unknown,
  ) {
    if (
      !value ||
      typeof value !==
        "object" ||
      Array.isArray(value)
    ) {
      throw invalid(
        "Input must be an object",
      )
    }

    return value as Record<
      string,
      unknown
    >
  }

  /**
   * Reads a required trimmed string with a maximum length.
   */
  private text(
    value: unknown,
    name: string,
    max: number,
  ) {
    if (
      typeof value !==
        "string" ||
      !value.trim() ||
      value.length > max
    ) {
      throw invalid(
        `${name} is required`,
      )
    }

    return value.trim()
  }

  /**
   * Reads an optional trimmed string.
   */
  private optional(
    value: unknown,
    name = "optional field",
    max = Number.MAX_SAFE_INTEGER,
  ) {
    if (
      value === undefined ||
      value === null ||
      value === ""
    ) {
      return null
    }

    if (
      typeof value !==
        "string" ||
      value.length > max
    ) {
      throw invalid(
        `${name} is invalid`,
      )
    }

    return value.trim()
  }

  /**
   * Validates and canonicalizes deterministic JSON configuration data.
   */
  private configuration(
    value: unknown,
  ) {
    if (
      value === undefined
    ) {
      return {}
    }

    if (
      !value ||
      typeof value !==
        "object" ||
      Array.isArray(value)
    ) {
      throw invalid(
        "Configuration must be an object",
      )
    }

    let serialized: string

    try {
      serialized =
        deterministicJson(
          value,
        )
    } catch {
      throw invalid(
        "Configuration must be a plain deterministic JSON object",
      )
    }

    if (
      Buffer.byteLength(
        serialized,
      ) > 16_384
    ) {
      throw new EvaluationError(
        "PROVENANCE_LIMIT",
        "Configuration exceeds storage limit",
        413,
      )
    }

    return JSON.parse(
      serialized,
    ) as Record<
      string,
      unknown
    >
  }
}

export const evaluationStrategyService =
  new EvaluationStrategyService()