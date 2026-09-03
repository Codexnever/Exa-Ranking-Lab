import type {
  AggregateEvaluationResult,
  AggregateMetricValue,
  EvaluationAtCutoff,
  MetricValue,
  PerQueryEvaluationResult,
} from "./metrics/types"

import type {
  EvaluationRun,
  EvaluationRunSnapshotSelection,
  EvaluationRunSummary,
} from "@/types/evaluation-runs"

type Document = Record<string, unknown>

/**
 * Reads a required non-empty string field from a persisted evaluation document.
 */
const required = (
  document: Document,
  key: string,
) => {
  const value = document[key]

  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new TypeError(
      `evaluation run ${key} is required`,
    )
  }

  return value
}

/**
 * Validates and returns an integer greater than or equal to the supplied minimum.
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
      `${name} must be an integer >= ${min}`,
    )
  }

  return Number(value)
}

/**
 * Parses a required JSON-encoded field from a persisted run document.
 */
const json = (
  document: Document,
  key: string,
) => {
  const raw = required(
    document,
    key,
  )

  try {
    return JSON.parse(raw) as unknown
  } catch {
    throw new TypeError(
      `evaluation run ${key} is malformed JSON`,
    )
  }
}

/**
 * Parses a required persisted date value.
 */
const date = (
  value: unknown,
  name: string,
) => {
  if (typeof value !== "string") {
    throw new TypeError(
      `${name} is required`,
    )
  }

  const parsed = new Date(value)

  if (
    Number.isNaN(
      parsed.getTime(),
    )
  ) {
    throw new TypeError(
      `${name} is invalid`,
    )
  }

  return parsed
}

/**
 * Validates that a numeric field contains a finite number.
 */
const finite = (
  value: unknown,
  name: string,
) => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    throw new TypeError(
      `${name} must be finite`,
    )
  }

  return value
}

/**
 * Validates a normalized evaluation score in the inclusive 0-1 range.
 */
const score = (
  value: unknown,
  name: string,
) => {
  const parsed = finite(
    value,
    name,
  )

  if (
    parsed < 0 ||
    parsed > 1
  ) {
    throw new TypeError(
      `${name} must be between 0 and 1`,
    )
  }

  return parsed
}

/**
 * Rejects persisted objects containing fields outside the expected schema.
 */
const exactKeys = (
  value: Record<string, unknown>,
  allowed: string[],
  name: string,
) => {
  if (
    Object.keys(value).some(
      (key) =>
        !allowed.includes(key),
    )
  ) {
    throw new TypeError(
      `${name} contains unsupported fields`,
    )
  }
}

/**
 * Validates that a persisted value is a plain object shape.
 */
const object = (
  value: unknown,
  name: string,
): Record<string, unknown> => {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new TypeError(
      `${name} must be an object`,
    )
  }

  return value as Record<
    string,
    unknown
  >
}

/**
 * Validates a per-query metric value and its availability metadata.
 */
function metricValue(
  value: unknown,
  name: string,
): MetricValue {
  const metric = object(
    value,
    name,
  )

  exactKeys(
    metric,
    [
      "value",
      "eligible",
      "reason",
    ],
    name,
  )

  if (metric.value !== null) {
    score(
      metric.value,
      `${name}.value`,
    )
  }

  if (
    typeof metric.eligible !==
    "boolean"
  ) {
    throw new TypeError(
      `${name}.eligible is invalid`,
    )
  }

  if (
    metric.reason !== undefined &&
    typeof metric.reason !==
      "string"
  ) {
    throw new TypeError(
      `${name}.reason is invalid`,
    )
  }

  if (
    (metric.value === null) ===
    metric.eligible
  ) {
    throw new TypeError(
      `${name} availability is inconsistent`,
    )
  }

  return metric as unknown as MetricValue
}

/**
 * Validates an aggregate metric value and the number of contributing queries.
 */
function aggregateMetric(
  value: unknown,
  name: string,
): AggregateMetricValue {
  const metric = object(
    value,
    name,
  )

  exactKeys(
    metric,
    [
      "value",
      "eligibleQueryCount",
    ],
    name,
  )

  if (metric.value !== null) {
    score(
      metric.value,
      `${name}.value`,
    )
  }

  const count = integer(
    metric.eligibleQueryCount,
    `${name}.eligibleQueryCount`,
  )

  if (
    (metric.value === null) !==
    (count === 0)
  ) {
    throw new TypeError(
      `${name} availability is inconsistent`,
    )
  }

  return metric as unknown as AggregateMetricValue
}

/**
 * Validates and transforms the run-level aggregate evaluation payload.
 *
 * Query counts, cutoff metrics, warnings, and metric availability are checked
 * before the aggregate result is accepted.
 */
function aggregate(
  value: unknown,
): AggregateEvaluationResult {
  const aggregateValue = object(
    value,
    "aggregate",
  )

  exactKeys(
    aggregateValue,
    [
      "metricVersion",
      "queryCount",
      "eligibleQueryCount",
      "skippedQueryCount",
      "mrr",
      "byCutoff",
      "warnings",
    ],
    "aggregate",
  )

  required(
    aggregateValue,
    "metricVersion",
  )

  const queryCount = integer(
    aggregateValue.queryCount,
    "aggregate.queryCount",
  )

  const eligibleQueryCount =
    integer(
      aggregateValue.eligibleQueryCount,
      "aggregate.eligibleQueryCount",
    )

  const skippedQueryCount =
    integer(
      aggregateValue.skippedQueryCount,
      "aggregate.skippedQueryCount",
    )

  if (
    queryCount !==
    eligibleQueryCount +
      skippedQueryCount
  ) {
    throw new TypeError(
      "aggregate query counts are inconsistent",
    )
  }

  const mrr = aggregateMetric(
    aggregateValue.mrr,
    "aggregate.mrr",
  )

  if (
    !Array.isArray(
      aggregateValue.byCutoff,
    ) ||
    !Array.isArray(
      aggregateValue.warnings,
    ) ||
    aggregateValue.warnings.some(
      (warning) =>
        typeof warning !== "string",
    )
  ) {
    throw new TypeError(
      "aggregate arrays are malformed",
    )
  }

  const byCutoff =
    aggregateValue.byCutoff.map(
      (raw, index) => {
        const item = object(
          raw,
          `aggregate.byCutoff[${index}]`,
        )

        exactKeys(
          item,
          [
            "cutoff",
            "meanNdcg",
            "meanBenchmarkRecall",
            "meanHit",
            "meanJudgedPrecision",
            "meanJudgmentCoverage",
          ],
          `aggregate.byCutoff[${index}]`,
        )

        integer(
          item.cutoff,
          "aggregate cutoff",
          1,
        )

        return {
          cutoff:
            Number(item.cutoff),

          meanNdcg:
            aggregateMetric(
              item.meanNdcg,
              "meanNdcg",
            ),

          meanBenchmarkRecall:
            aggregateMetric(
              item.meanBenchmarkRecall,
              "meanBenchmarkRecall",
            ),

          meanHit:
            aggregateMetric(
              item.meanHit,
              "meanHit",
            ),

          meanJudgedPrecision:
            aggregateMetric(
              item.meanJudgedPrecision,
              "meanJudgedPrecision",
            ),

          meanJudgmentCoverage:
            aggregateMetric(
              item.meanJudgmentCoverage,
              "meanJudgmentCoverage",
            ),
        }
      },
    )

  return {
    metricVersion:
      String(
        aggregateValue.metricVersion,
      ) as "1",
    queryCount,
    eligibleQueryCount,
    skippedQueryCount,
    mrr,
    byCutoff,
    warnings: [
      ...aggregateValue.warnings,
    ] as string[],
  }
}

/**
 * Validates one cutoff-level per-query metric result.
 *
 * Metric counts must reconcile exactly between judged, relevant, irrelevant,
 * unjudged, and evaluated result totals.
 */
function cutoffMetric(
  value: unknown,
  index: number,
): EvaluationAtCutoff {
  const metric = object(
    value,
    `perQuery.metrics[${index}]`,
  )

  exactKeys(
    metric,
    [
      "cutoff",
      "ndcg",
      "benchmarkRecall",
      "hit",
      "judgedPrecision",
      "judgmentCoverage",
      "counts",
    ],
    "cutoff metric",
  )

  integer(
    metric.cutoff,
    "cutoff",
    1,
  )

  score(
    metric.hit,
    "hit",
  )

  const countValues = object(
    metric.counts,
    "counts",
  )

  const names = [
    "evaluatedTopK",
    "judged",
    "judgedRelevant",
    "judgedIrrelevant",
    "unjudged",
    "knownRelevantBenchmarkDocuments",
    "duplicateCanonicalResultsIgnored",
  ] as const

  exactKeys(
    countValues,
    [...names],
    "counts",
  )

  const counts =
    Object.fromEntries(
      names.map((name) => [
        name,
        integer(
          countValues[name],
          name,
        ),
      ]),
    ) as unknown as EvaluationAtCutoff["counts"]

  if (
    counts.judged !==
      counts.judgedRelevant +
        counts.judgedIrrelevant ||
    counts.evaluatedTopK !==
      counts.judged +
        counts.unjudged
  ) {
    throw new TypeError(
      "per-query metric counts are inconsistent",
    )
  }

  return {
    cutoff:
      Number(metric.cutoff),

    ndcg:
      metricValue(
        metric.ndcg,
        "ndcg",
      ),

    benchmarkRecall:
      metricValue(
        metric.benchmarkRecall,
        "benchmarkRecall",
      ),

    hit:
      Number(metric.hit),

    judgedPrecision:
      metricValue(
        metric.judgedPrecision,
        "judgedPrecision",
      ),

    judgmentCoverage:
      metricValue(
        metric.judgmentCoverage,
        "judgmentCoverage",
      ),

    counts,
  }
}

/**
 * Validates and transforms a single persisted per-query evaluation result.
 */
export function parsePerQueryResult(
  value: unknown,
): PerQueryEvaluationResult {
  const result = object(
    value,
    "perQuery result",
  )

  exactKeys(
    result,
    [
      "datasetVersionId",
      "evaluationQueryId",
      "sourceQueryId",
      "snapshotId",
      "metricVersion",
      "eligible",
      "reciprocalRank",
      "metrics",
      "warnings",
    ],
    "perQuery result",
  )

  for (
    const key of [
      "datasetVersionId",
      "evaluationQueryId",
      "sourceQueryId",
      "snapshotId",
      "metricVersion",
    ]
  ) {
    required(
      result,
      key,
    )
  }

  if (
    typeof result.eligible !==
    "boolean"
  ) {
    throw new TypeError(
      "perQuery eligible is invalid",
    )
  }

  finite(
    result.reciprocalRank,
    "reciprocalRank",
  )

  if (
    !Array.isArray(
      result.metrics,
    ) ||
    !Array.isArray(
      result.warnings,
    ) ||
    result.warnings.some(
      (warning) =>
        typeof warning !== "string",
    )
  ) {
    throw new TypeError(
      "perQuery arrays are malformed",
    )
  }

  return {
    datasetVersionId:
      String(
        result.datasetVersionId,
      ),

    evaluationQueryId:
      String(
        result.evaluationQueryId,
      ),

    sourceQueryId:
      String(
        result.sourceQueryId,
      ),

    snapshotId:
      String(
        result.snapshotId,
      ),

    metricVersion:
      String(
        result.metricVersion,
      ) as "1",

    eligible:
      result.eligible,

    reciprocalRank:
      Number(
        result.reciprocalRank,
      ),

    metrics:
      result.metrics.map(
        cutoffMetric,
      ),

    warnings: [
      ...result.warnings,
    ] as string[],
  }
}

/**
 * Validates that metric cutoffs form a non-empty, unique, ascending sequence.
 */
function cutoffs(
  value: unknown,
): number[] {
  if (
    !Array.isArray(value) ||
    !value.length
  ) {
    return (() => {
      throw new TypeError(
        "cutoffs must be a non-empty array",
      )
    })()
  }

  const result = value.map(
    (item, index) =>
      integer(
        item,
        `cutoffs[${index}]`,
        1,
      ),
  )

  if (
    new Set(result).size !==
      result.length ||
    result.some(
      (item, index) =>
        index > 0 &&
        item <
          result[index - 1],
    )
  ) {
    throw new TypeError(
      "cutoffs must be unique and sorted",
    )
  }

  return result
}

/**
 * Validates the snapshot selected for each evaluation query in a run.
 */
function selections(
  value: unknown,
): EvaluationRunSnapshotSelection[] {
  if (
    !Array.isArray(value) ||
    !value.length
  ) {
    throw new TypeError(
      "snapshot selections must be a non-empty array",
    )
  }

  const result = value.map(
    (raw, index) => {
      const selection = object(
        raw,
        `selection[${index}]`,
      )

      exactKeys(
        selection,
        [
          "evaluationQueryId",
          "snapshotId",
        ],
        "selection",
      )

      return {
        evaluationQueryId:
          required(
            selection,
            "evaluationQueryId",
          ),
        snapshotId:
          required(
            selection,
            "snapshotId",
          ),
      }
    },
  )

  if (
    new Set(
      result.map(
        (item) =>
          item.evaluationQueryId,
      ),
    ).size !== result.length
  ) {
    throw new TypeError(
      "snapshot selections contain duplicate queries",
    )
  }

  return result
}

/**
 * Validates and hydrates the shared evaluation run header.
 *
 * Stored counts, metric policy version, cutoffs, warnings, snapshot selections,
 * and payload provenance must all agree with the hydrated aggregate payload.
 */
function header(
  document: Document,
) {
  const id = required(
    document,
    "$id",
  )

  const datasetVersionId =
    required(
      document,
      "datasetVersionId",
    )

  const datasetFamilyKey =
    required(
      document,
      "datasetFamilyKey",
    )

  const datasetVersion =
    integer(
      document.datasetVersion,
      "datasetVersion",
      1,
    )

  const metricVersion =
    required(
      document,
      "metricVersion",
    )

  const status = required(
    document,
    "status",
  )

  if (
    status !== "completed"
  ) {
    throw new TypeError(
      "evaluation run status is invalid",
    )
  }

  const parsedCutoffs =
    cutoffs(
      json(
        document,
        "cutoffsJson",
      ),
    )

  if (
    !required(
      document,
      "payloadRevision",
    ) ||
    !required(
      document,
      "payloadManifestJson",
    )
  ) {
    throw new TypeError(
      "evaluation run payload provenance is required",
    )
  }

  const snapshotSelections =
    selections(
      document.snapshotSelections,
    )

  const parsedAggregate =
    aggregate(
      document.aggregate,
    )

  const warnings =
    document.warnings

  if (
    !Array.isArray(warnings) ||
    warnings.some(
      (item) =>
        typeof item !== "string",
    )
  ) {
    throw new TypeError(
      "warningsJson is malformed",
    )
  }

  const eligibleQueryCount =
    integer(
      document.eligibleQueryCount,
      "eligibleQueryCount",
    )

  const skippedQueryCount =
    integer(
      document.skippedQueryCount,
      "skippedQueryCount",
    )

  const selectedQueryCount =
    integer(
      document.selectedQueryCount,
      "selectedQueryCount",
    )

  if (
    selectedQueryCount !==
      snapshotSelections.length ||
    eligibleQueryCount !==
      parsedAggregate.eligibleQueryCount ||
    skippedQueryCount !==
      parsedAggregate.skippedQueryCount
  ) {
    throw new TypeError(
      "evaluation run counts are inconsistent",
    )
  }

  if (
    metricVersion !==
      parsedAggregate.metricVersion ||
    JSON.stringify(
      parsedCutoffs,
    ) !==
      JSON.stringify(
        parsedAggregate.byCutoff.map(
          (item) =>
            item.cutoff,
        ),
      ) ||
    JSON.stringify(
      warnings,
    ) !==
      JSON.stringify(
        parsedAggregate.warnings,
      )
  ) {
    throw new TypeError(
      "evaluation run policy, cutoffs, or warnings are inconsistent",
    )
  }

  return {
    id,
    datasetVersionId,
    datasetFamilyKey,
    datasetVersion,
    metricVersion,
    status:
      "completed" as const,
    cutoffs:
      parsedCutoffs,
    snapshotSelections,
    aggregate:
      parsedAggregate,
    warnings: [
      ...warnings,
    ] as string[],
    eligibleQueryCount,
    skippedQueryCount,
    selectedQueryCount,
    createdAt: date(
      document.createdAt,
      "createdAt",
    ),
    createdByUserId:
      required(
        document,
        "createdByUserId",
      ),
  }
}

/**
 * Transforms a hydrated evaluation run header into its list-summary shape.
 */
export function transformEvaluationRunSummary(
  document: Document,
): EvaluationRunSummary {
  const runHeader =
    header(document)

  return {
    id:
      runHeader.id,
    datasetVersionId:
      runHeader.datasetVersionId,
    datasetFamilyKey:
      runHeader.datasetFamilyKey,
    datasetVersion:
      runHeader.datasetVersion,
    metricVersion:
      runHeader.metricVersion,
    status:
      runHeader.status,
    cutoffs:
      runHeader.cutoffs,
    selectedQueryCount:
      runHeader.selectedQueryCount,
    eligibleQueryCount:
      runHeader.eligibleQueryCount,
    skippedQueryCount:
      runHeader.skippedQueryCount,

    aggregate: {
      mrr:
        runHeader.aggregate.mrr,
      byCutoff:
        runHeader.aggregate.byCutoff,
    },

    createdAt:
      runHeader.createdAt,
    createdByUserId:
      runHeader.createdByUserId,
  }
}

/**
 * Transforms a hydrated run header and its per-query documents into a complete
 * immutable evaluation run.
 *
 * Every query result is checked against the run identity, ownership, metric
 * version, selected snapshot, and cutoff policy before being accepted.
 */
export function transformEvaluationRun(
  document: Document,
  queryDocuments: Document[],
): EvaluationRun {
  const runHeader =
    header(document)

  const selectionMap =
    new Map(
      runHeader.snapshotSelections.map(
        (item) => [
          item.evaluationQueryId,
          item.snapshotId,
        ],
      ),
    )

  const perQuery =
    queryDocuments.map(
      (item) => {
        if (
          required(
            item,
            "runId",
          ) !== runHeader.id ||
          required(
            item,
            "datasetVersionId",
          ) !==
            runHeader.datasetVersionId
        ) {
          throw new TypeError(
            "evaluation run query is orphaned",
          )
        }

        if (
          required(
            item,
            "ownerUserId",
          ) !==
            runHeader.createdByUserId ||
          !required(
            item,
            "payloadRevision",
          ) ||
          !required(
            item,
            "payloadManifestJson",
          )
        ) {
          throw new TypeError(
            "evaluation run query payload provenance is inconsistent",
          )
        }

        const result =
          parsePerQueryResult(
            item.result,
          )

        if (
          result.datasetVersionId !==
            runHeader.datasetVersionId ||
          result.metricVersion !==
            runHeader.metricVersion ||
          selectionMap.get(
            result.evaluationQueryId,
          ) !== result.snapshotId ||
          required(
            item,
            "evaluationQueryId",
          ) !==
            result.evaluationQueryId ||
          required(
            item,
            "snapshotId",
          ) !==
            result.snapshotId ||
          JSON.stringify(
            result.metrics.map(
              (metric) =>
                metric.cutoff,
            ),
          ) !==
            JSON.stringify(
              runHeader.cutoffs,
            )
        ) {
          throw new TypeError(
            "evaluation run query provenance is inconsistent",
          )
        }

        return result
      },
    )

  if (
    perQuery.length !==
      runHeader.selectedQueryCount ||
    perQuery.length !==
      runHeader.aggregate.queryCount ||
    new Set(
      perQuery.map(
        (item) =>
          item.evaluationQueryId,
      ),
    ).size !== perQuery.length
  ) {
    throw new TypeError(
      "evaluation run query count is inconsistent",
    )
  }

  return {
    ...runHeader,
    perQuery,
  }
}