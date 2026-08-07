import { CATEGORY_THRESHOLDS, DETECTOR_DEFAULTS } from "./constants"
import { ConfidenceScorer } from "./ConfidenceScorer"
import { DescriptionBuilder } from "./DescriptionBuilder"
import { EventPersistence } from "./EventPersistence"
import { AppwriteHistoricalBaselineProvider } from "./HistoricalBaselineProvider"
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
    private readonly baselineProvider: HistoricalBaselineProvider = new AppwriteHistoricalBaselineProvider()
  ) {
    this.baseConfig = {
      driftRateThreshold: configOverride.driftRateThreshold ?? DETECTOR_DEFAULTS.DRIFT_RATE_THRESHOLD,
      perQueryDriftThreshold: configOverride.perQueryDriftThreshold ?? DETECTOR_DEFAULTS.PER_QUERY_DRIFT_THRESHOLD,
      minQueriesInCategory: configOverride.minQueriesInCategory ?? DETECTOR_DEFAULTS.MIN_QUERIES_IN_CATEGORY,
      correlationWindowMs: configOverride.correlationWindowMs ?? DETECTOR_DEFAULTS.CORRELATION_WINDOW_MS,
      historicalWindowDays: configOverride.historicalWindowDays ?? DETECTOR_DEFAULTS.HISTORICAL_WINDOW_DAYS,
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
      const avgDriftScore = drifted.reduce((sum, result) => sum + result.latestDrift, 0) / drifted.length
      let baseline = { avg: 0, stdDev: 0 }
      try {
        baseline = await this.baselineProvider.getBaseline(userId, category, config.historicalWindowDays)
      } catch (error) {
        this.logger.warn(category, "Historical baseline unavailable", {
          error: error instanceof Error ? error.message : String(error),
        })
      }
      const historicalDeviation = baseline.stdDev > 0
        ? Math.max(0, (avgDriftScore - baseline.avg) / baseline.stdDev)
        : 0
      const confidence = ConfidenceScorer.score({
        driftRate,
        avgDriftScore,
        affectedQueryCount: drifted.length,
        historicalDeviation,
      })
      const windowStartMs = windowEndMs - config.correlationWindowMs
      const metrics: DetectionMetrics = {
        totalQueriesInCategory: categoryResults.length,
        affectedQueryCount: drifted.length,
        driftRate,
        avgDriftScore,
        historicalAvgDrift: baseline.avg,
        historicalStdDev: baseline.stdDev,
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
      const detail = DescriptionBuilder.detail(event)
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
