// app/services/analytics-service.ts
import { databases, DATABASE_ID, COLLECTIONS } from "@/app/server/appwrite";
import { Query } from "appwrite";
import type { AnalyticsData, RankingSnapshot } from "@/lib/type";
import { loadFromStorage, transformSnapshotDocument } from "./db-utils";
import { pipeline } from '@xenova/transformers'; // Optional clustering

export class AnalyticsService {
  private isLocal: boolean;
  constructor(isLocal: boolean) {
    this.isLocal = isLocal;
  }

 async getAnalytics(userId?: string, timeRangeMs?: number): Promise<AnalyticsData> { // Fixed: Accept number directly
    try {
      let snapshots: RankingSnapshot[] = [];

      if (this.isLocal) {
        snapshots = loadFromStorage<RankingSnapshot>("snapshots");
        if (userId) snapshots = snapshots.filter((s) => s.userId === userId);
        if (timeRangeMs) {
          const cutoff = Date.now() - timeRangeMs;
          snapshots = snapshots.filter(s => new Date(s.timestamp).getTime() > cutoff);
        }
      } else {
        const queries: string[] = userId ? [Query.equal("userId", userId)] : [];
        if (timeRangeMs) {
          const cutoff = new Date(Date.now() - timeRangeMs).toISOString();
          queries.push(Query.greaterThan("timestamp", cutoff)); // Filter by timestamp
        }
        const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.SNAPSHOTS, queries);
        snapshots = response.documents
          .map((doc) => {
            try {
              return transformSnapshotDocument(doc, this.isLocal);
            } catch (err) {
              console.warn("Failed to transform snapshot:", err);
              return null;
            }
          })
          .filter((snap): snap is RankingSnapshot => snap !== null);
      }

      console.log(`[AnalyticsService] Fetched ${snapshots.length} snapshots for user ${userId || 'all'}`);

      return this.calculateAnalyticsFromSnapshots(snapshots);
    } catch (error) {
      console.error("Failed to get analytics:", error);
      return {
        rankingStability: 0,
        volatilityIndex: 0,
        domainDiversity: 0,
        avgResponseTime: 0,
        newContentDiscovery: 0,
        querySuccessRate: 0,
        trendSlope: 0,
        predictedPosition: 0,
        isAnomaly: false,
      };
    }
  }

  calculateAnalyticsFromSnapshots(snapshots: RankingSnapshot[]): AnalyticsData {
    if (!snapshots || snapshots.length === 0) {
      console.warn("[AnalyticsService] No snapshots for calculation.");
      return {
        rankingStability: 0,
        volatilityIndex: 0,
        domainDiversity: 0,
        avgResponseTime: 0,
        newContentDiscovery: 0,
        querySuccessRate: 0,
        trendSlope: 0,
        predictedPosition: 0,
        isAnomaly: false,
      };
    }

    const snapshotsByQuery: Record<string, RankingSnapshot[]> = {};
    const seenUrls = new Set<string>();
    let totalResponseTime = 0;
    let successCount = 0;
    const domainSet = new Set<string>();
    let allPositions: number[] = []; // For overall trend calculation

    for (const snap of snapshots) {
      if (!snap.queryId) continue;
      if (!snap.results || !Array.isArray(snap.results)) continue;
      if (!snap.metadata || typeof snap.metadata.responseTime !== "number") continue;

      if (!snapshotsByQuery[snap.queryId]) snapshotsByQuery[snap.queryId] = [];
      snapshotsByQuery[snap.queryId].push(snap);

      totalResponseTime += snap.metadata.responseTime;
      if (snap.results.length > 0) successCount++;

      for (const result of snap.results) {
        if (!result.url) continue;
        try {
          const domain = new URL(result.url).hostname;
          domainSet.add(domain);
          seenUrls.add(result.url);
        } catch (e) {
          console.warn("Invalid URL in result:", e);
        }
      }

      // Collect positions for overall trend
      allPositions.push(...snap.results.map(r => r.position));
    }

    const avgResponseTime = snapshots.length > 0 ? totalResponseTime / snapshots.length : 0;
    const querySuccessRate = snapshots.length > 0 ? (successCount / snapshots.length) * 100 : 0;

    let totalRankChanges = 0;
    let totalComparisons = 0;
    let allVolatilities: number[] = [];

    Object.values(snapshotsByQuery).forEach((snaps) => {
      snaps.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      for (let i = 1; i < snaps.length; i++) {
        const prev = snaps[i - 1].results?.map((r) => r.url) || [];
        const curr = snaps[i].results?.map((r) => r.url) || [];
        const maxLength = Math.max(prev.length, curr.length);
        for (let j = 0; j < maxLength; j++) {
          const prevUrl = prev[j] || null;
          const currUrl = curr[j] || null;
          if (prevUrl && currUrl) {
            if (prevUrl !== currUrl) totalRankChanges++;
          } else {
            totalRankChanges++;
          }
          totalComparisons++;
        }
      }

      // Match logic's volatility
      const positions = snaps.flatMap(s => s.results.map(r => r.position));
      if (positions.length > 0) {
        const avg = positions.reduce((sum, pos) => sum + pos, 0) / positions.length;
        const variance = positions.reduce((sum, pos) => sum + Math.pow(pos - avg, 2), 0) / positions.length;
        allVolatilities.push(Math.sqrt(variance));
      }
    });

    const stabilityScore = totalComparisons > 0 ? 100 - (totalRankChanges / totalComparisons) * 100 : 100;
    const volatilityIndex = totalComparisons > 0 ? (totalRankChanges / totalComparisons) * 10 : 0;
    const averageNewContentPerSnapshot = snapshots.length > 0 ? seenUrls.size / snapshots.length : 0;

    // Match logic's trend and anomaly (overall)
    const trendSlope = allPositions.length < 2 ? 0 : (allPositions[allPositions.length - 1] - allPositions[0]) / (allPositions.length - 1);
    const predictedPosition = this.predictTrend(allPositions); // Fixed error - defined below

    let isAnomaly = false;
    if (allVolatilities.length > 0) {
      const meanVol = allVolatilities.reduce((sum, v) => sum + v, 0) / allVolatilities.length;
      const stdDev = Math.sqrt(allVolatilities.reduce((sum, v) => sum + Math.pow(v - meanVol, 2), 0) / allVolatilities.length);
      isAnomaly = allVolatilities.some(v => v > meanVol + 2 * stdDev);
    }

    return {
      rankingStability: parseFloat(stabilityScore.toFixed(2)),
      volatilityIndex: parseFloat(volatilityIndex.toFixed(2)),
      domainDiversity: domainSet.size,
      avgResponseTime: parseFloat(avgResponseTime.toFixed(2)),
      newContentDiscovery: parseFloat(averageNewContentPerSnapshot.toFixed(2)),
      querySuccessRate: parseFloat(querySuccessRate.toFixed(2)),
      trendSlope,
      predictedPosition,
      isAnomaly,
    };
  }

  // Added to fix 'predictTrend' error - matched from logic
  private predictTrend(positions: number[], forecastDays: number = 7): number {
    if (positions.length < 2) return positions[0] || 0;
    const n = positions.length;
    const sumX = positions.reduce((sum, _, i) => sum + i, 0);
    const sumY = positions.reduce((sum, y) => sum + y, 0);
    const sumXY = positions.reduce((sum, y, i) => sum + i * y, 0);
    const sumX2 = positions.reduce((sum, _, i) => sum + i * i, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    return intercept + slope * (n + forecastDays - 1);
  }
}
