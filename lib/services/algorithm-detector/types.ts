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
}

export type DetectionConfigOverride = Partial<DetectionConfig>

export interface ConfidenceSignals {
  driftRate: number
  avgDriftScore: number
  affectedQueryCount: number
  historicalDeviation: number
}

export interface ConfidenceResult {
  score: number
  severity: AlgorithmUpdateSeverity
  signals: ConfidenceSignals
}

export interface DetectionMetrics {
  totalQueriesInCategory: number
  affectedQueryCount: number
  driftRate: number
  avgDriftScore: number
  historicalAvgDrift: number
  historicalStdDev: number
  windowStartMs: number
  windowEndMs: number
}

export interface AlgorithmUpdateEvent {
  id: string
  detectedAt: Date
  category: string
  affectedQueries: DriftPoint[]
  confidence: ConfidenceResult
  metrics: DetectionMetrics
  severity: AlgorithmUpdateSeverity
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
  confidence: number
  driftRate: number
  avgDriftScore: number
  affectedCount: number
  affectedQueries: string
  metrics: string
  windowStart: string
  windowEnd: string
  detectedAt: string
}

export interface HistoricalBaseline {
  avg: number
  stdDev: number
}

export interface HistoricalBaselineProvider {
  getBaseline(userId: string, category: string, windowDays: number): Promise<HistoricalBaseline>
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
