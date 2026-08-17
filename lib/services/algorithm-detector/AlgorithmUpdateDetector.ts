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
  HistoricalBaselineProvider,
  IDetectorLogger,
  QueryMeta,
  ResolvedDetectionThresholds,
} from "./types"

function normalizeCategory(category: string): string {
  return category.trim().toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ") || "unknown"
}

export class AlgorithmUpdateDetector {
  private readonly baseConfig: DetectionConfig

  constructor(
    configOverride: DetectionConfigOverride = {},
    private readonly logger: IDetectorLogger = new StructuredDetectorLogger(),
    private readonly repository: AlgorithmEventRepository = new EventPersistence(logger),
    private readonly baselineProvider: HistoricalBaselineProvider = new TimelineHistoricalBaselineProvider()
  ) {
    this.baseConfig = {
      driftRateThreshold: configOverride.driftRateThreshold ?? DETECTOR_DEFAULTS.DRIFT_RATE_THRESHOLD,
      perQueryDriftThreshold: configOverride.perQueryDriftThreshold ?? DETECTOR_DEFAULTS.PER_QUERY_DRIFT_THRESHOLD,
      minQueriesInCategory: configOverride.minQueriesInCategory ?? DETECTOR_DEFAULTS.MIN_QUERIES_IN_CATEGORY,
      correlationWindowMs: configOverride.correlationWindowMs ?? DETECTOR_DEFAULTS.CORRELATION_WINDOW_MS,
      historicalWindowDays: configOverride.historicalWindowDays ?? DETECTOR_DEFAULTS.HISTORICAL_WINDOW_DAYS,
      minBaselineSamples: configOverride.minBaselineSamples ?? DETECTOR_DEFAULTS.MIN_BASELINE_SAMPLES,
      minBaselineQueries: configOverride.minBaselineQueries ?? DETECTOR_DEFAULTS.MIN_BASELINE_QUERIES,
      baselineDeviationThreshold: configOverride.baselineDeviationThreshold ?? DETECTOR_DEFAULTS.BASELINE_DEVIATION_THRESHOLD,
      baselineAbsoluteEpsilon: configOverride.baselineAbsoluteEpsilon ?? DETECTOR_DEFAULTS.BASELINE_ABSOLUTE_EPSILON,
    }
  }

  private configFor(category: string): DetectionConfig {
    return { ...this.baseConfig, ...(CATEGORY_THRESHOLDS[normalizeCategory(category)] ?? {}) }
  }

  async detect(
    results: DetectorInput,
    queryMeta: QueryMeta[],
    userId: string,
    windowEndMs = Date.now()
  ): Promise<AlgorithmUpdateEvent[]> {
    if (!Array.isArray(results) || results.length === 0) return []
    const categoryByQueryId = new Map(queryMeta.map(query => [query.id, normalizeCategory(query.category)]))
    const nameByQueryId = new Map(queryMeta.map(query => [query.id, query.name]))
    const byCategory = new Map<string, DetectorInput>()

    for (const result of results) {
      const category = categoryByQueryId.get(result.queryId) ?? "unknown"
      const config = this.configFor(category)
      const lastPoint = result.driftTimeline?.at(-1)
      if (!lastPoint) continue
      const timestamp = new Date(lastPoint.timestamp).getTime()
      if (!Number.isFinite(timestamp) || timestamp < windowEndMs - config.correlationWindowMs || timestamp > windowEndMs) continue
      const categoryResults = byCategory.get(category) ?? []
      categoryResults.push(result)
      byCategory.set(category, categoryResults)
    }

    const events: AlgorithmUpdateEvent[] = []
    for (const [category, categoryResults] of byCategory) {
      const config = this.configFor(category)
      if (categoryResults.length < config.minQueriesInCategory) continue
      const drifted = categoryResults.filter(result =>
        Number.isFinite(result.latestDrift) && result.latestDrift >= config.perQueryDriftThreshold
      )
      const driftRate = drifted.length / categoryResults.length
      if (driftRate < config.driftRateThreshold || drifted.length === 0) continue
      const affectedAverageDrift = drifted.reduce((sum, result) => sum + result.latestDrift, 0) / drifted.length
      const currentObservedAverageDrift = categoryResults.reduce((sum, result) => sum + result.latestDrift, 0) / categoryResults.length
      const windowStartMs = windowEndMs - config.correlationWindowMs
      let baseline = {
        mean: 0,
        standardDeviation: 0,
        sampleCount: 0,
        historicalObservationCount: 0,
        historicalQueryCount: 0,
        available: false,
      }
      try {
        baseline = await this.baselineProvider.getBaseline(
          categoryResults,
          windowStartMs,
          windowEndMs,
          config.historicalWindowDays,
          config.minBaselineSamples,
          config.minBaselineQueries
        )
      } catch (error) {
        this.logger.warn(category, "Historical baseline unavailable", {
          error: error instanceof Error ? error.message : String(error),
        })
      }
      const historicalDeviation = baseline.available && baseline.standardDeviation > 0
        ? (currentObservedAverageDrift - baseline.mean) / baseline.standardDeviation
        : null
      // Zero variance cannot produce a z-score, so require a configurable
      // absolute movement beyond the stable mean instead.
      const baselinePassed = !baseline.available
        || (baseline.standardDeviation === 0
          ? currentObservedAverageDrift >= baseline.mean + config.baselineAbsoluteEpsilon
          : (historicalDeviation ?? Number.NEGATIVE_INFINITY) >= config.baselineDeviationThreshold)
      if (!baselinePassed) continue

      const thresholds: ResolvedDetectionThresholds = { ...config }
      const evidence = EvidenceBuilder.build({
        observedResults: categoryResults,
        affectedResults: drifted,
        queryMeta,
        thresholds,
        baseline,
        historicalDeviation,
        baselinePassed,
        windowStartMs,
        windowEndMs,
      })
      const historicalSignal = baseline.available
        ? (baseline.standardDeviation === 0
          ? (baselinePassed ? 1 : 0)
          : Math.max(0, Math.min(1, (historicalDeviation ?? 0) / HISTORICAL_DEVIATION_FULL_CONFIDENCE)))
        : null
      const confidence = ConfidenceScorer.score({
        driftRate,
        avgDriftScore: currentObservedAverageDrift,
        affectedQueryCount: drifted.length,
        observedQueryCount: categoryResults.length,
        historicalDeviation,
        historicalSignal,
        baselineSampleCount: baseline.sampleCount,
        temporalConcentration: evidence.temporalConcentration,
      })
      const metrics: DetectionMetrics = {
        totalQueriesInCategory: categoryResults.length,
        affectedQueryCount: drifted.length,
        driftRate,
        avgDriftScore: affectedAverageDrift,
        affectedAverageDrift,
        currentObservedAverageDrift,
        historicalAvgDrift: baseline.mean,
        historicalStdDev: baseline.standardDeviation,
        historicalSampleCount: baseline.sampleCount,
        historicalObservationCount: baseline.historicalObservationCount,
        historicalQueryCount: baseline.historicalQueryCount,
        historicalBaselineAvailable: baseline.available,
        historicalDeviation,
        windowStartMs,
        windowEndMs,
      }
      const affectedQueries: DriftPoint[] = drifted.map(result => ({
        queryId: result.queryId,
        queryName: nameByQueryId.get(result.queryId) ?? result.queryName ?? result.queryId,
        driftScore: result.latestDrift,
        timestamp: new Date(result.driftTimeline.at(-1)?.timestamp ?? windowEndMs),
      }))
      events.push({
        id: EventPersistence.buildEventId(category, windowStartMs, config.correlationWindowMs),
        detectedAt: new Date(windowEndMs),
        category,
        affectedQueries,
        confidence,
        metrics,
        severity: confidence.severity,
        detectorVersion: DETECTOR_VERSION,
        schemaVersion: 2,
        createdAt: new Date(windowEndMs),
        detectionMode: baseline.available ? "baseline-aware" : "fixed-threshold",
        thresholds,
        evidence,
      })
    }
    this.logger.info("system", "Algorithm detection complete", { events: events.length })
    return events
  }

  async persistEvents(userId: string, events: AlgorithmUpdateEvent[]): Promise<void> {
    const results = await Promise.allSettled(events.map(event => this.repository.upsert(userId, event)))
    const failures = results.filter(result => result.status === "rejected")
    if (failures.length > 0) throw new Error(`Failed to persist ${failures.length} of ${events.length} algorithm events`)
  }

  async getRecentEvents(userId: string, limit = 10): Promise<AlgorithmUpdateEventView[]> {
    const events = await this.repository.getRecent(userId, limit)
    return events.map(event => {
      // Existing Appwrite documents already contain the accurate description
      // generated at detection time. Prefer it over rebuilding from the lossy
      // legacy fallback metrics used when structured metrics are unavailable.
      const detail = event.storedDescription ?? DescriptionBuilder.detail(event)
      return {
        ...event,
        summary: DescriptionBuilder.summary(event),
        detail,
        description: detail,
        driftRate: event.metrics.driftRate,
        avgDriftScore: event.metrics.avgDriftScore,
      }
    })
  }

  static async getRecentEvents(userId: string, limit = 10): Promise<AlgorithmUpdateEventView[]> {
    return new AlgorithmUpdateDetector().getRecentEvents(userId, limit)
  }
}

export const algorithmUpdateDetector = new AlgorithmUpdateDetector()
