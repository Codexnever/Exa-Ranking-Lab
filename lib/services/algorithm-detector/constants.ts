export const DETECTOR_VERSION = "2.0"

export const DETECTOR_DEFAULTS = {
  DRIFT_RATE_THRESHOLD: 0.6,
  PER_QUERY_DRIFT_THRESHOLD: 30,
  MIN_QUERIES_IN_CATEGORY: 3,
  CORRELATION_WINDOW_MS: 24 * 60 * 60 * 1000,
  HISTORICAL_WINDOW_DAYS: 14,
  MIN_BASELINE_SAMPLES: 10,
  BASELINE_DEVIATION_THRESHOLD: 2,
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
  affectedQueryRate: 0.3,
  driftMagnitude: 0.25,
  historicalDeviation: 0.2,
  observationStrength: 0.15,
  temporalConcentration: 0.1,
} as const

export const FULL_OBSERVATION_CONFIDENCE_COUNT = 10
export const HISTORICAL_DEVIATION_FULL_CONFIDENCE = 3

export function getAlgorithmEventsCollection(): string {
  // Backward compatibility: deployments created before this setting was
  // documented used the collection ID "algorithm_events" directly.
  return process.env.COLLECTION_ALGORITHM_EVENTS ?? "algorithm_events"
}
