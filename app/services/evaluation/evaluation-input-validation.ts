import type { EvaluationDatasetStatus } from "@/types/evaluation"

import { invalid } from "./evaluation-errors"

export const MAX_QUERY_BATCH = 50
export const MAX_DATASET_NAME = 256
export const MAX_DESCRIPTION = 2000

const FAMILY_KEY =
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Validates that a request payload is a JSON object.
 */
function record(
  value: unknown,
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw invalid(
      "Request body must be a JSON object",
    )
  }

  return value as Record<
    string,
    unknown
  >
}

/**
 * Normalizes a dataset family key into its canonical lowercase form.
 *
 * Unsupported characters are collapsed into hyphens before the final format
 * and length constraints are validated.
 */
export function normalizeFamilyKey(
  value: string,
): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

  if (
    !normalized ||
    normalized.length > 128 ||
    !FAMILY_KEY.test(normalized)
  ) {
    throw invalid(
      "familyKey must contain only lowercase letters, numbers, and single hyphens",
    )
  }

  return normalized
}

/**
 * Validates and normalizes input for creating an evaluation dataset.
 */
export function parseCreateDatasetInput(
  value: unknown,
): {
  name: string
  description?: string
  familyKey?: string
} {
  const body = record(value)

  if (
    typeof body.name !== "string" ||
    !body.name.trim() ||
    body.name.trim().length >
      MAX_DATASET_NAME
  ) {
    throw invalid(
      `name must be 1-${MAX_DATASET_NAME} characters`,
    )
  }

  if (
    body.description !== undefined &&
    (
      typeof body.description !==
        "string" ||
      body.description.length >
        MAX_DESCRIPTION
    )
  ) {
    throw invalid(
      `description must be at most ${MAX_DESCRIPTION} characters`,
    )
  }

  if (
    body.familyKey !== undefined &&
    typeof body.familyKey !== "string"
  ) {
    throw invalid(
      "familyKey must be a string",
    )
  }

  const allowed = new Set([
    "name",
    "description",
    "familyKey",
  ])

  if (
    Object.keys(body).some(
      (key) => !allowed.has(key),
    )
  ) {
    throw invalid(
      "Request contains unsupported authoritative fields",
    )
  }

  return {
    name: body.name.trim(),

    ...(body.description
      ?.toString()
      .trim()
      ? {
          description:
            body.description
              .toString()
              .trim(),
        }
      : {}),

    ...(body.familyKey
      ? {
          familyKey:
            normalizeFamilyKey(
              body.familyKey,
            ),
        }
      : {}),
  }
}

/**
 * Validates optional overrides used when cloning a frozen dataset.
 */
export function parseCloneInput(
  value: unknown,
): {
  name?: string
  description?: string
} {
  const body =
    value === undefined ||
    value === null
      ? {}
      : record(value)

  const allowed = new Set([
    "name",
    "description",
  ])

  if (
    Object.keys(body).some(
      (key) => !allowed.has(key),
    )
  ) {
    throw invalid(
      "Clone request contains unsupported fields",
    )
  }

  if (
    body.name !== undefined &&
    (
      typeof body.name !== "string" ||
      !body.name.trim() ||
      body.name.trim().length >
        MAX_DATASET_NAME
    )
  ) {
    throw invalid(
      "Invalid clone name",
    )
  }

  if (
    body.description !== undefined &&
    (
      typeof body.description !==
        "string" ||
      body.description.length >
        MAX_DESCRIPTION
    )
  ) {
    throw invalid(
      "Invalid clone description",
    )
  }

  return {
    ...(body.name
      ? {
          name: body.name.trim(),
        }
      : {}),

    ...(body.description !== undefined
      ? {
          description:
            body.description.trim(),
        }
      : {}),
  }
}

/**
 * Validates a batch of operational query IDs before dataset ingestion.
 *
 * Duplicate IDs are removed after validation while preserving first-seen order.
 */
export function parseQueryIds(
  value: unknown,
): string[] {
  const body = record(value)

  if (
    Object.keys(body).some(
      (key) => key !== "queryIds",
    )
  ) {
    throw invalid(
      "Only queryIds may be submitted",
    )
  }

  if (
    !Array.isArray(body.queryIds) ||
    body.queryIds.length === 0 ||
    body.queryIds.length >
      MAX_QUERY_BATCH
  ) {
    throw invalid(
      `queryIds must contain 1-${MAX_QUERY_BATCH} IDs`,
    )
  }

  const ids = body.queryIds.map(
    (item) => {
      if (
        typeof item !== "string" ||
        !item.trim() ||
        item.length > 64
      ) {
        throw invalid(
          "Every query ID must be a non-empty string",
        )
      }

      return item.trim()
    },
  )

  return [...new Set(ids)]
}

/**
 * Parses dataset-list filters and pagination parameters from a request URL.
 */
export function parseListInput(
  params: URLSearchParams,
): {
  status?: EvaluationDatasetStatus
  familyKey?: string
  limit: number
  offset: number
} {
  const status =
    params.get("status")

  if (
    status &&
    ![
      "draft",
      "frozen",
      "archived",
    ].includes(status)
  ) {
    throw invalid(
      "Invalid status filter",
    )
  }

  const family =
    params.get("familyKey")

  const limitRaw =
    params.get("limit") ?? "20"

  const offsetRaw =
    params.get("offset") ?? "0"

  if (
    !/^\d+$/.test(limitRaw) ||
    !/^\d+$/.test(offsetRaw)
  ) {
    throw invalid(
      "limit and offset must be non-negative integers",
    )
  }

  const limit = Number(limitRaw)
  const offset = Number(offsetRaw)

  if (
    limit < 1 ||
    limit > 100 ||
    offset > 10000
  ) {
    throw invalid(
      "limit must be 1-100 and offset at most 10000",
    )
  }

  return {
    ...(status
      ? {
          status:
            status as EvaluationDatasetStatus,
        }
      : {}),

    ...(family
      ? {
          familyKey:
            normalizeFamilyKey(
              family,
            ),
        }
      : {}),

    limit,
    offset,
  }
}

/**
 * Validates a route identifier and narrows it to a non-empty string.
 */
export function assertRouteId(
  name: string,
  value: unknown,
): asserts value is string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 64
  ) {
    throw invalid(
      `${name} must be a non-empty ID`,
    )
  }
}

export const MAX_JUDGMENT_BATCH = 50
export const MAX_RESULT_URL = 2048
export const MAX_RATIONALE = 1000

export interface ParsedJudgmentLabel {
  resultUrl: string
  grade: 0 | 1 | 2
  rationale?: string
}

/**
 * Validates and normalizes a batch of relevance labels for one snapshot.
 */
export function parseJudgmentBatch(
  value: unknown,
): {
  snapshotId: string
  labels: ParsedJudgmentLabel[]
} {
  const body = record(value)

  if (
    Object.keys(body).some(
      (key) =>
        ![
          "snapshotId",
          "labels",
        ].includes(key),
    )
  ) {
    throw invalid(
      "Judgment request contains unsupported authoritative fields",
    )
  }

  assertRouteId(
    "snapshotId",
    body.snapshotId,
  )

  if (
    !Array.isArray(body.labels) ||
    body.labels.length < 1 ||
    body.labels.length >
      MAX_JUDGMENT_BATCH
  ) {
    throw invalid(
      `labels must contain 1-${MAX_JUDGMENT_BATCH} entries`,
    )
  }

  const labels = body.labels.map(
    (
      item,
    ): ParsedJudgmentLabel => {
      const label = record(item)

      if (
        Object.keys(label).some(
          (key) =>
            ![
              "resultUrl",
              "grade",
              "rationale",
            ].includes(key),
        )
      ) {
        throw invalid(
          "Label contains unsupported authoritative fields",
        )
      }

      if (
        typeof label.resultUrl !==
          "string" ||
        !label.resultUrl.trim() ||
        label.resultUrl.length >
          MAX_RESULT_URL
      ) {
        throw invalid(
          `resultUrl must be 1-${MAX_RESULT_URL} characters`,
        )
      }

      if (
        label.grade !== 0 &&
        label.grade !== 1 &&
        label.grade !== 2
      ) {
        throw invalid(
          "grade must be exactly 0, 1, or 2",
        )
      }

      if (
        label.rationale !== undefined &&
        (
          typeof label.rationale !==
            "string" ||
          label.rationale.length >
            MAX_RATIONALE
        )
      ) {
        throw invalid(
          `rationale must be at most ${MAX_RATIONALE} characters`,
        )
      }

      return {
        resultUrl:
          label.resultUrl.trim(),
        grade: label.grade,

        ...(label.rationale?.trim()
          ? {
              rationale:
                label.rationale.trim(),
            }
          : {}),
      }
    },
  )

  return {
    snapshotId: body.snapshotId,
    labels,
  }
}

/**
 * Validates curator adjudication input for a relevance judgment.
 */
export function parseAdjudicationInput(
  value: unknown,
): {
  grade: 0 | 1 | 2
  rationale: string
} {
  const body = record(value)

  if (
    Object.keys(body).some(
      (key) =>
        ![
          "grade",
          "rationale",
        ].includes(key),
    )
  ) {
    throw invalid(
      "Adjudication request contains unsupported fields",
    )
  }

  if (
    body.grade !== 0 &&
    body.grade !== 1 &&
    body.grade !== 2
  ) {
    throw invalid(
      "grade must be exactly 0, 1, or 2",
    )
  }

  if (
    typeof body.rationale !==
      "string" ||
    !body.rationale.trim() ||
    body.rationale.length >
      MAX_RATIONALE
  ) {
    throw invalid(
      `rationale must be 1-${MAX_RATIONALE} characters`,
    )
  }

  return {
    grade: body.grade,
    rationale:
      body.rationale.trim(),
  }
}