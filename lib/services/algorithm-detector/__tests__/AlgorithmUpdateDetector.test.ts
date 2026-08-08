import { AlgorithmUpdateDetector } from "../AlgorithmUpdateDetector"
import { ConfidenceScorer } from "../ConfidenceScorer"
import { EvidenceBuilder } from "../EvidenceBuilder"
import { EventPersistence, toAppwritePayload } from "../EventPersistence"
import { NoHistoricalBaselineProvider, TimelineHistoricalBaselineProvider } from "../HistoricalBaselineProvider"
import { DETECTOR_DEFAULTS, DETECTOR_VERSION } from "../constants"
import { SilentLogger } from "../logger"
import type { AlgorithmEventRepository, AlgorithmUpdateEvent, DetectionConfigOverride } from "../types"
import type { DriftAnalysisResult, DriftTimelinePoint } from "@/types/type"
declare const describe: (name: string, fn: () => void) => void
declare const test: (name: string, fn: () => void | Promise<void>) => void
declare const expect: (value: any) => any

const NOW = new Date("2026-08-04T12:00:00Z").getTime()
const repository: AlgorithmEventRepository = {
  async upsert(): Promise<void> {},
  async getRecent(): Promise<AlgorithmUpdateEvent[]> { return [] },
}

function makeDetector(config: DetectionConfigOverride = {}, baseline = new TimelineHistoricalBaselineProvider()): AlgorithmUpdateDetector {
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
      ...historical.map((score, index) => point(queryId, score, 48 + index)),
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

describe("coordinated and baseline-aware detection", () => {
  test("10 stable queries produce no event", async () => {
    const results = Array.from({ length: 10 }, (_, i) => makeResult(`q${i}`, 5))
    expect(await makeDetector().detect(results, metadata(results), "user", NOW)).toHaveLength(0)
  })

  test("one noisy query is not a coordinated event", async () => {
    const results = Array.from({ length: 10 }, (_, i) => makeResult(`q${i}`, i === 0 ? 90 : 5))
    expect(await makeDetector().detect(results, metadata(results), "user", NOW)).toHaveLength(0)
  })

  test("seven strongly drifting queries produce a versioned fallback event", async () => {
    const results = strongBatch()
    const [event] = await makeDetector().detect(results, metadata(results), "user", NOW)
    expect(event.detectorVersion).toBe(DETECTOR_VERSION)
    expect(event.detectionMode).toBe("fixed-threshold")
    expect(event.evidence.observedQueryCount).toBe(10)
    expect(event.evidence.affectedQueryCount).toBe(7)
  })

  test("historically volatile normal drift is suppressed", async () => {
    const history = [35, 55, 40, 50, 30, 60, 42, 48, 38, 52]
    const results = Array.from({ length: 10 }, (_, i) => makeResult(`q${i}`, i < 7 ? 47 : 5, i === 0 ? history : []))
    expect(await makeDetector().detect(results, metadata(results), "user", NOW)).toHaveLength(0)
  })

  test("historically stable category with sudden drift produces an event", async () => {
    const [event] = await makeDetector().detect(strongBatch(Array(10).fill(5)), metadata(strongBatch(), "company"), "user", NOW)
    expect(event.detectionMode).toBe("baseline-aware")
    expect(event.evidence.baselineStandardDeviation).toBe(0)
  })

  test("insufficient samples use fixed thresholds", async () => {
    const results = strongBatch(Array(DETECTOR_DEFAULTS.MIN_BASELINE_SAMPLES - 1).fill(5))
    const [event] = await makeDetector().detect(results, metadata(results), "user", NOW)
    expect(event.detectionMode).toBe("fixed-threshold")
  })

  test("exactly the minimum samples uses the baseline-aware path", async () => {
    const results = strongBatch(Array(DETECTOR_DEFAULTS.MIN_BASELINE_SAMPLES).fill(5))
    const [event] = await makeDetector().detect(results, metadata(results), "user", NOW)
    expect(event.detectionMode).toBe("baseline-aware")
    expect(event.metrics.historicalSampleCount).toBe(DETECTOR_DEFAULTS.MIN_BASELINE_SAMPLES)
  })

  test("zero-variance baseline deterministically suppresses an unchanged current level", async () => {
    const history = Array(DETECTOR_DEFAULTS.MIN_BASELINE_SAMPLES).fill(40)
    const results = Array.from({ length: 10 }, (_, i) => makeResult(`q${i}`, i < 7 ? 40 : 5, i === 0 ? history : []))
    expect(await makeDetector().detect(results, metadata(results), "user", NOW)).toHaveLength(0)
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

  test("missing baseline is omitted and remaining weights are renormalized", () => {
    const confidence = ConfidenceScorer.score(signals)
    expect(confidence.weightsUsed.historicalDeviation).toBeUndefined()
    expect(Object.values(confidence.weightsUsed).reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1)
    expect(confidence.value).toBeGreaterThan(0.7)
  })
})

describe("EvidenceBuilder", () => {
  test("aggregates movements, turnover, decomposition, and domains without recalculating drift", () => {
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
    const thresholds = { driftRateThreshold: .6, perQueryDriftThreshold: 30, minQueriesInCategory: 1, correlationWindowMs: 86_400_000, historicalWindowDays: 14, minBaselineSamples: 10, baselineDeviationThreshold: 2 }
    const evidence = EvidenceBuilder.build({ observedResults: [result], affectedResults: [result], queryMeta: metadata([result]), thresholds, baseline: { mean: 0, standardDeviation: 0, sampleCount: 0, available: false }, historicalDeviation: null, baselinePassed: true, windowStartMs: NOW - 86_400_000, windowEndMs: NOW })
    expect(evidence.averageAbsoluteRankMovement).toBe(5.5)
    expect(evidence.urlTurnoverCount).toBe(3)
    expect(evidence.domainsGained).toEqual(["gained.example"])
    expect(evidence.domainsLost).toEqual(["lost.example"])
    expect(evidence.rankingWinners[0].title).toBe("Winner")
    expect(evidence.rankingLosers[0].title).toBe("Loser")
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
})
