// app/services/analytics-service.ts
import { databases, DATABASE_ID, COLLECTIONS } from "@/app/server/appwrite";
import { Query } from "appwrite";
import type { AnalyticsData, RankingSnapshot } from "@/lib/type";
import { loadFromStorage, transformSnapshotDocument } from "./db-utils";

export class AnalyticsService {
  private isLocal: boolean;
  constructor(isLocal: boolean) {
    this.isLocal = isLocal;
  }

  async getAnalytics(userId?: string, timeRangeMs?: number): Promise<AnalyticsData> {
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
          queries.push(Query.greaterThan("timestamp", cutoff));
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
      return this.getDefaultAnalytics();
    }
  }

  /**
   * Calculates analytics from snapshots with proper deduplication handling
   * This method recalculates metrics that are affected by deduplication
   */
  calculateAnalyticsFromSnapshots(snapshots: RankingSnapshot[]): AnalyticsData {
    if (!snapshots || snapshots.length === 0) {
      console.warn("[AnalyticsService] No snapshots for calculation.");
      return this.getDefaultAnalytics();
    }

    // Store original response times before any processing
    const originalResponseTimes = snapshots
      .filter(snap => snap.metadata?.responseTime)
      .map(snap => snap.metadata.responseTime);

    const snapshotsByQuery: Record<string, RankingSnapshot[]> = {};
    const seenUrls = new Set<string>();
    const domainSet = new Set<string>();
    let allPositions: number[] = [];

    // Process each snapshot
    for (const snap of snapshots) {
      if (!snap.queryId) continue;
      if (!snap.results || !Array.isArray(snap.results)) continue;
      if (!snap.metadata || typeof snap.metadata.responseTime !== "number") continue;

      // Group by query for stability calculations
      if (!snapshotsByQuery[snap.queryId]) snapshotsByQuery[snap.queryId] = [];
      snapshotsByQuery[snap.queryId].push(snap);

      // Process results for diversity and URL tracking
      for (const result of snap.results) {
        if (!result.url) continue;
        
        try {
          // Domain diversity calculation (will change with deduplication)
          const domain = new URL(result.url).hostname;
          domainSet.add(domain);
          
          // URL tracking for content discovery (will change with deduplication)
          seenUrls.add(result.url);
          
          // Position tracking for trend analysis (will change with deduplication)
          allPositions.push(result.position);
        } catch (e) {
          console.warn("Invalid URL in result:", e);
        }
      }
    }

    // Calculate metrics that are AFFECTED by deduplication
    const { stabilityScore, volatilityIndex } = this.calculateRankingMetrics(snapshotsByQuery);
    const domainDiversity = domainSet.size; // CHANGES with deduplication
    const newContentDiscovery = snapshots.length > 0 ? seenUrls.size / snapshots.length : 0; // CHANGES

    // Calculate metrics that are NOT affected by deduplication
    const avgResponseTime = originalResponseTimes.length > 0 
      ? originalResponseTimes.reduce((sum, time) => sum + time, 0) / originalResponseTimes.length 
      : 0; // UNCHANGED by deduplication

    const querySuccessRate = snapshots.length > 0 
      ? (snapshots.filter(s => s.results.length > 0).length / snapshots.length) * 100 
      : 0; // UNCHANGED by deduplication

    // Calculate trend metrics (affected by deduplication)
    const trendSlope = this.calculateTrendSlope(allPositions);
    const predictedPosition = this.predictTrend(allPositions);
    const isAnomaly = this.detectAnomalies(snapshotsByQuery);

    return {
      rankingStability: parseFloat(stabilityScore.toFixed(2)),
      volatilityIndex: parseFloat(volatilityIndex.toFixed(2)),
      domainDiversity,
      avgResponseTime: parseFloat(avgResponseTime.toFixed(2)),
      newContentDiscovery: parseFloat(newContentDiscovery.toFixed(2)),
      querySuccessRate: parseFloat(querySuccessRate.toFixed(2)),
      trendSlope,
      predictedPosition,
      isAnomaly,
    };
  }

  /**
   * Calculates ranking stability and volatility metrics
   * These metrics CHANGE with deduplication as they depend on position comparisons
   */
  private calculateRankingMetrics(snapshotsByQuery: Record<string, RankingSnapshot[]>) {
    let totalRankChanges = 0;
    let totalComparisons = 0;

    Object.values(snapshotsByQuery).forEach((snaps) => {
      // Sort by timestamp for chronological comparison
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
            totalRankChanges++; // Position appeared or disappeared
          }
          totalComparisons++;
        }
      }
    });

    const stabilityScore = totalComparisons > 0 
      ? 100 - (totalRankChanges / totalComparisons) * 100 
      : 100;
    
    const volatilityIndex = totalComparisons > 0 
      ? (totalRankChanges / totalComparisons) * 10 
      : 0;

    return { stabilityScore, volatilityIndex };
  }

  /**
   * Calculates trend slope from position data
   * This metric CHANGES with deduplication
   */
  private calculateTrendSlope(allPositions: number[]): number {
    if (allPositions.length < 2) return 0;
    const firstPos = allPositions[0];
    const lastPos = allPositions[allPositions.length - 1];
    return (lastPos - firstPos) / (allPositions.length - 1);
  }

  /**
   * Predicts future ranking positions using linear regression
   * This metric CHANGES with deduplication
   */
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

  /**
   * Detects anomalies in ranking patterns
   * This metric CHANGES with deduplication
   */
  private detectAnomalies(snapshotsByQuery: Record<string, RankingSnapshot[]>): boolean {
    const allVolatilities: number[] = [];

    Object.values(snapshotsByQuery).forEach((snaps) => {
      const positions = snaps.flatMap(s => s.results.map(r => r.position));
      if (positions.length > 0) {
        const avg = positions.reduce((sum, pos) => sum + pos, 0) / positions.length;
        const variance = positions.reduce((sum, pos) => sum + Math.pow(pos - avg, 2), 0) / positions.length;
        allVolatilities.push(Math.sqrt(variance));
      }
    });

    if (allVolatilities.length === 0) return false;

    const meanVol = allVolatilities.reduce((sum, v) => sum + v, 0) / allVolatilities.length;
    const stdDev = Math.sqrt(allVolatilities.reduce((sum, v) => sum + Math.pow(v - meanVol, 2), 0) / allVolatilities.length);
    
    return allVolatilities.some(v => v > meanVol + 2 * stdDev);
  }

  /**
   * Returns default analytics when no data is available
   */
  private getDefaultAnalytics(): AnalyticsData {
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
