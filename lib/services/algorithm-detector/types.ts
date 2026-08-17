import type { DriftAnalysisResult } from "@/types/type"

export type AlgorithmUpdateSeverity = "major" | "moderate" | "minor"

export interface QueryMeta {
  id: string
  name: string
  category: string
}

export interface DriftPoint {
  queryId: string
  queryName: string
  driftScore: number
  timestamp: Date
}

export interface DetectionConfig {
  driftRateThreshold: number
  perQueryDriftThreshold: number
  minQueriesInCategory: number
  correlationWindowMs: number
  historicalWindowDays: number
  minBaselineSamples: number
  minBaselineQueries: number
  baselineDeviationThreshold: number
  baselineAbsoluteEpsilon: number
}

export type DetectionConfigOverride = Partial<DetectionConfig>

export interface ConfidenceSignals {
  driftRate: number
  avgDriftScore: number
  affectedQueryCount: number
  observedQueryCount: number
  historicalDeviation: number | null
  historicalSignal: number | null
  baselineSampleCount: number
  temporalConcentration: number
}

export interface ConfidenceResult {
  /** Authoritative normalized confidence. */
  value: number
  /** Display-friendly percentage. */
  percentage: number
  /** @deprecated Compatibility alias for percentage. */
  score: number
  severity: AlgorithmUpdateSeverity
  signals: ConfidenceSignals
  normalizedSignals: Record<string, number>
  weightsUsed: Record<string, number>
}

export interface DetectionMetrics {
  totalQueriesInCategory: number
  affectedQueryCount: number
  driftRate: number
  avgDriftScore: number
  affectedAverageDrift: number
  currentObservedAverageDrift: number
  historicalAvgDrift: number
  historicalStdDev: number
  historicalSampleCount: number
  historicalObservationCount: number
  historicalQueryCount: number
  historicalBaselineAvailable: boolean
  historicalDeviation: number | null
  windowStartMs: number
  windowEndMs: number
}

export interface ResolvedDetectionThresholds {
  driftRateThreshold: number
  perQueryDriftThreshold: number
  minQueriesInCategory: number
  correlationWindowMs: number
  historicalWindowDays: number
  minBaselineSamples: number
  minBaselineQueries: number
  baselineDeviationThreshold: number
  baselineAbsoluteEpsilon: number
}

export interface RankingMovementEvidence {
  queryId: string
  queryName: string
  url: string
  title: string
  previousPosition: number
  currentPosition: number
  positionDelta: number
}

export interface DetectionReason {
  code: "coordination" | "drift_magnitude" | "correlation_window" | "historical_baseline" | "baseline_fallback"
  passed: boolean
  message: string
}

export interface RankingChangeEvidence {
  affectedQueryCount: number
  observedQueryCount: number
  driftRate: number
  configuredDriftRateThreshold: number
  /** @deprecated Compatibility alias for affectedAverageDrift. */
  averageDriftScore: number
  affectedAverageDrift: number
  currentObservedAverageDrift: number
  correlationWindowMs: number
  correlationWindowHours: number
  temporalConcentration: number
  averageAbsoluteRankMovement: number | null
  newResultCount: number
  droppedResultCount: number
  urlTurnoverCount: number
  averageContentDrift: number | null
  averageCompetitorDrift: number | null
  averageRerankDrift: number | null
  domainsGained: string[]
  domainsLost: string[]
  rankingWinners: RankingMovementEvidence[]
  rankingLosers: RankingMovementEvidence[]
  historicalBaselineUsed: boolean
  baselineMean: number
  baselineStandardDeviation: number
  baselineSampleCount: number
  historicalObservationCount: number
  historicalQueryCount: number
  amountAboveBaseline: number
  baselineAbsoluteEpsilon: number
  historicalDeviation: number | null
  detectionReasons: DetectionReason[]
}

export interface AlgorithmUpdateEvent {
  id: string
  detectedAt: Date
  category: string
  affectedQueries: DriftPoint[]
  confidence: ConfidenceResult
  metrics: DetectionMetrics
  severity: AlgorithmUpdateSeverity
  detectorVersion: string
  schemaVersion: 1 | 2
  createdAt: Date
  detectionMode: "fixed-threshold" | "baseline-aware"
  thresholds: ResolvedDetectionThresholds
  evidence: RankingChangeEvidence
  /** Accurate description loaded from the legacy Appwrite schema, when present. */
  storedDescription?: string
}

export interface AlgorithmUpdateEventView extends AlgorithmUpdateEvent {
  summary: string
  detail: string
  // Flat aliases keep existing API/UI consumers compatible.
  driftRate: number
  avgDriftScore: number
  description: string
}

export interface PersistedAlgorithmEvent {
  userId: string
  eventId: string
  category: string
  severity: AlgorithmUpdateSeverity
  driftRate: number
  avgDriftScore: number
  affectedCount: number
  affectedQueries: string
  description: string
  detectedAt: string
}

export interface PersistedAlgorithmEventV2 extends PersistedAlgorithmEvent {
  schemaVersion: 2
  detectorVersion: string
  detectionMode: "fixed-threshold" | "baseline-aware"
  confidenceValue: number
  confidencePercentage: number
  observedQueryCount: number
  affectedQueryCount: number
  affectedAverageDrift: number
  currentObservedAverageDrift: number
  historicalBaselineAvailable: boolean
  historicalDeviation: number | null
  historicalObservationCount: number
  historicalQueryCount: number
  windowStart: string
  windowEnd: string
  correlationWindowMs: number
  createdAt: string
  thresholdsJson: string
  evidenceJson: string
  confidenceJson: string
}

export interface HistoricalBaseline {
  mean: number
  standardDeviation: number
  sampleCount: number
  historicalObservationCount: number
  historicalQueryCount: number
  available: boolean
}

export interface HistoricalBaselineProvider {
  getBaseline(
    results: DriftAnalysisResult[],
    windowStartMs: number,
    windowEndMs: number,
    historicalWindowDays: number,
    minSamples: number,
    minQueries: number
  ): Promise<HistoricalBaseline>
}

export interface AlgorithmEventRepository {
  upsert(userId: string, event: AlgorithmUpdateEvent): Promise<void>
  getRecent(userId: string, limit?: number): Promise<AlgorithmUpdateEvent[]>
}

export type LogLevel = "debug" | "info" | "warn" | "error"

export interface IDetectorLogger {
  debug(category: string, message: string, data?: Record<string, unknown>): void
  info(category: string, message: string, data?: Record<string, unknown>): void
  warn(category: string, message: string, data?: Record<string, unknown>): void
  error(category: string, message: string, data?: Record<string, unknown>): void
}

export type DetectorInput = DriftAnalysisResult[]
