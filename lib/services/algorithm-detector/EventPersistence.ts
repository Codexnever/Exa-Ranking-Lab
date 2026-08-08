import { DETECTOR_DEFAULTS, getAlgorithmEventsCollection } from "./constants"
import { ConfidenceScorer } from "./ConfidenceScorer"
import { DescriptionBuilder } from "./DescriptionBuilder"
import { SilentLogger } from "./logger"
import type {
  AlgorithmEventRepository,
  AlgorithmUpdateEvent,
  AlgorithmUpdateSeverity,
  ConfidenceSignals,
  DetectionMetrics,
  DriftPoint,
  IDetectorLogger,
  PersistedAlgorithmEvent,
} from "./types"

function hashString(value: string): string {
  let hash = 5381
  for (let index = 0; index < value.length; index++) {
    hash = (((hash << 5) + hash) ^ value.charCodeAt(index)) >>> 0
  }
  return hash.toString(16).padStart(8, "0")
}

export function buildEventId(
  category: string,
  windowStartMs: number,
  correlationWindowMs = DETECTOR_DEFAULTS.CORRELATION_WINDOW_MS
): string {
  const safeWindowMs = Number.isFinite(correlationWindowMs) && correlationWindowMs > 0
    ? Math.trunc(correlationWindowMs)
    : DETECTOR_DEFAULTS.CORRELATION_WINDOW_MS
  const windowBucket = Math.floor(windowStartMs / safeWindowMs)
  const identity = `${category.toLowerCase()}::${safeWindowMs}::${windowBucket}`
  return `algo_${safeWindowMs}_${windowBucket}_${hashString(identity)}`
}

/**
 * Serialize to the schema that is already provisioned in Appwrite.
 *
 * Keep this boundary intentionally conservative: Appwrite rejects unknown
 * attributes, so confidence/metrics/window fields remain in the domain event
 * and API response until a separately deployed schema migration adds them.
 */
export function toAppwritePayload(
  userId: string,
  event: AlgorithmUpdateEvent
): PersistedAlgorithmEvent {
  return {
    userId,
    eventId: event.id,
    category: event.category,
    severity: event.severity,
    driftRate: event.metrics.driftRate,
    avgDriftScore: event.metrics.avgDriftScore,
    affectedCount: event.affectedQueries.length,
    affectedQueries: JSON.stringify(event.affectedQueries),
    description: DescriptionBuilder.detail(event),
    detectedAt: event.detectedAt.toISOString(),
  }
}

function buildDocumentId(userId: string, eventId: string): string {
  return `algo_${hashString(userId)}_${hashString(eventId)}`
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback
  try { return JSON.parse(value) as T } catch { return fallback }
}

export class EventPersistence implements AlgorithmEventRepository {
  constructor(private readonly logger: IDetectorLogger = new SilentLogger()) {}

  async upsert(userId: string, event: AlgorithmUpdateEvent): Promise<void> {
    const { databases, DATABASE_ID } = await import("@/app/server/appwrite/appwrite-server")
    const collection = getAlgorithmEventsCollection()
    const documentId = buildDocumentId(userId, event.id)
    const payload = toAppwritePayload(userId, event)

    try {
      await databases.createDocument(DATABASE_ID, collection, documentId, payload)
      this.logger.info(event.category, "Created algorithm event", { id: event.id })
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error
        ? Number((error as { code?: unknown }).code)
        : undefined
      if (code !== 409) throw error
      const { userId: _userId, eventId: _eventId, category: _category, ...updates } = payload
      await databases.updateDocument(DATABASE_ID, collection, documentId, updates)
      this.logger.info(event.category, "Updated algorithm event", { id: event.id })
    }
  }

  async getRecent(userId: string, limit = 10): Promise<AlgorithmUpdateEvent[]> {
    const { databases, DATABASE_ID, Query } = await import("@/app/server/appwrite/appwrite-server")
    const safeLimit = Number.isFinite(limit)
      ? Math.min(DETECTOR_DEFAULTS.EVENT_FETCH_LIMIT, Math.max(1, Math.trunc(limit)))
      : 10
    const result = await databases.listDocuments(
      DATABASE_ID,
      getAlgorithmEventsCollection(),
      [Query.equal("userId", userId), Query.orderDesc("detectedAt"), Query.limit(safeLimit)]
    )

    return result.documents.flatMap(document => {
      try {
        const legacyMetrics: DetectionMetrics = {
          totalQueriesInCategory: Number(document.affectedCount) || 0,
          affectedQueryCount: Number(document.affectedCount) || 0,
          driftRate: Number(document.driftRate) || 0,
          avgDriftScore: Number(document.avgDriftScore) || 0,
          historicalAvgDrift: 0,
          historicalStdDev: 0,
          historicalSampleCount: 0,
          historicalBaselineAvailable: false,
          historicalDeviation: null,
          windowStartMs: new Date(document.detectedAt).getTime() - 86_400_000,
          windowEndMs: new Date(document.detectedAt).getTime(),
        }
        const parsedMetrics = parseJson<DetectionMetrics & { confidenceSignals?: ConfidenceSignals }>(document.metrics, legacyMetrics)
        const affectedQueries = parseJson<Array<Omit<DriftPoint, "timestamp"> & { timestamp?: string }>>(
          document.affectedQueries,
          []
        ).map(point => ({
          ...point,
          timestamp: new Date(point.timestamp ?? document.detectedAt),
        }))
        const severity = document.severity as AlgorithmUpdateSeverity
        const signals = parsedMetrics.confidenceSignals ?? {
          driftRate: parsedMetrics.driftRate,
          avgDriftScore: parsedMetrics.avgDriftScore,
          affectedQueryCount: affectedQueries.length,
          observedQueryCount: parsedMetrics.totalQueriesInCategory,
          historicalDeviation: parsedMetrics.historicalStdDev > 0
            ? Math.max(0, (parsedMetrics.avgDriftScore - parsedMetrics.historicalAvgDrift) / parsedMetrics.historicalStdDev)
            : null,
          historicalSignal: null,
          baselineSampleCount: parsedMetrics.historicalSampleCount ?? 0,
          temporalConcentration: 1,
        }
        const storedConfidence = Number(document.confidence)
        const computedConfidence = ConfidenceScorer.score(signals)
        const normalizedStoredConfidence = Number.isFinite(storedConfidence)
          ? Math.max(0, Math.min(1, storedConfidence > 1 ? storedConfidence / 100 : storedConfidence))
          : computedConfidence.value
        const confidence = {
          ...computedConfidence,
          value: normalizedStoredConfidence,
          percentage: Math.round(normalizedStoredConfidence * 100),
          score: Math.round(normalizedStoredConfidence * 100),
          severity,
        }
        const thresholds = {
          driftRateThreshold: DETECTOR_DEFAULTS.DRIFT_RATE_THRESHOLD,
          perQueryDriftThreshold: DETECTOR_DEFAULTS.PER_QUERY_DRIFT_THRESHOLD,
          minQueriesInCategory: DETECTOR_DEFAULTS.MIN_QUERIES_IN_CATEGORY,
          correlationWindowMs: DETECTOR_DEFAULTS.CORRELATION_WINDOW_MS,
          historicalWindowDays: DETECTOR_DEFAULTS.HISTORICAL_WINDOW_DAYS,
          minBaselineSamples: DETECTOR_DEFAULTS.MIN_BASELINE_SAMPLES,
          baselineDeviationThreshold: DETECTOR_DEFAULTS.BASELINE_DEVIATION_THRESHOLD,
        }
        return [{
          id: String(document.eventId),
          detectedAt: new Date(document.detectedAt),
          category: String(document.category),
          severity,
          affectedQueries,
          metrics: parsedMetrics,
          confidence,
          detectorVersion: typeof document.detectorVersion === "string" ? document.detectorVersion : "legacy",
          createdAt: new Date(document.createdAt ?? document.detectedAt),
          detectionMode: parsedMetrics.historicalBaselineAvailable ? "baseline-aware" : "fixed-threshold",
          thresholds,
          evidence: {
            affectedQueryCount: parsedMetrics.affectedQueryCount,
            observedQueryCount: parsedMetrics.totalQueriesInCategory,
            driftRate: parsedMetrics.driftRate,
            configuredDriftRateThreshold: thresholds.driftRateThreshold,
            averageDriftScore: parsedMetrics.avgDriftScore,
            correlationWindowMs: thresholds.correlationWindowMs,
            correlationWindowHours: thresholds.correlationWindowMs / 3_600_000,
            windowStart: new Date(parsedMetrics.windowStartMs),
            windowEnd: new Date(parsedMetrics.windowEndMs),
            averageAbsoluteRankMovement: null,
            newResultCount: 0,
            droppedResultCount: 0,
            urlTurnoverCount: 0,
            averageContentDrift: null,
            averageCompetitorDrift: null,
            averageRerankDrift: null,
            domainsGained: [],
            domainsLost: [],
            rankingWinners: [],
            rankingLosers: [],
            historicalBaselineUsed: false,
            baselineMean: parsedMetrics.historicalAvgDrift,
            baselineStandardDeviation: parsedMetrics.historicalStdDev,
            baselineSampleCount: parsedMetrics.historicalSampleCount,
            historicalDeviation: parsedMetrics.historicalDeviation,
            temporalConcentration: 1,
            detectionReasons: [{ code: "baseline_fallback", passed: true, message: "Legacy event loaded without structured v2 evidence." }],
          },
          storedDescription: typeof document.description === "string"
            ? document.description
            : undefined,
        }]
      } catch (error) {
        this.logger.warn("system", "Skipping malformed algorithm event", {
          documentId: document.$id,
          error: error instanceof Error ? error.message : String(error),
        })
        return []
      }
    })
  }

  static buildEventId = buildEventId
}
