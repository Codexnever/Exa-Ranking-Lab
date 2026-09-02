import { AlgorithmUpdateDetector } from "../AlgorithmUpdateDetector"
import { ConfidenceScorer } from "../ConfidenceScorer"
import { EvidenceBuilder } from "../EvidenceBuilder"
import { documentToEvent, EventPersistence, stableStringify, toAppwritePayload, toAppwritePayloadV2 } from "../EventPersistence"
import { NoHistoricalBaselineProvider, TimelineHistoricalBaselineProvider } from "../HistoricalBaselineProvider"
import { DETECTOR_DEFAULTS, DETECTOR_VERSION } from "../constants"
import { SilentLogger } from "../logger"
import type { AlgorithmEventRepository, AlgorithmUpdateEvent, DetectionConfigOverride, HistoricalBaselineProvider } from "../types"
import type { DriftAnalysisResult, DriftTimelinePoint } from "@/types/type"
declare const describe: (name: string, fn: () => void) => void
declare const test: (name: string, fn: () => void | Promise<void>) => void
declare const expect: (value: any) => any

const NOW = new Date("2026-08-04T12:00:00Z").getTime()
const repository: AlgorithmEventRepository = {
  async upsert(): Promise<void> {},
  async getRecent(): Promise<AlgorithmUpdateEvent[]> { return [] },
}

function makeDetector(config: DetectionConfigOverride = {}, baseline: HistoricalBaselineProvider = new TimelineHistoricalBaselineProvider()): AlgorithmUpdateDetector {
  return new AlgorithmUpdateDetector(config, new SilentLogger(), repository, baseline)
}

function point(queryId: string, driftScore: number, hoursAgo: number): DriftTimelinePoint {
  return {
    timestamp: new Date(NOW - hoursAgo * 3_600_000), snapshotId: `snap_${queryId}_${hoursAgo}`,
    previousSnapshotId: null, driftScore, rankChanges: [], newResults: 0, droppedResults: 0,
    contentChanges: 0, processingTime: 10,
  }
}

function makeResult(queryId: string, latestDrift: number, historical: number[] = [], hoursAgo = 0): DriftAnalysisResult {
  return {
    queryId, queryName: queryId, latestDrift, averageDrift: latestDrift, maxDrift: latestDrift,
    stability: latestDrift > 50 ? "volatile" : "stable", driftTrend: "stable", totalProcessingTime: 10,
    totalContentChanges: 0, averageCacheHitRate: 0.8,
    driftTimeline: [
      ...historical.map((score, index) => point(queryId, score, 48 + index * 24)),
      point(queryId, latestDrift, hoursAgo),
    ],
  }
}

function metadata(results: DriftAnalysisResult[], category = "company") {
  return results.map(result => ({ id: result.queryId, name: result.queryName, category }))
}

const strongBatch = (history: number[] = []) => Array.from({ length: 10 }, (_, i) =>
  makeResult(`q${i}`, i < 7 ? 70 : 5, i === 0 ? history : [])
)

function batchWithHistories(currentAffected = 70, currentStable = 5, historicalMean = 5) {
  return Array.from({ length: 10 }, (_, i) => makeResult(
    `q${i}`,
    i < 7 ? currentAffected : currentStable,
    i < 3 ? Array(4).fill(historicalMean) : []
  ))
}

describe("coordinated and baseline-aware detection", () => {
  test("10 stable queries produce no event", async () => {
    const results = Array.from({ length: 10 }, (_, i) => makeResult(`q${i}`, 5))
    expect(await makeDetector().detect(results, metadata(results), "user", NOW)).toHaveLength(0)
  })

  test("one noisy query is not a coordinated event", async () => {
    const results = Array.from({ length: 10 }, (_, i) => makeResult(`q${i}`, i === 0 ? 90 : 5))
    expect(await makeDetector().detect(results, metadata(results), "user", NOW)).toHaveLength(0)
  })

  test("duplicate result rows cannot inflate distinct-query coverage", async () => {
    const first = makeResult("q1", 90)
    const equalTimestamp = makeResult("q1", 5)
    const results = [first, equalTimestamp, makeResult("q2", 90), makeResult("q3", 90)]
    const [event] = await makeDetector().detect(results, metadata(results), "user", NOW)
    expect(event.evidence.observedQueryCount).toBe(3)
    expect(event.affectedQueries.find(query => query.queryId === "q1")?.driftScore).toBe(90)
  })

  test("future observations are excluded from current evidence", async () => {
    const results = Array.from({ length: 3 }, (_, index) => makeResult(`q${index}`, 70))
    for (const result of results) result.driftTimeline.push(point(result.queryId, 99, -1))
    const [event] = await makeDetector({ minBaselineSamples: 100 }).detect(results, metadata(results), "user", NOW)
    expect(event.affectedQueries.every(query => query.driftScore === 70)).toBe(true)
    expect(event.evidence.detectionReasons.find(reason => reason.code === "correlation_window")?.passed).toBe(true)
  })

  test("seven strongly drifting queries produce a versioned fallback event", async () => {
    const results = strongBatch()
    const [event] = await makeDetector().detect(results, metadata(results), "user", NOW)
    expect(event.detectorVersion).toBe(DETECTOR_VERSION)
    expect(event.detectionMode).toBe("fixed-threshold")
    expect(event.evidence.observedQueryCount).toBe(10)
    expect(event.evidence.affectedQueryCount).toBe(7)
    expect(event.evidence.baselineAvailabilityReasonCode).toBe("insufficient_observations")
  })

  test("historically volatile normal drift is suppressed", async () => {
    const means = [35, 45, 55]
    const results = Array.from({ length: 10 }, (_, i) => makeResult(`q${i}`, i < 7 ? 47 : 5, i < 3 ? Array(4).fill(means[i]) : []))
    expect(await makeDetector().detect(results, metadata(results), "user", NOW)).toHaveLength(0)
  })

  test("historically stable category with sudden drift produces an event", async () => {
    const results = batchWithHistories()
    const [event] = await makeDetector().detect(results, metadata(results), "user", NOW)
    expect(event.detectionMode).toBe("baseline-aware")
    expect(event.evidence.baselineStandardDeviation).toBe(0)
  })

  test("insufficient observations or historical windows use fixed thresholds", async () => {
    const results = Array.from({ length: 10 }, (_, i) => makeResult(`q${i}`, i < 7 ? 70 : 5, i < 2 ? Array(20).fill(5) : []))
    const [event] = await makeDetector().detect(results, metadata(results), "user", NOW)
    expect(event.detectionMode).toBe("fixed-threshold")
    expect(event.evidence.baselineAvailabilityReasonCode).toBe("insufficient_queries")
    const oneWindow = Array.from({ length: 3 }, (_, index) => makeResult(`w${index}`, 70, [5]))
    const [windowEvent] = await makeDetector({ minBaselineSamples: 3 }).detect(oneWindow, metadata(oneWindow), "user", NOW)
    expect(windowEvent.evidence.baselineAvailabilityReasonCode).toBe("insufficient_valid_windows")
  })

  test("enough observations across enough queries uses the baseline-aware path", async () => {
    const results = batchWithHistories()
    const [event] = await makeDetector().detect(results, metadata(results), "user", NOW)
    expect(event.detectionMode).toBe("baseline-aware")
    expect(event.metrics.historicalSampleCount).toBeGreaterThanOrEqual(DETECTOR_DEFAULTS.MIN_BASELINE_WINDOWS)
  })

  test("zero-variance baseline deterministically suppresses an unchanged current level", async () => {
    const results = batchWithHistories(30, 20, 24)
    expect(await makeDetector().detect(results, metadata(results), "user", NOW)).toHaveLength(0)
  })

  test("zero-variance baseline accepts a change at least the absolute epsilon", async () => {
    const results = batchWithHistories(40, 20, 24)
    const [event] = await makeDetector().detect(results, metadata(results), "user", NOW)
    expect(event.detectionMode).toBe("baseline-aware")
    expect(event.evidence.amountAboveBaseline).toBeGreaterThanOrEqual(DETECTOR_DEFAULTS.BASELINE_ABSOLUTE_EPSILON)
  })

  test("historical anomaly uses all observed queries rather than affected queries", async () => {
    const results = batchWithHistories(70, 5, 20)
    const [event] = await makeDetector({ baselineDeviationThreshold: 0 }).detect(results, metadata(results), "user", NOW)
    expect(event.evidence.affectedAverageDrift).toBe(70)
    expect(event.evidence.currentObservedAverageDrift).toBe(50.5)
    expect(event.confidence.signals.avgDriftScore).toBe(50.5)
  })
})

describe("TimelineHistoricalBaselineProvider", () => {
  test("unequal history lengths cannot dominate the category baseline", async () => {
    const results = [makeResult("q1", 0, Array(100).fill(90)), makeResult("q2", 0, Array(10).fill(10)), makeResult("q3", 0, Array(10).fill(20))]
    const baseline = await new TimelineHistoricalBaselineProvider().getBaseline(results, NOW - 86_400_000, NOW, 14, 10, 3, 3, 3, 86_400_000)
    expect(baseline.windowCount).toBeGreaterThanOrEqual(3)
    expect(baseline.historicalObservationCount).toBe(34)
    expect(baseline.historicalQueryCount).toBe(3)
    expect(baseline.sampleCount).toBe(baseline.windowCount)
    expect(baseline.mean).toBe(40)
  })

  test("one long query history is not considered a mature category baseline", async () => {
    const baseline = await new TimelineHistoricalBaselineProvider().getBaseline([makeResult("q1", 0, Array(100).fill(20))], NOW - 86_400_000, NOW, 14, 10, 3, 3, 3, 86_400_000)
    expect(baseline.available).toBe(false)
    expect(baseline.availabilityReasonCode).toBe("insufficient_queries")
  })

  test("temporal category windows expose volatility hidden by identical query means", async () => {
    const results = [
      makeResult("q1", 0, [0, 100, 0, 100]),
      makeResult("q2", 0, [100, 0, 100, 0]),
      makeResult("q3", 0, [0, 100, 0, 100]),
    ]
    const baseline = await new TimelineHistoricalBaselineProvider().getBaseline(results, NOW - 86_400_000, NOW, 14, 10, 3, 3, 3, 86_400_000)
    expect(baseline.available).toBe(true)
    expect(baseline.standardDeviation).toBeGreaterThan(0)
    expect(baseline.medianAbsoluteDeviation).toBeGreaterThan(0)
  })

  test("one query contributes only its latest observation per bucket", async () => {
    const results = ["q1", "q2", "q3"].map(queryId => makeResult(queryId, 0, [10, 20, 30]))
    results[0].driftTimeline.unshift(point("q1", 99, 49))
    const baseline = await new TimelineHistoricalBaselineProvider().getBaseline(results, NOW - 86_400_000, NOW, 14, 9, 3, 3, 3, 86_400_000)
    expect(baseline.windowAverages[0]).toBe(10)
    expect(baseline.historicalObservationCount).toBe(10)
  })

  test("bucket boundaries are start-inclusive and current-window observations are excluded", async () => {
    const results = ["q1", "q2", "q3"].map(queryId => makeResult(queryId, 70, [10, 20, 30]))
    const baseline = await new TimelineHistoricalBaselineProvider().getBaseline(results, NOW - 86_400_000, NOW, 14, 9, 3, 3, 3, 86_400_000)
    expect(baseline.windowAverages).toEqual([10, 20, 30])
    expect(baseline.windowAverages).not.toContain(70)
  })

  test("historical lookback is anchored before the current window", async () => {
    const result = makeResult("q1", 70)
    result.driftTimeline.unshift(point("q1", 10, 360))
    const baseline = await new TimelineHistoricalBaselineProvider().getBaseline([result], NOW - 86_400_000, NOW, 14, 1, 1, 1, 1, 86_400_000)
    expect(baseline.historicalObservationCount).toBe(1)
    expect(baseline.windowAverages).toEqual([10])
  })

  test("buckets without enough distinct queries are rejected", async () => {
    const results = [makeResult("q1", 0, [10, 20, 30]), makeResult("q2", 0, [10, 20]), makeResult("q3", 0, [10])]
    const baseline = await new TimelineHistoricalBaselineProvider().getBaseline(results, NOW - 86_400_000, NOW, 14, 6, 3, 3, 3, 86_400_000)
    expect(baseline.available).toBe(false)
    expect(baseline.windowCount).toBe(1)
    expect(baseline.availabilityReason).toContain("coverage")
    expect(baseline.availabilityReasonCode).toBe("insufficient_window_coverage")
  })
})

describe("Detector v2.1 historical abnormality", () => {
  function categoryBatch(windowAverages: number[], current: number): DriftAnalysisResult[] {
    return Array.from({ length: 5 }, (_, index) => makeResult(`q${index}`, current, windowAverages))
  }

  test("stable historical windows allow coordinated abnormal movement", async () => {
    const results = categoryBatch([18, 22, 19, 21, 20, 23, 17], 45)
    const [event] = await makeDetector().detect(results, metadata(results), "user", NOW)
    expect(event.detectionMode).toBe("baseline-aware")
    expect(event.evidence.historicalComparisonMethod).toBe("robust-mad")
    expect(event.evidence.historicalDeviation).toBeGreaterThanOrEqual(event.thresholds.baselineDeviationThreshold)
  })

  test("historically volatile normal high movement is suppressed", async () => {
    const results = categoryBatch([45, 65, 35, 70, 50, 60, 40], 58)
    expect(await makeDetector().detect(results, metadata(results), "user", NOW)).toHaveLength(0)
  })

  test("movement below robust deviation threshold is suppressed and equality passes", async () => {
    const results = categoryBatch([10, 20, 30], 30)
    expect(await makeDetector({ baselineDeviationThreshold: 0.68 }).detect(results, metadata(results), "user", NOW)).toHaveLength(0)
    expect(await makeDetector({ baselineDeviationThreshold: (30 - 20) / 14.826 }).detect(results, metadata(results), "user", NOW)).toHaveLength(1)
  })

  test("zero-MAD epsilon boundary is inclusive and below-boundary movement is suppressed", async () => {
    const below = categoryBatch([20, 20, 20], 24.99)
    const exact = categoryBatch([20, 20, 20], 25)
    expect(await makeDetector({ perQueryDriftThreshold: 20 }).detect(below, metadata(below), "user", NOW)).toHaveLength(0)
    expect(await makeDetector({ perQueryDriftThreshold: 20 }).detect(exact, metadata(exact), "user", NOW)).toHaveLength(1)
  })

  test("invalid latest observations are ignored and category overrides remain active", async () => {
    const results = [makeResult("q1", 70), makeResult("q2", 70)]
    results[0].driftTimeline.push({ ...point("q1", Number.NaN, 0), timestamp: new Date("invalid") })
    const [event] = await makeDetector().detect(results, metadata(results, "research_paper"), "user", NOW)
    expect(event.evidence.observedQueryCount).toBe(2)
    expect(event.thresholds.minQueriesInCategory).toBe(2)
  })

  test("fallback event is explicitly unverified and stays minor", async () => {
    const results = strongBatch()
    const [event] = await makeDetector().detect(results, metadata(results), "user", NOW)
    expect(event.detectionMode).toBe("fixed-threshold")
    expect(event.confidence.percentage).toBeLessThan(50)
    expect(event.severity).toBe("minor")
    expect(event.evidence.baselineAvailabilityReason).not.toHaveLength(0)
    expect(event.evidence.changeType).toBe("unknown")
    expect(event.evidence.detectionReasons.every(reason => reason.passed)).toBe(true)
  })

  test("baseline provider failure records a safe exact fallback reason", async () => {
    const provider: HistoricalBaselineProvider = { async getBaseline() { throw new Error("internal storage detail") } }
    const results = strongBatch()
    const [event] = await makeDetector({}, provider).detect(results, metadata(results), "user", NOW)
    expect(event.evidence.baselineAvailabilityReason).toContain("calculation failed")
    expect(event.evidence.baselineAvailabilityReasonCode).toBe("provider_failure")
    expect(event.evidence.baselineAvailabilityReason).not.toContain("internal storage detail")
  })
})

describe("ConfidenceScorer v2", () => {
  const signals = {
    driftRate: 0.7, avgDriftScore: 70, affectedQueryCount: 7, observedQueryCount: 10,
    historicalDeviation: null, historicalSignal: null, baselineSampleCount: 0, temporalConcentration: 1,
  }

  test("authoritative confidence stays normalized", () => {
    const confidence = ConfidenceScorer.score(signals)
    expect(confidence.value).toBeGreaterThanOrEqual(0)
    expect(confidence.value).toBeLessThanOrEqual(1)
    expect(confidence.score).toBe(confidence.percentage)
  })

  test("missing baseline is not renormalized upward and fallback is capped", () => {
    const confidence = ConfidenceScorer.score(signals)
    expect(confidence.weightsUsed.historicalDeviation).toBeUndefined()
    expect(Object.values(confidence.weightsUsed).reduce((sum, weight) => sum + weight, 0)).toBeLessThan(1)
    expect(confidence.percentage).toBeLessThan(50)
    expect(confidence.confidenceCapped).toBe(true)
  })

  test("batch timestamps cannot inflate authoritative confidence", () => {
    const concentrated = ConfidenceScorer.score({ ...signals, temporalConcentration: 1 })
    const dispersed = ConfidenceScorer.score({ ...signals, temporalConcentration: 0 })
    expect(concentrated.value).toBe(dispersed.value)
    expect(concentrated.weightsUsed.temporalConcentration).toBeUndefined()
  })
})

describe("EvidenceBuilder", () => {
  test("aggregates evidence without recalculating drift and reports passed and failed gates", () => {
    const result = makeResult("q1", 70)
    result.driftTimeline[0] = {
      ...result.driftTimeline[0], newResults: 2, droppedResults: 1,
      rankChanges: [
        { url: "https://winner.example/a", title: "Winner", previousPosition: 8, currentPosition: 2, positionDelta: 6, similarityScore: 1, contentChanged: false },
        { url: "https://loser.example/b", title: "Loser", previousPosition: 2, currentPosition: 7, positionDelta: -5, similarityScore: 1, contentChanged: false },
      ],
      decomposedDrift: {
        contentDrift: 20, competitorDrift: 30, rerankDrift: 40, total: 70, dominantCause: "mixed",
        breakdown: { contentChangedUrls: [], newCompetitorUrls: ["https://gained.example/a"], droppedUrls: ["https://lost.example/b"], rerankedUrls: [] },
      },
    }
    const thresholds = { driftRateThreshold: .6, perQueryDriftThreshold: 30, minQueriesInCategory: 1, correlationWindowMs: 86_400_000, historicalWindowDays: 14, minBaselineSamples: 10, minBaselineQueries: 3, minBaselineWindows: 3, minBaselineWindowQueries: 3, baselineDeviationThreshold: 2, baselineAbsoluteEpsilon: 5 }
    const evidence = EvidenceBuilder.build({ observedResults: [result], affectedResults: [result], queryMeta: metadata([result]), thresholds, baseline: { mean: 0, standardDeviation: 0, sampleCount: 0, historicalObservationCount: 0, historicalQueryCount: 0, windowCount: 0, median: 0, medianAbsoluteDeviation: 0, robustSigma: 0, windowAverages: [], available: false, availabilityReason: "No history", availabilityReasonCode: "provider_disabled" }, historicalDeviation: null, baselinePassed: true, windowStartMs: NOW - 86_400_000, windowEndMs: NOW })
    expect(evidence.averageAbsoluteRankMovement).toBe(5.5)
    expect(evidence.urlTurnoverCount).toBe(3)
    expect(evidence.domainsGained).toEqual(["gained.example"])
    expect(evidence.domainsLost).toEqual(["lost.example"])
    expect(evidence.rankingWinners[0].title).toBe("Winner")
    expect(evidence.rankingLosers[0].title).toBe("Loser")
    const failed = EvidenceBuilder.build({
      observedResults: [result], affectedResults: [result], queryMeta: metadata([result]),
      thresholds: { ...thresholds, minQueriesInCategory: 2, driftRateThreshold: 1.1 },
      baseline: { mean: 20, standardDeviation: 1, sampleCount: 3, historicalObservationCount: 9, historicalQueryCount: 3, windowCount: 3, median: 20, medianAbsoluteDeviation: 1, robustSigma: 1.4826, windowAverages: [19, 20, 21], available: true, availabilityReason: "Available", availabilityReasonCode: "available" },
      historicalDeviation: 0, baselinePassed: false, windowStartMs: NOW - 86_400_000, windowEndMs: NOW,
    })
    expect(failed.detectionReasons.some(reason => !reason.passed)).toBe(true)
  })
})

describe("identity and persistence compatibility", () => {
  test("event IDs remain deterministic and correlation-window-specific", () => {
    expect(EventPersistence.buildEventId("news", NOW)).toBe(EventPersistence.buildEventId("news", NOW))
    expect(EventPersistence.buildEventId("news", NOW, 3_600_000)).not.toBe(EventPersistence.buildEventId("news", NOW, 86_400_000))
  })

  test("v2 domain fields are not sent to the legacy Appwrite schema", async () => {
    const results = strongBatch()
    const [event] = await makeDetector({}, new NoHistoricalBaselineProvider()).detect(results, metadata(results), "user", NOW)
    expect(Object.keys(toAppwritePayload("user", event)).sort()).toEqual([
      "affectedCount", "affectedQueries", "avgDriftScore", "category", "description", "detectedAt",
      "driftRate", "eventId", "severity", "userId",
    ])
  })

  test("v2 payload preserves legacy semantics and structured values", async () => {
    const results = batchWithHistories()
    const [event] = await makeDetector().detect(results, metadata(results), "user", NOW)
    const payload = toAppwritePayloadV2("user", event)
    expect(payload.schemaVersion).toBe(2)
    expect(payload.detectorVersion).toBe("2.1")
    expect(payload.avgDriftScore).toBe(event.metrics.affectedAverageDrift)
    expect(payload.currentObservedAverageDrift).toBe(event.metrics.currentObservedAverageDrift)
    expect(payload.historicalObservationCount).toBe(event.metrics.historicalObservationCount)
    expect(payload.historicalQueryCount).toBe(event.metrics.historicalQueryCount)
    expect(JSON.parse(payload.thresholdsJson).baselineAbsoluteEpsilon).toBe(event.thresholds.baselineAbsoluteEpsilon)
    expect(JSON.parse(payload.evidenceJson).affectedAverageDrift).toBe(event.evidence.affectedAverageDrift)
    const restored = documentToEvent(payload as unknown as Record<string, unknown>)
    expect(restored.schemaVersion).toBe(2)
    expect(restored.metrics.currentObservedAverageDrift).toBe(event.metrics.currentObservedAverageDrift)
    expect(restored.evidence.historicalQueryCount).toBe(event.evidence.historicalQueryCount)
    expect(restored.metrics.historicalSampleCount).toBe(event.evidence.baselineSampleCount)
  })

  test("legacy documents remain schema v1 without invented v2 evidence", () => {
    const legacy = documentToEvent({ eventId: "old", category: "news", severity: "moderate", driftRate: .7,
      avgDriftScore: 40, affectedCount: 3, affectedQueries: "[]", detectedAt: new Date(NOW).toISOString(),
      description: "Original stored explanation" })
    expect(legacy.schemaVersion).toBe(1)
    expect(legacy.detectorVersion).toBe("legacy")
    expect(legacy.storedDescription).toBe("Original stored explanation")
    expect(legacy.evidence.historicalBaselineUsed).toBe(false)
    expect(legacy.evidence.historicalObservationCount).toBe(0)
    expect(legacy.evidence.detectionReasons[0].message).toContain("not stored")
  })

  test("stored schema-v2 events without v2.1 additions remain readable", async () => {
    const results = batchWithHistories()
    const [event] = await makeDetector().detect(results, metadata(results), "user", NOW)
    const payload = toAppwritePayloadV2("user", event) as unknown as Record<string, unknown>
    const oldEvidence = JSON.parse(String(payload.evidenceJson)) as Record<string, unknown>
    for (const key of ["historicalWindowCount", "baselineMedian", "baselineMedianAbsoluteDeviation", "robustSigma", "historicalComparisonMethod", "baselineAvailabilityReason", "changeType"]) delete oldEvidence[key]
    payload.evidenceJson = JSON.stringify(oldEvidence)
    const oldConfidence = JSON.parse(String(payload.confidenceJson)) as Record<string, unknown>
    for (const key of ["confidenceCapped", "confidenceCap", "confidenceCapReason"]) delete oldConfidence[key]
    payload.confidenceJson = JSON.stringify(oldConfidence)
    const restored = documentToEvent(payload)
    expect(restored.schemaVersion).toBe(2)
    expect(restored.evidence.changeType).toBe("unknown")
    expect(restored.evidence.baselineAvailabilityReason).toContain("not stored")
    expect(restored.confidence.confidenceCapped).toBe(false)
    expect(restored.confidence.confidenceCap).toBeNull()
  })

  test("schema-aware upsert falls back, deduplicates, and propagates genuine errors", async () => {
    const [event] = await makeDetector().detect(strongBatch(), metadata(strongBatch()), "user", NOW)
    const created: Array<Record<string, unknown>> = []; const updated: Array<Record<string, unknown>> = []
    const database = { getCollection: async () => ({ attributes: [] }),
      createDocument: async (_db: string, _collection: string, _id: string, data: Record<string, unknown>) => { created.push(data); throw { code: 409 } },
      updateDocument: async (_db: string, _collection: string, _id: string, data: Record<string, unknown>) => { updated.push(data) },
      listDocuments: async () => ({ documents: [] }) }
    const dependencies = { databases: database, databaseId: "db", equal: () => "", orderDesc: () => "", limit: () => "" }
    await new EventPersistence(new SilentLogger(), dependencies).upsert("user", event)
    expect(created[0].schemaVersion).toBeUndefined()
    expect(updated).toHaveLength(1)
    database.createDocument = async () => { throw { code: 500 } }
    await expect(new EventPersistence(new SilentLogger(), dependencies).upsert("user", event)).rejects.toEqual({ code: 500 })
  })

  test("oversized structured JSON fails explicitly", () => {
    expect(() => stableStringify({ value: "x".repeat(20_000) }, "evidenceJson")).toThrow(/exceeds/)
  })
})
