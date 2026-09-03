import {
  VALID_CATEGORIES,
  type ExaCategory,
} from "@/constants/category-map"

import type {
  EvaluationDatasetVersion,
  EvaluationQuery,
  JudgmentSource,
  JudgmentStatus,
  RelevanceJudgment,
} from "@/types/evaluation"

import {
  assertEvaluationDatasetVersion,
  assertJudgmentState,
  assertRequiredId,
} from "./evaluation-validation"

/**
 * Reads a required string field from a persisted document.
 *
 * The shared ID validator is reused because persisted identifier-like fields
 * must be present and non-empty before transformation.
 */
function requiredString(
  document: Record<string, unknown>,
  key: string,
): string {
  const value = document[key]

  assertRequiredId(key, value)

  return value
}

/**
 * Parses a persisted date field.
 *
 * Optional fields return undefined when no value is stored. Present values
 * must be valid date strings or Date instances.
 */
function date(
  document: Record<string, unknown>,
  key: string,
  optional = false,
): Date | undefined {
  const value = document[key]

  if (
    optional &&
    (
      value === undefined ||
      value === null ||
      value === ""
    )
  ) {
    return undefined
  }

  if (
    typeof value !== "string" &&
    !(value instanceof Date)
  ) {
    throw new TypeError(
      `${key} must be a date`,
    )
  }

  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    throw new TypeError(
      `${key} must be a valid date`,
    )
  }

  return parsed
}

/**
 * Parses a JSON-encoded string array from a persisted document.
 */
function stringArray(
  document: Record<string, unknown>,
  key: string,
): string[] {
  const raw = requiredString(
    document,
    key,
  )

  let value: unknown

  try {
    value = JSON.parse(raw)
  } catch {
    throw new TypeError(
      `${key} must be valid JSON`,
    )
  }

  if (
    !Array.isArray(value) ||
    value.some(
      (item) =>
        typeof item !== "string",
    )
  ) {
    throw new TypeError(
      `${key} must contain a string array`,
    )
  }

  return [...value]
}

/**
 * Transforms a persisted evaluation dataset document into the application
 * domain model and validates the resulting dataset state.
 */
export function transformEvaluationDatasetDocument(
  input: unknown,
): EvaluationDatasetVersion {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input)
  ) {
    throw new TypeError(
      "Dataset document must be an object",
    )
  }

  const document =
    input as Record<string, unknown>

  const dataset: EvaluationDatasetVersion = {
    id: requiredString(
      document,
      "$id",
    ),
    familyKey: requiredString(
      document,
      "familyKey",
    ),
    name: requiredString(
      document,
      "name",
    ),

    ...(typeof document.description ===
      "string" &&
    document.description
      ? {
          description:
            document.description,
        }
      : {}),

    version:
      document.version as number,

    status:
      document.status as EvaluationDatasetVersion["status"],

    ...(typeof document.parentVersionId ===
      "string" &&
    document.parentVersionId
      ? {
          parentVersionId:
            document.parentVersionId,
        }
      : {}),

    ownerUserId: requiredString(
      document,
      "ownerUserId",
    ),

    createdByUserId: requiredString(
      document,
      "createdByUserId",
    ),

    createdAt: date(
      document,
      "createdAt",
    )!,

    updatedAt: date(
      document,
      "updatedAt",
    )!,

    ...(date(
      document,
      "frozenAt",
      true,
    )
      ? {
          frozenAt: date(
            document,
            "frozenAt",
            true,
          ),
        }
      : {}),

    ...(typeof document.frozenByUserId ===
      "string" &&
    document.frozenByUserId
      ? {
          frozenByUserId:
            document.frozenByUserId,
        }
      : {}),

    queryCount:
      document.queryCount as number,

    judgmentCount:
      document.judgmentCount as number,

    conflictCount:
      document.conflictCount as number,

    canonicalizationVersion:
      requiredString(
        document,
        "canonicalizationVersion",
      ),
  }

  assertEvaluationDatasetVersion(
    dataset,
  )

  return dataset
}

/**
 * Transforms a persisted evaluation query document into its domain model.
 *
 * Stored category, pagination configuration, optional search configuration,
 * and query configuration provenance are validated before returning.
 */
export function transformEvaluationQueryDocument(
  input: unknown,
  options: {
    config?: Record<string, unknown>
  } = {},
): EvaluationQuery {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input)
  ) {
    throw new TypeError(
      "Evaluation query document must be an object",
    )
  }

  const document =
    input as Record<string, unknown>

  const category =
    requiredString(
      document,
      "category",
    )

  if (
    !VALID_CATEGORIES.includes(
      category as ExaCategory,
    )
  ) {
    throw new TypeError(
      "Invalid stored evaluation query category",
    )
  }

  const numResults =
    document.numResults

  if (
    !Number.isInteger(numResults) ||
    (numResults as number) <= 0
  ) {
    throw new TypeError(
      "numResults must be a positive integer",
    )
  }

  let searchConfig:
    | Record<string, unknown>
    | undefined

  /*
   * Configuration documents must belong to the same evaluation query and
   * dataset version and must match the query's persisted configuration hash.
   */
  if (options.config) {
    if (
      options.config.evaluationQueryId !==
        document.$id ||
      options.config.datasetVersionId !==
        document.datasetVersionId ||
      options.config.configHash !==
        document.configHash
    ) {
      throw new TypeError(
        "Stored query configuration does not match its query",
      )
    }
  }

  if (
    typeof document.searchConfigJson ===
      "string" &&
    document.searchConfigJson
  ) {
    try {
      searchConfig = JSON.parse(
        document.searchConfigJson,
      )
    } catch {
      throw new TypeError(
        "searchConfigJson must be valid JSON",
      )
    }

    if (
      !searchConfig ||
      typeof searchConfig !== "object" ||
      Array.isArray(searchConfig)
    ) {
      throw new TypeError(
        "searchConfigJson must contain an object",
      )
    }
  }

  return {
    id: requiredString(
      document,
      "$id",
    ),

    datasetVersionId:
      requiredString(
        document,
        "datasetVersionId",
      ),

    sourceQueryId:
      requiredString(
        document,
        "sourceQueryId",
      ),

    queryKey:
      requiredString(
        document,
        "queryKey",
      ),

    name: requiredString(
      document,
      "name",
    ),

    queryText:
      requiredString(
        document,
        "queryText",
      ),

    category:
      category as ExaCategory,

    filters: {
      includeDomains: stringArray(
        document,
        "includeDomainsJson",
      ),

      excludeDomains: stringArray(
        document,
        "excludeDomainsJson",
      ),

      ...(date(
        document,
        "startDate",
        true,
      )
        ? {
            startDate: date(
              document,
              "startDate",
              true,
            )!.toISOString(),
          }
        : {}),

      ...(date(
        document,
        "endDate",
        true,
      )
        ? {
            endDate: date(
              document,
              "endDate",
              true,
            )!.toISOString(),
          }
        : {}),

      numResults:
        numResults as number,
    },

    configHash:
      requiredString(
        document,
        "configHash",
      ),

    ...(searchConfig
      ? { searchConfig }
      : {}),

    createdAt: date(
      document,
      "createdAt",
    )!,

    createdByUserId:
      requiredString(
        document,
        "createdByUserId",
      ),
  }
}

/**
 * Parses a JSON-encoded array without constraining the item shape.
 *
 * Individual callers perform domain-specific validation on the returned
 * values.
 */
function jsonArray(
  document: Record<string, unknown>,
  key: string,
): unknown[] {
  const raw = requiredString(
    document,
    key,
  )

  let value: unknown

  try {
    value = JSON.parse(raw)
  } catch {
    throw new TypeError(
      `${key} must be valid JSON`,
    )
  }

  if (!Array.isArray(value)) {
    throw new TypeError(
      `${key} must contain an array`,
    )
  }

  return value
}

/**
 * Transforms a persisted relevance judgment and its rehydrated evidence into
 * the application domain model.
 *
 * Judgment state, assessments, source type, evidence arrays, and accepted
 * metadata are validated before the object is returned.
 */
export function transformRelevanceJudgmentDocument(
  input: unknown,
): RelevanceJudgment {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input)
  ) {
    throw new TypeError(
      "Judgment document must be an object",
    )
  }

  const document =
    input as Record<string, unknown>

  const status =
    requiredString(
      document,
      "status",
    )

  const grade =
    document.relevanceGrade === undefined ||
    document.relevanceGrade === null
      ? null
      : document.relevanceGrade

  assertJudgmentState(
    status,
    grade,
  )

  const assessmentValues =
    jsonArray(
      document,
      "assessmentsJson",
    )

  const assessments =
    assessmentValues.map(
      (value, index) => {
        if (
          !value ||
          typeof value !== "object" ||
          Array.isArray(value)
        ) {
          throw new TypeError(
            `assessmentsJson[${index}] must be an object`,
          )
        }

        const item =
          value as Record<
            string,
            unknown
          >

        if (
          typeof item.assessorUserId !==
            "string" ||
          !item.assessorUserId ||
          ![0, 1, 2].includes(
            item.proposedGrade as number,
          ) ||
          ![
            "direct_label",
            "feedback_promotion",
            "curator_adjudication",
          ].includes(
            item.source as string,
          )
        ) {
          throw new TypeError(
            `assessmentsJson[${index}] is invalid`,
          )
        }

        const createdAt = new Date(
          item.createdAt as string,
        )

        if (
          Number.isNaN(
            createdAt.getTime(),
          )
        ) {
          throw new TypeError(
            `assessmentsJson[${index}].createdAt is invalid`,
          )
        }

        return {
          assessorUserId:
            item.assessorUserId,

          proposedGrade:
            item.proposedGrade as
              | 0
              | 1
              | 2,

          source:
            item.source as JudgmentSource,

          createdAt,

          ...(typeof item.rationale ===
            "string" &&
          item.rationale
            ? {
                rationale:
                  item.rationale,
              }
            : {}),

          ...(typeof item.sourceFeedbackId ===
            "string" &&
          item.sourceFeedbackId
            ? {
                sourceFeedbackId:
                  item.sourceFeedbackId,
              }
            : {}),

          ...(typeof item.sourceSnapshotId ===
            "string" &&
          item.sourceSnapshotId
            ? {
                sourceSnapshotId:
                  item.sourceSnapshotId,
              }
            : {}),

          ...(typeof item.observedRawUrl ===
            "string" &&
          item.observedRawUrl
            ? {
                observedRawUrl:
                  item.observedRawUrl,
              }
            : {}),

          ...(typeof item.observedContentHash ===
            "string" &&
          item.observedContentHash
            ? {
                observedContentHash:
                  item.observedContentHash,
              }
            : {}),
        }
      },
    )

  /**
   * Parses a persisted evidence array and verifies every item is a string.
   */
  const strings = (
    key: string,
  ) => {
    const values = jsonArray(
      document,
      key,
    )

    if (
      values.some(
        (value) =>
          typeof value !== "string",
      )
    ) {
      throw new TypeError(
        `${key} must contain strings`,
      )
    }

    return values as string[]
  }

  const source =
    requiredString(
      document,
      "source",
    )

  if (
    ![
      "direct_label",
      "feedback_promotion",
      "curator_adjudication",
    ].includes(source)
  ) {
    throw new TypeError(
      "Invalid stored judgment source",
    )
  }

  const acceptedAt = date(
    document,
    "acceptedAt",
    true,
  )

  const acceptedBy =
    typeof document.acceptedByUserId ===
      "string" &&
    document.acceptedByUserId
      ? document.acceptedByUserId
      : undefined

  /*
   * Accepted metadata must remain synchronized with judgment status so stored
   * records cannot represent contradictory acceptance state.
   */
  if (
    status === "accepted" &&
    (!acceptedAt || !acceptedBy)
  ) {
    throw new TypeError(
      "Accepted judgment requires accepted metadata",
    )
  }

  if (
    status !== "accepted" &&
    (acceptedAt || acceptedBy)
  ) {
    throw new TypeError(
      "Non-accepted judgment cannot expose accepted metadata",
    )
  }

  return {
    id: requiredString(
      document,
      "$id",
    ),

    judgmentKey:
      requiredString(
        document,
        "judgmentKey",
      ),

    datasetVersionId:
      requiredString(
        document,
        "datasetVersionId",
      ),

    evaluationQueryId:
      requiredString(
        document,
        "evaluationQueryId",
      ),

    sourceQueryId:
      requiredString(
        document,
        "sourceQueryId",
      ),

    documentKey:
      requiredString(
        document,
        "documentKey",
      ),

    canonicalUrl:
      requiredString(
        document,
        "canonicalUrl",
      ),

    domain: requiredString(
      document,
      "domain",
    ),

    status:
      status as JudgmentStatus,

    relevanceGrade:
      grade as
        | 0
        | 1
        | 2
        | null,

    source:
      source as JudgmentSource,

    assessments,

    sourceFeedbackIds:
      strings(
        "sourceFeedbackIdsJson",
      ),

    sourceSnapshotIds:
      strings(
        "sourceSnapshotIdsJson",
      ),

    observedRawUrls:
      strings(
        "observedRawUrlsJson",
      ),

    observedContentHashes:
      strings(
        "observedContentHashesJson",
      ),

    ...(typeof document.rationale ===
      "string" &&
    document.rationale
      ? {
          rationale:
            document.rationale,
        }
      : {}),

    ...(typeof document.intent ===
      "string" &&
    document.intent
      ? {
          intent:
            document.intent,
        }
      : {}),

    ...(typeof document.subtopic ===
      "string" &&
    document.subtopic
      ? {
          subtopic:
            document.subtopic,
        }
      : {}),

    createdAt: date(
      document,
      "createdAt",
    )!,

    createdByUserId:
      requiredString(
        document,
        "createdByUserId",
      ),

    updatedAt: date(
      document,
      "updatedAt",
    )!,

    updatedByUserId:
      requiredString(
        document,
        "updatedByUserId",
      ),

    ...(acceptedAt
      ? { acceptedAt }
      : {}),

    ...(acceptedBy
      ? {
          acceptedByUserId:
            acceptedBy,
        }
      : {}),
  }
}