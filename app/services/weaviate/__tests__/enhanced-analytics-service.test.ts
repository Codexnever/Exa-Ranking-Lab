import { EnhancedAnalyticsService } from "../analytics/enhanced-analytics-service"

describe("EnhancedAnalyticsService orchestration", () => {
  it("reuses one anomaly result set for metrics, clusters, and evolution", async () => {
    const detectContentAnomalies = jest.fn().mockResolvedValue([
      {
        queryId: "query-1",
        title: "Research paper",
        url: "https://example.com/paper",
        timestamp: new Date().toISOString(),
        anomalyScore: 3,
        vector: [1, 0],
      },
    ])
    const service = new EnhancedAnalyticsService(false, {
      detectContentAnomalies,
      getCacheStats: () => ({ totalVectors: 1 }),
    } as never)

    ;(service as unknown as { getSnapshotsForUser: jest.Mock }).getSnapshotsForUser = jest.fn().mockResolvedValue([])

    const result = await service.getSemanticAnalytics("user-1", 30 * 24 * 60 * 60 * 1000, [])

    expect(detectContentAnomalies).toHaveBeenCalledTimes(1)
    expect(detectContentAnomalies).toHaveBeenCalledWith("user-1", 30 * 24 * 60 * 60 * 1000)
    expect(result.semanticInsights?.contentAnomalies.count).toBe(1)
  })
})
