/** Saved fields for presentation; no compatibility defaults. */
export interface RecordedDetectorEvidence {
  numbers: Record<string, number>
  text: Record<string, string>
  flags: Record<string, boolean>
  gates?: Array<{ code: string; message: string; passed?: boolean }>
}

const numericFields = ["avgDriftScore", "driftRate", "currentObservedAverageDrift", "affectedAverageDrift", "baselineMedian", "baselineMedianAbsoluteDeviation", "historicalDeviation", "baselineMean", "baselineStandardDeviation", "historicalWindowCount", "historicalObservationCount", "historicalQueryCount", "historicalWindowDays", "correlationWindowMs", "baselineAbsoluteEpsilon", "baselineDeviationThreshold", "confidencePercentage", "confidenceCap", "driftRateThreshold", "perQueryDriftThreshold", "minQueriesInCategory"]
const textFields = ["detectorVersion", "detectionMode", "baselineAvailabilityReason", "baselineAvailabilityReasonCode", "historicalComparisonMethod", "confidenceCapReason", "windowStart", "windowEnd"]
function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
function parsed(value: unknown): Record<string, unknown> {
  if (typeof value !== "string" || value.length > 32768) return {}
  try { return object(JSON.parse(value)) } catch { return {} }
}
export function sanitizeRecordedEvidence(value: unknown): RecordedDetectorEvidence {
  const source = object(value), numbers = object(source.numbers), text = object(source.text), flags = object(source.flags)
  const result: RecordedDetectorEvidence = { numbers: {}, text: {}, flags: {} }
  for (const key of numericFields) if (typeof numbers[key] === "number" && Number.isFinite(numbers[key])) result.numbers[key] = numbers[key]
  for (const key of textFields) if (typeof text[key] === "string" && text[key].trim()) result.text[key] = text[key].slice(0, 1000)
  for (const key of ['windowStart', 'windowEnd']) {
    if (result.text[key] && !Number.isFinite(Date.parse(result.text[key]))) delete result.text[key]
  }
  for (const [key, allowed] of [
    ['detectionMode', ['baseline-aware', 'fixed-threshold']],
    ['historicalComparisonMethod', ['robust-mad', 'absolute-epsilon', 'unavailable']],
    ['baselineAvailabilityReasonCode', ['available', 'insufficient_observations', 'insufficient_queries', 'insufficient_valid_windows', 'insufficient_window_coverage', 'provider_failure', 'provider_disabled']],
  ] as const) {
    if (result.text[key] && !(allowed as readonly string[]).includes(result.text[key])) delete result.text[key]
  }
  for (const key of ["historicalBaselineAvailable", "confidenceCapped"]) if (typeof flags[key] === "boolean") result.flags[key] = flags[key]
  if (Array.isArray(source.gates)) result.gates = source.gates.slice(0, 12).flatMap(value => {
    const gate = object(value)
    if (typeof gate.code !== "string" || typeof gate.message !== "string") return []
    return [{ code: gate.code.slice(0, 64), message: gate.message.slice(0, 1000), ...(typeof gate.passed === "boolean" ? { passed: gate.passed } : {}) }]
  })
  if (result.text.baselineAvailabilityReasonCode === "provider_failure") result.text.baselineAvailabilityReason = "Historical baseline provider was unavailable."
  return result
}
export function readRecordedEvidence(document: Record<string, unknown>): RecordedDetectorEvidence {
  if (document.schemaVersion !== 2) return sanitizeRecordedEvidence({
    numbers: { avgDriftScore: document.avgDriftScore, driftRate: document.driftRate },
  })
  const evidence = parsed(document.evidenceJson), thresholds = parsed(document.thresholdsJson), confidence = parsed(document.confidenceJson)
  const source = { ...thresholds, ...evidence, ...Object.fromEntries(Object.entries(document).filter(([, value]) => value !== null && value !== undefined)),
    confidencePercentage: confidence.percentage ?? document.confidencePercentage,
    confidenceCapped: confidence.confidenceCapped, confidenceCap: confidence.confidenceCap, confidenceCapReason: confidence.confidenceCapReason }
  return sanitizeRecordedEvidence({ numbers: source, text: source, flags: source, gates: evidence.detectionReasons })
}
