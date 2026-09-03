import { createHash } from "crypto"

import type {
  StrategyBenchmarkResult,
  StrategyComparison,
  StrategyErrorSummary,
  StrategyLatencySummary,
  StrategyLatencyType,
  StrategyQueryResult,
  StrategyStageSummary,
  StrategyWinLoss,
} from "@/types/evaluation-strategy"

import { STRATEGY_BENCHMARK_POLICY as POLICY } from "./strategy-benchmark-policy"

/**
 * Recursively normalizes strategy configuration values into a deterministic
 * representation suitable for configuration hashing.
 *
 * Object keys are sorted and undefined fields are omitted. Array order is
 * preserved because it may carry configuration semantics.
 */
function normalize(
  value: unknown,
): unknown {
  if (Array.isArray(value)) {
    return value.map(normalize)
  }

  if (
    value &&
    typeof value === "object"
  ) {
    const record =
      value as Record<
        string,
        unknown
      >

    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .filter(
          (key) =>
            record[key] !== undefined,
        )
        .map(
          (key) => [
            key,
            normalize(record[key]),
          ],
        ),
    )
  }

  if (
    typeof value === "number" &&
    !Number.isFinite(value)
  ) {
    throw new TypeError(
      "Strategy configuration contains a non-finite number",
    )
  }

  return value
}

/**
 * Produces the canonical representation used to identify a strategy
 * configuration.
 */
export function canonicalStrategyConfiguration(
  input: {
    type: string
    provider?: string | null
    model?: string | null
    latencyType: string
    configuration?: Record<
      string,
      unknown
    >
  },
) {
  return normalize({
    type: input.type,
    provider:
      input.provider ?? null,
    model:
      input.model ?? null,
    latencyType:
      input.latencyType,
    configuration:
      input.configuration ?? {},
  })
}

/**
 * Creates a deterministic SHA-256 identifier for a strategy configuration.
 */
export function strategyConfigHash(
  input: Parameters<
    typeof canonicalStrategyConfiguration
  >[0],
) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        canonicalStrategyConfiguration(
          input,
        ),
      ),
    )
    .digest("hex")
}

/**
 * Summarizes available strategy latency observations.
 *
 * Null values are ignored. P95 uses the nearest-rank definition already used
 * by the benchmark policy.
 */
export function latencySummary(
  values: Array<number | null>,
  latencyType: StrategyLatencyType,
): StrategyLatencySummary {
  const sorted = values
    .filter(
      (
        value,
      ): value is number =>
        value !== null,
    )
    .sort(
      (a, b) => a - b,
    )

  if (!sorted.length) {
    return {
      available: false,
      latencyType,
      count: 0,
      mean: null,
      median: null,
      p95: null,
      min: null,
      max: null,
    }
  }

  const middle = Math.floor(
    sorted.length / 2,
  )

  const median =
    sorted.length % 2
      ? sorted[middle]
      : (
          sorted[middle - 1] +
          sorted[middle]
        ) / 2

  const p95 =
    sorted[
      Math.max(
        0,
        Math.ceil(
          sorted.length * 0.95,
        ) - 1,
      )
    ]

  return {
    available: true,
    latencyType,
    count: sorted.length,

    mean:
      sorted.reduce(
        (sum, value) =>
          sum + value,
        0,
      ) / sorted.length,

    median,
    p95,
    min: sorted[0],
    max: sorted.at(-1)!,
  }
}

/**
 * Reads a cutoff metric value from a strategy query result.
 */
const cutoffValue = (
  query: StrategyQueryResult,
  cutoff: number,
  key:
    | "ndcg"
    | "benchmarkRecall",
) =>
  query.metrics.metrics.find(
    (item) =>
      item.cutoff === cutoff,
  )?.[key].value ?? null

/**
 * Selects the primary comparable metric for two executions of the same query.
 *
 * Preference order:
 * 1. nDCG@10
 * 2. Highest shared available nDCG cutoff
 * 3. Reciprocal Rank
 * 4. Highest available benchmark-recall cutoff
 */
function primary(
  beforeQuery: StrategyQueryResult,
  afterQuery: StrategyQueryResult,
) {
  const sharedCutoffs = [
    ...new Set(
      beforeQuery.metrics.metrics
        .map(
          (metric) =>
            metric.cutoff,
        )
        .filter(
          (cutoff) =>
            afterQuery.metrics.metrics.some(
              (metric) =>
                metric.cutoff ===
                cutoff,
            ),
        ),
    ),
  ].sort(
    (a, b) =>
      b - a,
  )

  for (
    const cutoff of [
      10,
      ...sharedCutoffs,
    ]
  ) {
    const before = cutoffValue(
      beforeQuery,
      cutoff,
      "ndcg",
    )

    const after = cutoffValue(
      afterQuery,
      cutoff,
      "ndcg",
    )

    if (
      before !== null &&
      after !== null
    ) {
      return {
        metric:
          `nDCG@${cutoff}`,
        before,
        after,
      }
    }
  }

  if (
    Number.isFinite(
      beforeQuery.metrics
        .reciprocalRank,
    ) &&
    Number.isFinite(
      afterQuery.metrics
        .reciprocalRank,
    )
  ) {
    return {
      metric: "RR",
      before:
        beforeQuery.metrics
          .reciprocalRank,
      after:
        afterQuery.metrics
          .reciprocalRank,
    }
  }

  for (
    const cutoff of [
      ...beforeQuery.metrics.metrics.map(
        (metric) =>
          metric.cutoff,
      ),
    ].sort(
      (a, b) =>
        b - a,
    )
  ) {
    const before = cutoffValue(
      beforeQuery,
      cutoff,
      "benchmarkRecall",
    )

    const after = cutoffValue(
      afterQuery,
      cutoff,
      "benchmarkRecall",
    )

    if (
      before !== null &&
      after !== null
    ) {
      return {
        metric:
          `Benchmark Recall@${cutoff}`,
        before,
        after,
      }
    }
  }

  return {
    metric: "Unavailable",
    before: null,
    after: null,
  }
}

/**
 * Compares two completed strategy benchmark results query by query.
 *
 * Delta direction is strategy B minus strategy A, so a positive delta is a
 * win for strategy B and a negative delta is a loss.
 */
export function compareStrategies(
  strategyA: StrategyBenchmarkResult,
  strategyB: StrategyBenchmarkResult,
): StrategyComparison {
  const strategyBByQuery =
    new Map(
      strategyB.queries.map(
        (query) => [
          query.evaluationQueryId,
          query,
        ],
      ),
    )

  const queryOutcomes:
    StrategyWinLoss[] =
    strategyA.queries.map(
      (query) => {
        const other =
          strategyBByQuery.get(
            query.evaluationQueryId,
          )

        if (!other) {
          return {
            evaluationQueryId:
              query.evaluationQueryId,
            queryText:
              query.queryText,
            metric:
              "Unavailable",
            before: null,
            after: null,
            delta: null,
            outcome:
              "unavailable",
          }
        }

        const value =
          primary(
            query,
            other,
          )

        const delta =
          value.before === null ||
          value.after === null
            ? null
            : value.after -
              value.before

        const outcome =
          delta === null
            ? (
                "unavailable" as const
              )
            : Math.abs(delta) <
                POLICY.tieEpsilon
              ? (
                  "tie" as const
                )
              : delta > 0
                ? (
                    "win" as const
                  )
                : (
                    "loss" as const
                  )

        return {
          evaluationQueryId:
            query.evaluationQueryId,
          queryText:
            query.queryText,
          ...value,
          delta,
          outcome,
        }
      },
    )

  const wins =
    queryOutcomes.filter(
      (item) =>
        item.outcome === "win",
    ).length

  const losses =
    queryOutcomes.filter(
      (item) =>
        item.outcome === "loss",
    ).length

  const ties =
    queryOutcomes.filter(
      (item) =>
        item.outcome === "tie",
    ).length

  const unavailable =
    queryOutcomes.filter(
      (item) =>
        item.outcome ===
        "unavailable",
    ).length

  const comparable =
    wins + losses + ties

  const metricDeltas =
    queryOutcomes.flatMap(
      (item) =>
        item.delta === null
          ? []
          : [item.delta],
    )

  const warnings: string[] = []

  if (
    strategyA.latency
      .latencyType !==
    strategyB.latency
      .latencyType
  ) {
    warnings.push(
      `Latency types differ (${strategyA.latency.latencyType} vs ${strategyB.latency.latencyType}); latency delta is unavailable.`,
    )
  }

  if (
    !strategyA.stage.available ||
    !strategyB.stage.available
  ) {
    warnings.push(
      "Stage diagnosis comparison is unavailable because one or both strategies lack compatible traces.",
    )
  }

  return {
    strategyAId:
      strategyA.strategy.id,

    strategyBId:
      strategyB.strategy.id,

    primaryMetric:
      "nDCG@10 with documented fallback",

    wins,
    losses,
    ties,
    unavailable,

    comparableQueries:
      comparable,

    winRate:
      comparable
        ? wins / comparable
        : null,

    lossRate:
      comparable
        ? losses / comparable
        : null,

    metricDelta:
      metricDeltas.length
        ? metricDeltas.reduce(
            (sum, value) =>
              sum + value,
            0,
          ) /
          metricDeltas.length
        : null,

    latencyDeltaMs:
      strategyA.latency
        .latencyType ===
        strategyB.latency
          .latencyType &&
      strategyA.latency.mean !==
        null &&
      strategyB.latency.mean !==
        null
        ? strategyB.latency.mean -
          strategyA.latency.mean
        : null,

    hardNegativeDelta:
      strategyB.errors
        .hardNegativeCandidateCount -
      strategyA.errors
        .hardNegativeCandidateCount,

    queryOutcomes,

    largestWins:
      queryOutcomes
        .filter(
          (item) =>
            item.outcome === "win",
        )
        .sort(
          (a, b) =>
            b.delta! -
            a.delta!,
        )
        .slice(0, 10),

    largestLosses:
      queryOutcomes
        .filter(
          (item) =>
            item.outcome ===
            "loss",
        )
        .sort(
          (a, b) =>
            a.delta! -
            b.delta!,
        )
        .slice(0, 10),

    warnings,
  }
}

/**
 * Aggregates hard-negative error evidence across benchmark queries.
 */
export function errorSummary(
  queries: StrategyQueryResult[],
): StrategyErrorSummary {
  const candidates =
    queries.reduce(
      (sum, query) =>
        sum +
        query.hardNegativeCount,
      0,
    )

  const highCritical =
    queries.reduce(
      (sum, query) =>
        sum +
        query.highCriticalHardNegativeCount,
      0,
    )

  const highCriticalQueries =
    queries.filter(
      (query) =>
        query.highCriticalHardNegativeCount >
        0,
    ).length

  return {
    hardNegativeCandidateCount:
      candidates,

    highCriticalCount:
      highCritical,

    top5Grade0Count:
      queries.reduce(
        (sum, query) =>
          sum +
          query.top5Grade0Count,
        0,
      ),

    outranksGrade2Count:
      queries.reduce(
        (sum, query) =>
          sum +
          query.grade0OutranksGrade2Count,
        0,
      ),

    queriesWithHighCritical:
      highCriticalQueries,

    candidateRatePerQuery:
      queries.length
        ? candidates /
          queries.length
        : 0,

    highCriticalQueryRate:
      queries.length
        ? highCriticalQueries /
          queries.length
        : 0,
  }
}

/**
 * Aggregates stage-diagnosis evidence across all query executions belonging to
 * one strategy.
 *
 * Metric means use only available stage summaries. The aggregate itself is
 * marked available only when every query has compatible stage evidence.
 */
export function aggregateStage(
  values: StrategyStageSummary[],
): StrategyStageSummary {
  const available =
    values.filter(
      (value) =>
        value.available,
    )

  const mean = (
    selector: (
      value: StrategyStageSummary,
    ) => number | null,
  ) => {
    const list =
      available.flatMap(
        (value) => {
          const item =
            selector(value)

          return item === null
            ? []
            : [item]
        },
      )

    return list.length
      ? list.reduce(
          (sum, value) =>
            sum + value,
          0,
        ) / list.length
      : null
  }

  return {
    available:
      available.length ===
        values.length &&
      values.length > 0,

    candidateBenchmarkRecall:
      mean(
        (value) =>
          value.candidateBenchmarkRecall,
      ),

    finalBenchmarkRecall:
      mean(
        (value) =>
          value.finalBenchmarkRecall,
      ),

    candidateToFinalRetention:
      mean(
        (value) =>
          value.candidateToFinalRetention,
      ),

    grade2Survival:
      mean(
        (value) =>
          value.grade2Survival,
      ),

    downstreamRelevantLoss:
      mean(
        (value) =>
          value.downstreamRelevantLoss,
      ),

    irrelevantDownstreamPromotions:
      available.reduce(
        (sum, value) =>
          sum +
          value.irrelevantDownstreamPromotions,
        0,
      ),

    warning:
      available.length ===
      values.length
        ? null
        : "Stage comparison is unavailable for one or more query executions.",
  }
}