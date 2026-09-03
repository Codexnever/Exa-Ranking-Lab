import type {
  DetectionReason,
  HistoricalBaseline,
  QueryMeta,
  RankingChangeEvidence,
  RankingMovementEvidence,
  ResolvedDetectionThresholds,
} from "./types"

import type {
  DriftAnalysisResult,
  DriftTimelinePoint,
} from "@/types/type"

import { CHANGE_TYPE_DEFAULTS } from "./constants"

interface EvidenceInput {
  observedResults: DriftAnalysisResult[]
  affectedResults: DriftAnalysisResult[]
  queryMeta: QueryMeta[]
  thresholds: ResolvedDetectionThresholds
  baseline: HistoricalBaseline
  historicalDeviation: number | null
  baselinePassed: boolean
  windowStartMs: number
  windowEndMs: number
}

/**
 * Returns the latest recorded drift point for a query result.
 */
function latestPoint(
  result: DriftAnalysisResult,
): DriftTimelinePoint | undefined {
  return result.driftTimeline.at(-1)
}

/**
 * Extracts a normalized hostname from a URL.
 */
function domainFromUrl(
  url: string,
): string | null {
  try {
    return new URL(url)
      .hostname
      .toLowerCase()
      .replace(/^www\./, "")
  } catch {
    return null
  }
}

/**
 * Calculates the arithmetic mean of a non-empty numeric collection.
 */
function average(
  values: number[],
): number | null {
  return values.length > 0
    ? values.reduce(
        (sum, value) =>
          sum + value,
        0,
      ) / values.length
    : null
}

/**
 * Classifies the dominant observed drift component.
 *
 * This is a project-specific diagnostic heuristic rather than causal
 * attribution. It compares reranking drift against the stronger of content
 * and competitor/index drift using the configured dominance ratio.
 */
function classifyChange(
  points: NonNullable<
    DriftTimelinePoint["decomposedDrift"]
  >[],
): RankingChangeEvidence["changeType"] {
  if (
    points.length <
    CHANGE_TYPE_DEFAULTS.MIN_DECOMPOSED_POINTS
  ) {
    return "unknown"
  }

  const contentOrIndex =
    average(
      points.map(
        (point) =>
          Math.max(
            point.contentDrift,
            point.competitorDrift,
          ),
      ),
    ) ?? 0

  const ranking =
    average(
      points.map(
        (point) =>
          point.rerankDrift,
      ),
    ) ?? 0

  if (
    contentOrIndex <= 0 &&
    ranking <= 0
  ) {
    return "unknown"
  }

  if (
    ranking >=
    contentOrIndex *
      CHANGE_TYPE_DEFAULTS.DOMINANCE_RATIO
  ) {
    return "ranking"
  }

  if (
    contentOrIndex >=
    ranking *
      CHANGE_TYPE_DEFAULTS.DOMINANCE_RATIO
  ) {
    return "content_or_index"
  }

  return "mixed"
}

/**
 * Builds structured evidence explaining why an algorithm-update event passed
 * detector thresholds and what changed across the affected queries.
 */
export class EvidenceBuilder {
  static build(
    input: EvidenceInput,
  ): RankingChangeEvidence {
    const {
      observedResults,
      affectedResults,
      queryMeta,
      thresholds,
      baseline,
      historicalDeviation,
      baselinePassed,
      windowStartMs,
      windowEndMs,
    } = input

    const nameByQueryId =
      new Map(
        queryMeta.map(
          (query) => [
            query.id,
            query.name,
          ],
        ),
      )

    const affectedPoints =
      affectedResults
        .map(
          (result) => ({
            result,
            point:
              latestPoint(result),
          }),
        )
        .filter(
          (
            item,
          ): item is {
            result: DriftAnalysisResult
            point: DriftTimelinePoint
          } => Boolean(item.point),
        )

    const movements:
      RankingMovementEvidence[] =
      affectedPoints.flatMap(
        ({
          result,
          point,
        }) =>
          point.rankChanges.map(
            (change) => ({
              queryId:
                result.queryId,

              queryName:
                nameByQueryId.get(
                  result.queryId,
                ) ??
                result.queryName ??
                result.queryId,

              url:
                change.url,

              title:
                change.title,

              previousPosition:
                change.previousPosition,

              currentPosition:
                change.currentPosition,

              positionDelta:
                change.positionDelta,
            }),
          ),
      )

    const absoluteMovements =
      movements.map(
        (movement) =>
          Math.abs(
            movement.positionDelta,
          ),
      )

    const newResultCount =
      affectedPoints.reduce(
        (
          sum,
          { point },
        ) =>
          sum +
          point.newResults,
        0,
      )

    const droppedResultCount =
      affectedPoints.reduce(
        (
          sum,
          { point },
        ) =>
          sum +
          point.droppedResults,
        0,
      )

    const decomposed =
      affectedPoints
        .map(
          ({ point }) =>
            point.decomposedDrift,
        )
        .filter(
          (
            value,
          ): value is NonNullable<
            DriftTimelinePoint["decomposedDrift"]
          > => Boolean(value),
        )

    const gainedDomains =
      new Set<string>()

    const lostDomains =
      new Set<string>()

    for (
      const point of decomposed
    ) {
      for (
        const url of
        point.breakdown.newCompetitorUrls
      ) {
        const domain =
          domainFromUrl(url)

        if (domain) {
          gainedDomains.add(
            domain,
          )
        }
      }

      for (
        const url of
        point.breakdown.droppedUrls
      ) {
        const domain =
          domainFromUrl(url)

        if (domain) {
          lostDomains.add(
            domain,
          )
        }
      }
    }

    const timestamps =
      affectedPoints
        .map(
          ({ point }) =>
            new Date(
              point.timestamp,
            ).getTime(),
        )
        .filter(
          Number.isFinite,
        )

    const timestampSpan =
      timestamps.length > 1
        ? Math.max(
            ...timestamps,
          ) -
          Math.min(
            ...timestamps,
          )
        : 0

    /*
     * Temporal concentration approaches 1 when affected observations occur
     * close together and approaches 0 as they span the full correlation window.
     */
    const temporalConcentration =
      Math.max(
        0,
        Math.min(
          1,
          1 -
            timestampSpan /
              thresholds.correlationWindowMs,
        ),
      )

    const affectedQueryCount =
      affectedResults.length

    const observedQueryCount =
      observedResults.length

    const driftRate =
      observedQueryCount > 0
        ? affectedQueryCount /
          observedQueryCount
        : 0

    const affectedAverageDrift =
      affectedQueryCount > 0
        ? affectedResults.reduce(
            (sum, result) =>
              sum +
              result.latestDrift,
            0,
          ) /
          affectedQueryCount
        : 0

    const currentObservedAverageDrift =
      observedQueryCount > 0
        ? observedResults.reduce(
            (sum, result) =>
              sum +
              result.latestDrift,
            0,
          ) /
          observedQueryCount
        : 0

    const detectionReasons:
      DetectionReason[] = [
      {
        code:
          "observation_coverage",

        passed:
          observedQueryCount >=
          thresholds.minQueriesInCategory,

        message:
          `${observedQueryCount} current queries had valid in-window observations; ` +
          `${thresholds.minQueriesInCategory} are required.`,
      },

      {
        code:
          "coordination",

        passed:
          observedQueryCount >=
            thresholds.minQueriesInCategory &&
          driftRate >=
            thresholds.driftRateThreshold,

        message:
          `${affectedQueryCount} of ${observedQueryCount} observed queries drifted ` +
          `(${Math.round(driftRate * 100)}%; threshold ` +
          `${Math.round(thresholds.driftRateThreshold * 100)}%).`,
      },

      {
        code:
          "drift_magnitude",

        passed:
          affectedResults.every(
            (result) =>
              result.latestDrift >=
              thresholds.perQueryDriftThreshold,
          ),

        message:
          `Affected queries met the configured drift-score threshold of ` +
          `${thresholds.perQueryDriftThreshold}.`,
      },

      {
        code:
          "correlation_window",

        passed:
          timestamps.every(
            (timestamp) =>
              timestamp >=
                windowStartMs &&
              timestamp <=
                windowEndMs,
          ),

        message:
          `Affected observations occurred inside the ` +
          `${thresholds.correlationWindowMs / 3_600_000}-hour correlation window.`,
      },

      baseline.available
        ? {
            code:
              "historical_baseline",

            passed:
              baselinePassed,

            message:
              baseline.robustSigma ===
              0
                ? `Observed-query average drift ${currentObservedAverageDrift.toFixed(1)} ` +
                  `was compared with median ${baseline.median.toFixed(1)} plus the ` +
                  `${thresholds.baselineAbsoluteEpsilon}-point engineering noise floor.`
                : `Current drift was ${historicalDeviation?.toFixed(2) ?? "—"} ` +
                  `robust deviations above the historical median; threshold ` +
                  `${thresholds.baselineDeviationThreshold}.`,
          }
        : {
            code:
              "baseline_fallback",

            passed:
              true,

            message:
              `Unverified fixed thresholds were used. ${baseline.availabilityReason}`,
          },
    ]

    return {
      affectedQueryCount,

      observedQueryCount,

      driftRate,

      configuredDriftRateThreshold:
        thresholds.driftRateThreshold,

      averageDriftScore:
        affectedAverageDrift,

      affectedAverageDrift,

      currentObservedAverageDrift,

      correlationWindowMs:
        thresholds.correlationWindowMs,

      correlationWindowHours:
        thresholds.correlationWindowMs /
        3_600_000,

      temporalConcentration,

      averageAbsoluteRankMovement:
        average(
          absoluteMovements,
        ),

      newResultCount,

      droppedResultCount,

      urlTurnoverCount:
        newResultCount +
        droppedResultCount,

      averageContentDrift:
        average(
          decomposed.map(
            (point) =>
              point.contentDrift,
          ),
        ),

      averageCompetitorDrift:
        average(
          decomposed.map(
            (point) =>
              point.competitorDrift,
          ),
        ),

      averageRerankDrift:
        average(
          decomposed.map(
            (point) =>
              point.rerankDrift,
          ),
        ),

      domainsGained: [
        ...gainedDomains,
      ].sort(),

      domainsLost: [
        ...lostDomains,
      ].sort(),

      rankingWinners:
        movements
          .filter(
            (movement) =>
              movement.positionDelta >
              0,
          )
          .sort(
            (a, b) =>
              b.positionDelta -
              a.positionDelta,
          )
          .slice(
            0,
            5,
          ),

      rankingLosers:
        movements
          .filter(
            (movement) =>
              movement.positionDelta <
              0,
          )
          .sort(
            (a, b) =>
              a.positionDelta -
              b.positionDelta,
          )
          .slice(
            0,
            5,
          ),

      historicalBaselineUsed:
        baseline.available,

      baselineMean:
        baseline.mean,

      baselineStandardDeviation:
        baseline.standardDeviation,

      baselineSampleCount:
        baseline.sampleCount,

      historicalObservationCount:
        baseline.historicalObservationCount,

      historicalQueryCount:
        baseline.historicalQueryCount,

      historicalWindowCount:
        baseline.windowCount,

      baselineMedian:
        baseline.median,

      baselineMedianAbsoluteDeviation:
        baseline.medianAbsoluteDeviation,

      robustSigma:
        baseline.robustSigma,

      historicalComparisonMethod:
        !baseline.available
          ? "unavailable"
          : baseline.robustSigma >
              0
            ? "robust-mad"
            : "absolute-epsilon",

      baselineAvailabilityReason:
        baseline.availabilityReason,

      baselineAvailabilityReasonCode:
        baseline.availabilityReasonCode,

      amountAboveBaseline:
        currentObservedAverageDrift -
        baseline.mean,

      baselineAbsoluteEpsilon:
        thresholds.baselineAbsoluteEpsilon,

      historicalDeviation,

      changeType:
        classifyChange(
          decomposed,
        ),

      detectionReasons,
    }
  }
}