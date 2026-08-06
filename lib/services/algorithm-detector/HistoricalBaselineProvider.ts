import { getAlgorithmEventsCollection } from "./constants"
import type { HistoricalBaseline, HistoricalBaselineProvider } from "./types"

export class AppwriteHistoricalBaselineProvider implements HistoricalBaselineProvider {
  async getBaseline(userId: string, category: string, windowDays: number): Promise<HistoricalBaseline> {
    const { databases, DATABASE_ID, Query } = await import("@/app/server/appwrite/appwrite-server")
    const since = new Date(Date.now() - windowDays * 86_400_000).toISOString()
    const result = await databases.listDocuments(
      DATABASE_ID,
      getAlgorithmEventsCollection(),
      [
        Query.equal("userId", userId),
        Query.equal("category", category),
        Query.greaterThan("detectedAt", since),
        Query.orderDesc("detectedAt"),
        Query.limit(30),
      ]
    )
    const scores = result.documents
      .map(document => Number(document.avgDriftScore))
      .filter(Number.isFinite)
    if (scores.length === 0) return { avg: 0, stdDev: 0 }
    const avg = scores.reduce((sum, score) => sum + score, 0) / scores.length
    const variance = scores.reduce((sum, score) => sum + (score - avg) ** 2, 0) / scores.length
    return { avg, stdDev: Math.sqrt(variance) }
  }
}

export class NoHistoricalBaselineProvider implements HistoricalBaselineProvider {
  async getBaseline(): Promise<HistoricalBaseline> {
    return { avg: 0, stdDev: 0 }
  }
}
