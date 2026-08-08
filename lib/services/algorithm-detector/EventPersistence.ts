import { DETECTOR_DEFAULTS, getAlgorithmEventsCollection } from "./constants"
import { ConfidenceScorer } from "./ConfidenceScorer"
import { DescriptionBuilder } from "./DescriptionBuilder"
import { SilentLogger } from "./logger"
import type {
  AlgorithmEventRepository, AlgorithmUpdateEvent, AlgorithmUpdateSeverity, ConfidenceSignals,
  DetectionMetrics, DriftPoint, IDetectorLogger, PersistedAlgorithmEvent, PersistedAlgorithmEventV2,
} from "./types"

export const ALGORITHM_EVENT_SCHEMA_VERSION = 2 as const
export const STRUCTURED_JSON_LIMITS = {
  thresholdsJson: 4_096, confidenceJson: 8_192, evidenceJson: 16_384,
  rankingWinners: 5, rankingLosers: 5, domainsGained: 50, domainsLost: 50, detectionReasons: 10,
} as const

export const V2_ATTRIBUTE_KEYS = [
  "schemaVersion", "detectorVersion", "detectionMode", "confidenceValue", "confidencePercentage",
  "observedQueryCount", "affectedQueryCount", "affectedAverageDrift", "currentObservedAverageDrift",
  "historicalBaselineAvailable", "historicalDeviation", "historicalObservationCount", "historicalQueryCount",
  "windowStart", "windowEnd", "correlationWindowMs", "createdAt", "thresholdsJson", "evidenceJson",
  "confidenceJson",
] as const

interface DatabaseAdapter {
  getCollection(databaseId: string, collectionId: string): Promise<{ attributes: Array<{ key: string; status?: string }> }>
  createDocument(databaseId: string, collectionId: string, documentId: string, data: Record<string, unknown>): Promise<unknown>
  updateDocument(databaseId: string, collectionId: string, documentId: string, data: Record<string, unknown>): Promise<unknown>
  listDocuments(databaseId: string, collectionId: string, queries?: string[]): Promise<{ documents: Array<Record<string, unknown>> }>
}
export interface PersistenceDependencies { databases: DatabaseAdapter; databaseId: string; equal: (key: string, value: string) => string; orderDesc: (key: string) => string; limit: (value: number) => string }

function hashString(value: string): string {
  let hash = 5381
  for (let index = 0; index < value.length; index++) hash = (((hash << 5) + hash) ^ value.charCodeAt(index)) >>> 0
  return hash.toString(16).padStart(8, "0")
}

export function buildEventId(category: string, windowStartMs: number, correlationWindowMs = DETECTOR_DEFAULTS.CORRELATION_WINDOW_MS): string {
  const safeWindowMs = Number.isFinite(correlationWindowMs) && correlationWindowMs > 0 ? Math.trunc(correlationWindowMs) : DETECTOR_DEFAULTS.CORRELATION_WINDOW_MS
  const windowBucket = Math.floor(windowStartMs / safeWindowMs)
  const identity = `${category.toLowerCase()}::${safeWindowMs}::${windowBucket}`
  return `algo_${safeWindowMs}_${windowBucket}_${hashString(identity)}`
}
export function buildDocumentId(userId: string, eventId: string): string { return `algo_${hashString(userId)}_${hashString(eventId)}` }

function normalizeJson(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(normalizeJson)
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, normalizeJson(item)]))
  return value
}
export function stableStringify(value: unknown, field: keyof Pick<typeof STRUCTURED_JSON_LIMITS, "thresholdsJson" | "evidenceJson" | "confidenceJson">): string {
  const serialized = JSON.stringify(normalizeJson(value))
  if (serialized.length > STRUCTURED_JSON_LIMITS[field]) throw new Error(`${field} exceeds ${STRUCTURED_JSON_LIMITS[field]} characters (${serialized.length})`)
  return serialized
}
function boundedEvidence(event: AlgorithmUpdateEvent): AlgorithmUpdateEvent["evidence"] {
  const arrays = [
    ["rankingWinners", event.evidence.rankingWinners.length, STRUCTURED_JSON_LIMITS.rankingWinners],
    ["rankingLosers", event.evidence.rankingLosers.length, STRUCTURED_JSON_LIMITS.rankingLosers],
    ["domainsGained", event.evidence.domainsGained.length, STRUCTURED_JSON_LIMITS.domainsGained],
    ["domainsLost", event.evidence.domainsLost.length, STRUCTURED_JSON_LIMITS.domainsLost],
    ["detectionReasons", event.evidence.detectionReasons.length, STRUCTURED_JSON_LIMITS.detectionReasons],
  ] as const
  const oversized = arrays.find(([, length, maximum]) => length > maximum)
  if (oversized) throw new Error(`evidence.${oversized[0]} contains ${oversized[1]} entries; maximum is ${oversized[2]}`)
  return event.evidence
}

export function toAppwritePayload(userId: string, event: AlgorithmUpdateEvent): PersistedAlgorithmEvent {
  return { userId, eventId: event.id, category: event.category, severity: event.severity,
    driftRate: event.metrics.driftRate, avgDriftScore: event.metrics.affectedAverageDrift,
    affectedCount: event.affectedQueries.length, affectedQueries: JSON.stringify(event.affectedQueries),
    description: DescriptionBuilder.detail(event), detectedAt: event.detectedAt.toISOString() }
}
export function toAppwritePayloadV2(userId: string, event: AlgorithmUpdateEvent): PersistedAlgorithmEventV2 {
  const legacy = toAppwritePayload(userId, event)
  return { ...legacy, schemaVersion: ALGORITHM_EVENT_SCHEMA_VERSION, detectorVersion: event.detectorVersion,
    detectionMode: event.detectionMode, confidenceValue: event.confidence.value,
    confidencePercentage: event.confidence.percentage, observedQueryCount: event.metrics.totalQueriesInCategory,
    affectedQueryCount: event.metrics.affectedQueryCount, affectedAverageDrift: event.metrics.affectedAverageDrift,
    currentObservedAverageDrift: event.metrics.currentObservedAverageDrift,
    historicalBaselineAvailable: event.metrics.historicalBaselineAvailable,
    historicalDeviation: event.metrics.historicalDeviation, historicalObservationCount: event.metrics.historicalObservationCount,
    historicalQueryCount: event.metrics.historicalQueryCount, windowStart: new Date(event.metrics.windowStartMs).toISOString(),
    windowEnd: new Date(event.metrics.windowEndMs).toISOString(), correlationWindowMs: event.thresholds.correlationWindowMs,
    createdAt: event.createdAt.toISOString(), thresholdsJson: stableStringify(event.thresholds, "thresholdsJson"),
    evidenceJson: stableStringify(boundedEvidence(event), "evidenceJson"), confidenceJson: stableStringify(event.confidence, "confidenceJson") }
}

function parseJson<T>(value: unknown, fallback: T): T { if (typeof value !== "string") return fallback; try { return JSON.parse(value) as T } catch { return fallback } }
function numberOr(value: unknown, fallback: number): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback }
function optionalNumber(value: unknown): number | null { return value === null || value === undefined || value === "" ? null : (Number.isFinite(Number(value)) ? Number(value) : null) }
function defaultThresholds() { return { driftRateThreshold: DETECTOR_DEFAULTS.DRIFT_RATE_THRESHOLD, perQueryDriftThreshold: DETECTOR_DEFAULTS.PER_QUERY_DRIFT_THRESHOLD,
  minQueriesInCategory: DETECTOR_DEFAULTS.MIN_QUERIES_IN_CATEGORY, correlationWindowMs: DETECTOR_DEFAULTS.CORRELATION_WINDOW_MS,
  historicalWindowDays: DETECTOR_DEFAULTS.HISTORICAL_WINDOW_DAYS, minBaselineSamples: DETECTOR_DEFAULTS.MIN_BASELINE_SAMPLES,
  minBaselineQueries: DETECTOR_DEFAULTS.MIN_BASELINE_QUERIES, baselineDeviationThreshold: DETECTOR_DEFAULTS.BASELINE_DEVIATION_THRESHOLD,
  baselineAbsoluteEpsilon: DETECTOR_DEFAULTS.BASELINE_ABSOLUTE_EPSILON } }

export function documentToEvent(document: Record<string, unknown>): AlgorithmUpdateEvent {
  const detectedAt = new Date(String(document.detectedAt))
  const affectedQueries = parseJson<Array<Omit<DriftPoint, "timestamp"> & { timestamp?: string }>>(document.affectedQueries, []).map(point => ({ ...point, timestamp: new Date(point.timestamp ?? detectedAt) }))
  const legacyAverage = numberOr(document.avgDriftScore, 0)
  const legacyMetrics: DetectionMetrics = { totalQueriesInCategory: numberOr(document.affectedCount, 0), affectedQueryCount: numberOr(document.affectedCount, 0),
    driftRate: numberOr(document.driftRate, 0), avgDriftScore: legacyAverage, affectedAverageDrift: legacyAverage,
    currentObservedAverageDrift: legacyAverage, historicalAvgDrift: 0, historicalStdDev: 0, historicalSampleCount: 0,
    historicalObservationCount: 0, historicalQueryCount: 0, historicalBaselineAvailable: false, historicalDeviation: null,
    windowStartMs: detectedAt.getTime() - DETECTOR_DEFAULTS.CORRELATION_WINDOW_MS, windowEndMs: detectedAt.getTime() }
  const schemaVersion = numberOr(document.schemaVersion, 1) === 2 ? 2 : 1
  const storedEvidence = schemaVersion === 2
    ? parseJson<Partial<AlgorithmUpdateEvent["evidence"]>>(document.evidenceJson, {})
    : {}
  const metrics: DetectionMetrics = schemaVersion === 2 ? {
    totalQueriesInCategory: numberOr(document.observedQueryCount, legacyMetrics.totalQueriesInCategory),
    affectedQueryCount: numberOr(document.affectedQueryCount, legacyMetrics.affectedQueryCount),
    driftRate: numberOr(document.driftRate, legacyMetrics.driftRate),
    avgDriftScore: numberOr(document.affectedAverageDrift, legacyAverage),
    affectedAverageDrift: numberOr(document.affectedAverageDrift, legacyAverage),
    currentObservedAverageDrift: numberOr(document.currentObservedAverageDrift, legacyAverage),
    historicalAvgDrift: numberOr(storedEvidence.baselineMean, 0),
    historicalStdDev: numberOr(storedEvidence.baselineStandardDeviation, 0),
    historicalSampleCount: numberOr(document.historicalQueryCount, 0),
    historicalObservationCount: numberOr(document.historicalObservationCount, 0),
    historicalQueryCount: numberOr(document.historicalQueryCount, 0),
    historicalBaselineAvailable: document.historicalBaselineAvailable === true,
    historicalDeviation: optionalNumber(document.historicalDeviation),
    windowStartMs: new Date(String(document.windowStart)).getTime(),
    windowEndMs: new Date(String(document.windowEnd)).getTime(),
  } : legacyMetrics
  const thresholds = schemaVersion === 2 ? parseJson(document.thresholdsJson, defaultThresholds()) : defaultThresholds()
  const signals: ConfidenceSignals = { driftRate: metrics.driftRate, avgDriftScore: metrics.currentObservedAverageDrift,
    affectedQueryCount: metrics.affectedQueryCount, observedQueryCount: metrics.totalQueriesInCategory,
    historicalDeviation: metrics.historicalDeviation, historicalSignal: null, baselineSampleCount: metrics.historicalSampleCount, temporalConcentration: 0 }
  const calculatedConfidence = ConfidenceScorer.score(signals)
  const legacyStoredConfidence = optionalNumber(document.confidence)
  const normalizedLegacyConfidence = legacyStoredConfidence === null
    ? calculatedConfidence.value
    : Math.max(0, Math.min(1, legacyStoredConfidence > 1 ? legacyStoredConfidence / 100 : legacyStoredConfidence))
  const confidence = schemaVersion === 2
    ? parseJson(document.confidenceJson, calculatedConfidence)
    : { ...calculatedConfidence, value: normalizedLegacyConfidence, percentage: Math.round(normalizedLegacyConfidence * 100),
        score: Math.round(normalizedLegacyConfidence * 100), severity: document.severity as AlgorithmUpdateSeverity }
  const legacyEvidence: AlgorithmUpdateEvent["evidence"] = { affectedQueryCount: metrics.affectedQueryCount, observedQueryCount: metrics.totalQueriesInCategory,
    driftRate: metrics.driftRate, configuredDriftRateThreshold: thresholds.driftRateThreshold, averageDriftScore: metrics.affectedAverageDrift,
    affectedAverageDrift: metrics.affectedAverageDrift, currentObservedAverageDrift: metrics.currentObservedAverageDrift,
    correlationWindowMs: thresholds.correlationWindowMs, correlationWindowHours: thresholds.correlationWindowMs / 3_600_000,
    temporalConcentration: 0, averageAbsoluteRankMovement: null, newResultCount: 0, droppedResultCount: 0, urlTurnoverCount: 0,
    averageContentDrift: null, averageCompetitorDrift: null, averageRerankDrift: null, domainsGained: [], domainsLost: [], rankingWinners: [], rankingLosers: [],
    historicalBaselineUsed: false, baselineMean: 0, baselineStandardDeviation: 0, baselineSampleCount: 0,
    historicalObservationCount: 0, historicalQueryCount: 0, amountAboveBaseline: 0, baselineAbsoluteEpsilon: thresholds.baselineAbsoluteEpsilon,
    historicalDeviation: null, detectionReasons: [{ code: "baseline_fallback", passed: true, message: "Structured Detector v2 evidence was not stored for this legacy event." }] }
  const evidence = schemaVersion === 2 ? parseJson<AlgorithmUpdateEvent["evidence"]>(document.evidenceJson, legacyEvidence) : legacyEvidence
  return { id: String(document.eventId), detectedAt, category: String(document.category), severity: document.severity as AlgorithmUpdateSeverity,
    affectedQueries, metrics, confidence, detectorVersion: schemaVersion === 2 ? String(document.detectorVersion) : "legacy", schemaVersion,
    createdAt: new Date(schemaVersion === 2 ? String(document.createdAt) : detectedAt), detectionMode: schemaVersion === 2 && document.detectionMode === "baseline-aware" ? "baseline-aware" : "fixed-threshold",
    thresholds, evidence, storedDescription: typeof document.description === "string" ? document.description : undefined }
}

async function defaultDependencies(): Promise<PersistenceDependencies> {
  const { databases, DATABASE_ID, Query } = await import("@/app/server/appwrite/appwrite-server")
  return { databases: databases as unknown as DatabaseAdapter, databaseId: DATABASE_ID, equal: Query.equal, orderDesc: Query.orderDesc, limit: Query.limit }
}
function errorCode(error: unknown): number | undefined { return typeof error === "object" && error !== null && "code" in error ? Number((error as { code?: unknown }).code) : undefined }

export class EventPersistence implements AlgorithmEventRepository {
  private schemaV2Ready: boolean | undefined
  constructor(private readonly logger: IDetectorLogger = new SilentLogger(), private readonly dependencies?: PersistenceDependencies) {}
  private async deps() { return this.dependencies ?? defaultDependencies() }
  private async v2Ready(databases: DatabaseAdapter, databaseId: string, collection: string): Promise<boolean> {
    if (this.schemaV2Ready !== undefined) return this.schemaV2Ready
    const metadata = await databases.getCollection(databaseId, collection)
    const ready = new Set(metadata.attributes.filter(attribute => !attribute.status || attribute.status === "available").map(attribute => attribute.key))
    this.schemaV2Ready = V2_ATTRIBUTE_KEYS.every(key => ready.has(key))
    return this.schemaV2Ready
  }
  async upsert(userId: string, event: AlgorithmUpdateEvent): Promise<void> {
    const { databases, databaseId } = await this.deps(); const collection = getAlgorithmEventsCollection(); const documentId = buildDocumentId(userId, event.id)
    const useV2 = await this.v2Ready(databases, databaseId, collection)
    const payload = useV2 ? toAppwritePayloadV2(userId, event) : toAppwritePayload(userId, event)
    if (!useV2) this.logger.warn(event.category, "Algorithm events schema v2 is not provisioned; persisting legacy payload without Detector v2 evidence", { id: event.id })
    try { await databases.createDocument(databaseId, collection, documentId, payload as unknown as Record<string, unknown>) }
    catch (error) { if (errorCode(error) !== 409) throw error; const { userId: _u, eventId: _e, category: _c, ...updates } = payload; await databases.updateDocument(databaseId, collection, documentId, updates as unknown as Record<string, unknown>) }
  }
  async getRecent(userId: string, limit = 10): Promise<AlgorithmUpdateEvent[]> {
    const { databases, databaseId, equal, orderDesc, limit: queryLimit } = await this.deps()
    const safeLimit = Number.isFinite(limit) ? Math.min(DETECTOR_DEFAULTS.EVENT_FETCH_LIMIT, Math.max(1, Math.trunc(limit))) : 10
    const result = await databases.listDocuments(databaseId, getAlgorithmEventsCollection(), [equal("userId", userId), orderDesc("detectedAt"), queryLimit(safeLimit)])
    return result.documents.flatMap(document => { try { return [documentToEvent(document)] } catch (error) { this.logger.warn("system", "Skipping malformed algorithm event", { error: error instanceof Error ? error.message : String(error) }); return [] } })
  }
  static buildEventId = buildEventId
  static buildDocumentId = buildDocumentId
}
