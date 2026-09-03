import {
  CATEGORY_THRESHOLDS,
  DETECTOR_DEFAULTS,
  DETECTOR_VERSION,
  HISTORICAL_DEVIATION_FULL_CONFIDENCE,
} from "./constants"

import { ConfidenceScorer } from "./ConfidenceScorer"
import { DescriptionBuilder } from "./DescriptionBuilder"
import { EvidenceBuilder } from "./EvidenceBuilder"
import { EventPersistence } from "./EventPersistence"
import { TimelineHistoricalBaselineProvider } from "./HistoricalBaselineProvider"
import { StructuredDetectorLogger } from "./logger"

import type {
  AlgorithmEventRepository,
  AlgorithmUpdateEvent,
  AlgorithmUpdateEventView,
  DetectionConfig,
  DetectionConfigOverride,
  DetectionMetrics,
  DetectorInput,
  DriftPoint,
  HistoricalBaseline,
  HistoricalBaselineProvider,
  IDetectorLogger,
  QueryMeta,
  ResolvedDetectionThresholds,
} from "./types"

/**
 * Normalizes category labels into the canonical detector lookup format.
 */
function normalizeCategory(
  category: string,
): string {
  return (
    category
      .trim()
      .toLowerCase()
      .replace(/_/g, " ")
      .replace(/\s+/g, " ") ||
    "unknown"
  )
}

/**
 * Detects category-level ranking drift by combining fixed thresholds with an
 * optional historical robust baseline.
 */
export class AlgorithmUpdateDetector {
  private readonly baseConfig:
    DetectionConfig

  constructor(
    configOverride:
      DetectionConfigOverride = {},
    private readonly logger: IDetectorLogger =
      new StructuredDetectorLogger(),
    private readonly repository: AlgorithmEventRepository =
      new EventPersistence(
        logger,
      ),
    private readonly baselineProvider: HistoricalBaselineProvider =
      new TimelineHistoricalBaselineProvider(),
  ) {
    this.baseConfig = {
      driftRateThreshold:
        configOverride.driftRateThreshold ??
        DETECTOR_DEFAULTS.DRIFT_RATE_THRESHOLD,

      perQueryDriftThreshold:
        configOverride.perQueryDriftThreshold ??
        DETECTOR_DEFAULTS.PER_QUERY_DRIFT_THRESHOLD,

      minQueriesInCategory:
        configOverride.minQueriesInCategory ??
        DETECTOR_DEFAULTS.MIN_QUERIES_IN_CATEGORY,

      correlationWindowMs:
        configOverride.correlationWindowMs ??
        DETECTOR_DEFAULTS.CORRELATION_WINDOW_MS,

      historicalWindowDays:
        configOverride.historicalWindowDays ??
        DETECTOR_DEFAULTS.HISTORICAL_WINDOW_DAYS,

      minBaselineSamples:
        configOverride.minBaselineSamples ??
        DETECTOR_DEFAULTS.MIN_BASELINE_SAMPLES,

      minBaselineQueries:
        configOverride.minBaselineQueries ??
        DETECTOR_DEFAULTS.MIN_BASELINE_QUERIES,

      minBaselineWindows:
        configOverride.minBaselineWindows ??
        DETECTOR_DEFAULTS.MIN_BASELINE_WINDOWS,

      minBaselineWindowQueries:
        configOverride.minBaselineWindowQueries ??
        DETECTOR_DEFAULTS.MIN_BASELINE_WINDOW_QUERIES,

      baselineDeviationThreshold:
        configOverride.baselineDeviationThreshold ??
        DETECTOR_DEFAULTS.BASELINE_DEVIATION_THRESHOLD,

      baselineAbsoluteEpsilon:
        configOverride.baselineAbsoluteEpsilon ??
        DETECTOR_DEFAULTS.BASELINE_ABSOLUTE_EPSILON,
    }
  }

  /**
   * Resolves detector configuration for a category.
   */
  private configFor(
    category: string,
  ): DetectionConfig {
    return {
      ...this.baseConfig,
      ...(
        CATEGORY_THRESHOLDS[
          normalizeCategory(
            category,
          )
        ] ?? {}
      ),
    }
  }

  /**
   * Detects correlated drift events across query categories.
   */
  async detect(
    results: DetectorInput,
    queryMeta: QueryMeta[],
    userId: string,
    windowEndMs = Date.now(),
  ): Promise<
    AlgorithmUpdateEvent[]
  > {
    if (
      !Array.isArray(results) ||
      results.length === 0
    ) {
      return []
    }

    const categoryByQueryId =
      new Map(
        queryMeta.map(
          (query) => [
            query.id,
            normalizeCategory(
              query.category,
            ),
          ],
        ),
      )

    const nameByQueryId =
      new Map(
        queryMeta.map(
          (query) => [
            query.id,
            query.name,
          ],
        ),
      )

    const byCategory =
      new Map<
        string,
        DetectorInput
      >()

    /*
     * Reduce each query to its latest valid observation inside the current
     * correlation window while preserving earlier historical timeline points.
     */
    for (const result of results) {
      const category =
        categoryByQueryId.get(
          result.queryId,
        ) ?? "unknown"

      const config =
        this.configFor(
          category,
        )

      const currentWindowStartMs =
        windowEndMs -
        config.correlationWindowMs

      const validTimeline =
        (
          result.driftTimeline ??
          []
        )
          .filter(
            (point) =>
              Number.isFinite(
                new Date(
                  point.timestamp,
                ).getTime(),
              ) &&
              Number.isFinite(
                point.driftScore,
              ),
          )
          .sort(
            (left, right) =>
              new Date(
                left.timestamp,
              ).getTime() -
              new Date(
                right.timestamp,
              ).getTime(),
          )

      const lastPoint =
        [...validTimeline]
          .reverse()
          .find((point) => {
            const timestamp =
              new Date(
                point.timestamp,
              ).getTime()

            return (
              timestamp >=
                currentWindowStartMs &&
              timestamp <=
                windowEndMs
            )
          })

      if (!lastPoint) {
        continue
      }

      const categoryResults =
        byCategory.get(
          category,
        ) ?? []

      const normalizedResult = {
        ...result,
        latestDrift:
          lastPoint.driftScore,
        driftTimeline: [
          ...validTimeline.filter(
            (point) =>
              new Date(
                point.timestamp,
              ).getTime() <
              currentWindowStartMs,
          ),
          lastPoint,
        ],
      }

      const existingIndex =
        categoryResults.findIndex(
          (item) =>
            item.queryId ===
            result.queryId,
        )

      if (existingIndex < 0) {
        categoryResults.push(
          normalizedResult,
        )
      } else {
        const existingTimestamp =
          new Date(
            categoryResults[
              existingIndex
            ].driftTimeline.at(-1)
              ?.timestamp ?? 0,
          ).getTime()

        if (
          new Date(
            lastPoint.timestamp,
          ).getTime() >
          existingTimestamp
        ) {
          categoryResults[
            existingIndex
          ] = normalizedResult
        }
      }

      byCategory.set(
        category,
        categoryResults,
      )
    }

    const events:
      AlgorithmUpdateEvent[] = []

    for (
      const [
        category,
        categoryResults,
      ] of byCategory
    ) {
      const config =
        this.configFor(
          category,
        )

      if (
        categoryResults.length <
        config.minQueriesInCategory
      ) {
        continue
      }

      const drifted =
        categoryResults.filter(
          (result) =>
            Number.isFinite(
              result.latestDrift,
            ) &&
            result.latestDrift >=
              config.perQueryDriftThreshold,
        )

      const driftRate =
        drifted.length /
        categoryResults.length

      if (
        driftRate <
          config.driftRateThreshold ||
        drifted.length === 0
      ) {
        continue
      }

      const affectedAverageDrift =
        drifted.reduce(
          (sum, result) =>
            sum +
            result.latestDrift,
          0,
        ) / drifted.length

      const currentObservedAverageDrift =
        categoryResults.reduce(
          (sum, result) =>
            sum +
            result.latestDrift,
          0,
        ) /
        categoryResults.length

      const windowStartMs =
        windowEndMs -
        config.correlationWindowMs

      let baseline:
        HistoricalBaseline = {
        mean: 0,
        standardDeviation: 0,
        sampleCount: 0,
        historicalObservationCount: 0,
        historicalQueryCount: 0,
        windowCount: 0,
        median: 0,
        medianAbsoluteDeviation: 0,
        robustSigma: 0,
        windowAverages: [],
        available: false,
        availabilityReason:
          "Historical baseline was not evaluated.",
        availabilityReasonCode:
          "provider_failure",
      }

      try {
        baseline =
          await this.baselineProvider.getBaseline(
            categoryResults,
            windowStartMs,
            windowEndMs,
            config.historicalWindowDays,
            config.minBaselineSamples,
            config.minBaselineQueries,
            config.minBaselineWindows,
            config.minBaselineWindowQueries,
            config.correlationWindowMs,
          )
      } catch (error) {
        baseline = {
          ...baseline,
          availabilityReason:
            "Historical baseline calculation failed; fixed thresholds were used.",
          availabilityReasonCode:
            "provider_failure",
        }

        this.logger.warn(
          category,
          "Historical baseline unavailable",
          {
            error:
              error instanceof Error
                ? error.message
                : String(error),
          },
        )
      }

      /*
       * Historical deviation uses a robust z-score:
       *
       *   (current average - historical median) / robust sigma
       *
       * When robust sigma is zero, the ratio is undefined and the configured
       * absolute epsilon becomes the historical noise floor instead.
       */
      const historicalDeviation =
        baseline.available &&
        baseline.robustSigma > 0
          ? (
              currentObservedAverageDrift -
              baseline.median
            ) /
            baseline.robustSigma
          : null

      const baselinePassed =
        !baseline.available ||
        (
          baseline.robustSigma ===
          0
            ? currentObservedAverageDrift >=
              baseline.median +
                config.baselineAbsoluteEpsilon
            : (
                historicalDeviation ??
                Number.NEGATIVE_INFINITY
              ) >=
              config.baselineDeviationThreshold
        )

      if (!baselinePassed) {
        continue
      }

      const thresholds:
        ResolvedDetectionThresholds = {
        ...config,
      }

      const evidence =
        EvidenceBuilder.build({
          observedResults:
            categoryResults,
          affectedResults:
            drifted,
          queryMeta,
          thresholds,
          baseline,
          historicalDeviation,
          baselinePassed,
          windowStartMs,
          windowEndMs,
        })

      /*
       * Convert historical deviation into a bounded confidence signal.
       * A zero-sigma baseline contributes a binary signal because there is no
       * meaningful robust z-score in that case.
       */
      const historicalSignal =
        baseline.available
          ? baseline.robustSigma ===
            0
            ? baselinePassed
              ? 1
              : 0
            : Math.max(
                0,
                Math.min(
                  1,
                  (
                    historicalDeviation ??
                    0
                  ) /
                    HISTORICAL_DEVIATION_FULL_CONFIDENCE,
                ),
              )
          : null

      const confidence =
        ConfidenceScorer.score({
          driftRate,

          avgDriftScore:
            currentObservedAverageDrift,

          affectedQueryCount:
            drifted.length,

          observedQueryCount:
            categoryResults.length,

          historicalDeviation,
          historicalSignal,

          baselineSampleCount:
            baseline.sampleCount,

          temporalConcentration:
            evidence.temporalConcentration,
        })

      const metrics:
        DetectionMetrics = {
        totalQueriesInCategory:
          categoryResults.length,

        affectedQueryCount:
          drifted.length,

        driftRate,

        avgDriftScore:
          affectedAverageDrift,

        affectedAverageDrift,

        currentObservedAverageDrift,

        historicalAvgDrift:
          baseline.mean,

        historicalStdDev:
          baseline.standardDeviation,

        historicalSampleCount:
          baseline.sampleCount,

        historicalObservationCount:
          baseline.historicalObservationCount,

        historicalQueryCount:
          baseline.historicalQueryCount,

        historicalWindowCount:
          baseline.windowCount,

        historicalBaselineAvailable:
          baseline.available,

        historicalDeviation,

        windowStartMs,
        windowEndMs,
      }

      const affectedQueries:
        DriftPoint[] =
        drifted.map(
          (result) => ({
            queryId:
              result.queryId,

            queryName:
              nameByQueryId.get(
                result.queryId,
              ) ??
              result.queryName ??
              result.queryId,

            driftScore:
              result.latestDrift,

            timestamp:
              new Date(
                result.driftTimeline.at(
                  -1,
                )?.timestamp ??
                  windowEndMs,
              ),
          }),
        )

      events.push({
        id:
          EventPersistence.buildEventId(
            category,
            windowStartMs,
            config.correlationWindowMs,
          ),

        detectedAt:
          new Date(
            windowEndMs,
          ),

        category,

        affectedQueries,

        confidence,

        metrics,

        severity:
          confidence.severity,

        detectorVersion:
          DETECTOR_VERSION,

        schemaVersion: 2,

        createdAt:
          new Date(
            windowEndMs,
          ),

        detectionMode:
          baseline.available
            ? "baseline-aware"
            : "fixed-threshold",

        thresholds,

        evidence,
      })
    }

    this.logger.info(
      "system",
      "Algorithm detection complete",
      {
        events:
          events.length,
      },
    )

    return events
  }

  /**
   * Persists detected events independently and fails if any write is rejected.
   */
  async persistEvents(
    userId: string,
    events: AlgorithmUpdateEvent[],
  ): Promise<void> {
    const results =
      await Promise.allSettled(
        events.map(
          (event) =>
            this.repository.upsert(
              userId,
              event,
            ),
        ),
      )

    const failures =
      results.filter(
        (result) =>
          result.status ===
          "rejected",
      )

    if (
      failures.length > 0
    ) {
      throw new Error(
        `Failed to persist ${failures.length} of ${events.length} algorithm events`,
      )
    }
  }

  /**
   * Returns recent detector events in the API-facing view shape.
   */
  async getRecentEvents(
    userId: string,
    limit = 10,
  ): Promise<
    AlgorithmUpdateEventView[]
  > {
    const events =
      await this.repository.getRecent(
        userId,
        limit,
      )

    return events.map(
      (event) => {
        /*
         * Persisted detector descriptions retain richer detection-time context.
         * Prefer them to rebuilding from legacy fallback metrics.
         */
        const detail =
          event.storedDescription ??
          DescriptionBuilder.detail(
            event,
          )

        return {
          ...event,

          summary:
            DescriptionBuilder.summary(
              event,
            ),

          detail,

          description:
            detail,

          driftRate:
            event.metrics.driftRate,

          avgDriftScore:
            event.metrics.avgDriftScore,
        }
      },
    )
  }

  /**
   * Convenience wrapper using the default detector dependencies.
   */
  static async getRecentEvents(
    userId: string,
    limit = 10,
  ): Promise<
    AlgorithmUpdateEventView[]
  > {
    return new AlgorithmUpdateDetector().getRecentEvents(
      userId,
      limit,
    )
  }
}

export const algorithmUpdateDetector =
  new AlgorithmUpdateDetector()