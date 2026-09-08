import { detectDriftThresholdCrossings } from "../DriftAlertService"
import { getNotificationsCollectionId } from "@/lib/services/notification-config"
import type { DriftAnalysisResult } from "@/types/type"

function result(previous: number, current: number): DriftAnalysisResult {
  return {
    queryId: "q1",
    queryName: "Query one",
    latestDrift: current,
    averageDrift: current,
    maxDrift: current,
    stability: "volatile",
    driftTrend: "worsening",
    totalProcessingTime: 1,
    totalContentChanges: 0,
    averageCacheHitRate: 0,
    driftTimeline: [previous, current].map((driftScore, index) => ({
      timestamp: new Date(2026, 0, index + 1),
      snapshotId: `s${index}`,
      previousSnapshotId: index ? "s0" : null,
      driftScore,
      rankChanges: [],
      newResults: 0,
      droppedResults: 0,
      contentChanges: 0,
      processingTime: 1,
    })),
  }
}

describe("drift alert correctness", () => {
  test("creates one alert only when a threshold is crossed", () => {
    expect(detectDriftThresholdCrossings([result(59, 70)])).toHaveLength(1)
    expect(detectDriftThresholdCrossings([result(70, 72)])).toHaveLength(0)
  })

  test("reports missing notification collection configuration", () => {
    const previous = process.env.COLLECTION_NOTIFICATIONS
    delete process.env.COLLECTION_NOTIFICATIONS
    expect(() => getNotificationsCollectionId()).toThrow("Notification storage is not configured")
    if (previous === undefined) delete process.env.COLLECTION_NOTIFICATIONS
    else process.env.COLLECTION_NOTIFICATIONS = previous
  })
})
