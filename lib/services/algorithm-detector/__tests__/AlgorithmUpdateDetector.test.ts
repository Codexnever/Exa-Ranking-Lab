import { AlgorithmUpdateDetector } from "../AlgorithmUpdateDetector"
import { ConfidenceScorer } from "../ConfidenceScorer"
import { DescriptionBuilder } from "../DescriptionBuilder"
import { EventPersistence } from "../EventPersistence"
import { NoHistoricalBaselineProvider } from "../HistoricalBaselineProvider"
import { SilentLogger } from "../logger"
import type { AlgorithmEventRepository, AlgorithmUpdateEvent, DetectionConfigOverride } from "../types"
import type { DriftAnalysisResult } from "@/types/type"

declare const describe: (name: string, fn: () => void) => void
declare const test: (name: string, fn: () => void | Promise<void>) => void
declare const expect: (value: unknown) => {
  toBe(expected: unknown): void
  toEqual(expected: unknown): void
  toHaveLength(expected: number): void
  toBeGreaterThan(expected: number): void
  toBeLessThanOrEqual(expected: number): void
  toContain(expected: string): void
  not: { toBe(expected: unknown): void }
}

const NOW = new Date("2026-08-04T12:00:00Z").getTime()

const repository: AlgorithmEventRepository = {
  async upsert(): Promise<void> {},
  async getRecent(): Promise<AlgorithmUpdateEvent[]> { return [] },
}

function makeDetector(config: DetectionConfigOverride = {}): AlgorithmUpdateDetector {
  return new AlgorithmUpdateDetector(
    config,
    new SilentLogger(),
    repository,
    new NoHistoricalBaselineProvider()
  )
}

function makeResult(queryId: string, latestDrift: number, hoursAgo = 0): DriftAnalysisResult {
  return {
    queryId,
    queryName: queryId,
    latestDrift,
    averageDrift: latestDrift,
    maxDrift: latestDrift,
    stability: latestDrift > 50 ? "volatile" : "stable",
    driftTrend: "stable",
    totalProcessingTime: 10,
    totalContentChanges: 0,
    averageCacheHitRate: 0.8,
    driftTimeline: [{
      timestamp: new Date(NOW - hoursAgo * 3_600_000),
      snapshotId: `snap_${queryId}`,
      previousSnapshotId: null,
      driftScore: latestDrift,
      rankChanges: [],
      newResults: 0,
      droppedResults: 0,
      contentChanges: 0,
      processingTime: 10,
    }],
  }
}

describe("ConfidenceScorer", () => {
  test("clamps confidence and maps severity bands", () => {
    expect(ConfidenceScorer.score({ driftRate: -1, avgDriftScore: -1, affectedQueryCount: -1, historicalDeviation: -1 }).score).toBe(0)
    expect(ConfidenceScorer.score({ driftRate: 999, avgDriftScore: 999, affectedQueryCount: 999, historicalDeviation: 999 }).score).toBeLessThanOrEqual(100)
    expect(ConfidenceScorer.severityFromScore(75)).toBe("major")
    expect(ConfidenceScorer.severityFromScore(50)).toBe("moderate")
    expect(ConfidenceScorer.severityFromScore(49)).toBe("minor")
  })

  test("strong coordinated drift has high confidence", () => {
    const result = ConfidenceScorer.score({ driftRate: 0.9, avgDriftScore: 75, affectedQueryCount: 15, historicalDeviation: 3.5 })
    expect(result.score).toBeGreaterThan(75)
    expect(result.severity).toBe("major")
  })
})

describe("AlgorithmUpdateDetector", () => {
  test("detects coordinated drift independently by category", async () => {
    const detector = makeDetector()
    const results = [
      makeResult("news1", 60), makeResult("news2", 65), makeResult("news3", 70),
      makeResult("gh1", 55), makeResult("gh2", 50), makeResult("gh3", 60),
    ]
    const metadata = results.map(result => ({
      id: result.queryId,
      name: result.queryName,
      category: result.queryId.startsWith("news") ? "news" : "github",
    }))
    const events = await detector.detect(results, metadata, "user1", NOW)
    expect(events).toHaveLength(2)
    expect(events.map(event => event.category).sort()).toEqual(["github", "news"])
  })

  test("applies category thresholds and correlation windows", async () => {
    const detector = makeDetector({ correlationWindowMs: 3_600_000 })
    const results = [makeResult("q1", 80), makeResult("q2", 75, 0.5), makeResult("q3", 70, 2)]
    const events = await detector.detect(results, results.map(result => ({ id: result.queryId, name: result.queryName, category: "news" })), "user1", NOW)
    expect(events).toHaveLength(0)
  })

  test("normalizes underscored category names", async () => {
    const detector = makeDetector()
    const results = [makeResult("q1", 40), makeResult("q2", 45)]
    const events = await detector.detect(results, results.map(result => ({ id: result.queryId, name: result.queryName, category: "research_paper" })), "user1", NOW)
    expect(events).toHaveLength(1)
    expect(events[0].category).toBe("research paper")
  })

  test("ignores non-finite drift values", async () => {
    const detector = makeDetector()
    const results = [makeResult("q1", Number.NaN), makeResult("q2", 60), makeResult("q3", 70)]
    const events = await detector.detect(results, results.map(result => ({ id: result.queryId, name: result.queryName, category: "github" })), "user1", NOW)
    expect(events).toHaveLength(1)
  })
})

describe("event presentation and identity", () => {
  const event: AlgorithmUpdateEvent = {
    id: "event",
    detectedAt: new Date(NOW),
    category: "news",
    severity: "major",
    affectedQueries: [{ queryId: "q1", queryName: "Query", driftScore: 65, timestamp: new Date(NOW) }],
    confidence: { score: 78, severity: "major", signals: { driftRate: 0.8, avgDriftScore: 65, affectedQueryCount: 1, historicalDeviation: 2 } },
    metrics: { totalQueriesInCategory: 5, affectedQueryCount: 4, driftRate: 0.8, avgDriftScore: 65, historicalAvgDrift: 20, historicalStdDev: 10, windowStartMs: NOW - 3_600_000, windowEndMs: NOW },
  }

  test("builds stable, category-specific event IDs", () => {
    const first = EventPersistence.buildEventId("news", NOW)
    expect(first).toBe(EventPersistence.buildEventId("news", NOW))
    expect(first).not.toBe(EventPersistence.buildEventId("github", NOW))
  })

  test("builds human and machine-readable descriptions", () => {
    expect(DescriptionBuilder.summary(event)).toContain("news")
    expect(DescriptionBuilder.detail(event)).toContain("78%")
    expect(DescriptionBuilder.label(event)).toBe("news:major:conf78")
  })
})
