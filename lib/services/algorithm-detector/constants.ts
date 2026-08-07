export const DETECTOR_DEFAULTS = {
  DRIFT_RATE_THRESHOLD: 0.6,
  PER_QUERY_DRIFT_THRESHOLD: 30,
  MIN_QUERIES_IN_CATEGORY: 3,
  CORRELATION_WINDOW_MS: 24 * 60 * 60 * 1000,
  HISTORICAL_WINDOW_DAYS: 14,
  EVENT_FETCH_LIMIT: 50,
} as const

export const SEVERITY_BANDS = [
  { minConfidence: 75, severity: "major" },
  { minConfidence: 50, severity: "moderate" },
  { minConfidence: 0, severity: "minor" },
] as const

export const CATEGORY_THRESHOLDS: Record<string, {
  driftRateThreshold?: number
  perQueryDriftThreshold?: number
  minQueriesInCategory?: number
}> = {
  news: { driftRateThreshold: 0.7, perQueryDriftThreshold: 35 },
  github: { driftRateThreshold: 0.55, perQueryDriftThreshold: 25 },
  "research paper": {
    driftRateThreshold: 0.65,
    perQueryDriftThreshold: 30,
    minQueriesInCategory: 2,
  },
}

export const CONFIDENCE_WEIGHTS = {
  driftRate: 0.35,
  avgDriftScore: 0.3,
  queryCount: 0.15,
  historicalDev: 0.2,
} as const

export function getAlgorithmEventsCollection(): string {
  // Backward compatibility: deployments created before this setting was
  // documented used the collection ID "algorithm_events" directly.
  return process.env.COLLECTION_ALGORITHM_EVENTS ?? "algorithm_events"
}
