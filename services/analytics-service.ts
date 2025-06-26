// AnalyticsService handles all analytics-related operations
import { databases, DATABASE_ID, COLLECTIONS } from "@/lib/appwrite"
import { Query } from "appwrite"
import type { AnalyticsData, RankingSnapshot } from "@/lib/types"
import { loadFromStorage, transformSnapshotDocument } from "./db-utils"

export class AnalyticsService {
  private isLocal: boolean
  constructor(isLocal: boolean) {
    this.isLocal = isLocal
  }

  async getAnalytics(userId?: string): Promise<AnalyticsData> {
    try {
      let snapshots: RankingSnapshot[];
      if (this.isLocal) {
        snapshots = loadFromStorage<RankingSnapshot>("snapshots");
        if (userId) snapshots = snapshots.filter((s) => s.userId === userId);
      } else {
        const queries = userId ? [Query.equal("userId", userId)] : [];
        const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.SNAPSHOTS, queries);
        snapshots = response.documents
          .map((doc) => {
            try {
              return transformSnapshotDocument(doc, this.isLocal);
            } catch (err) {
              return null;
            }
          })
          .filter((snap): snap is RankingSnapshot => snap !== null);
      }
      if (!snapshots || snapshots.length === 0) {
        return {
          rankingStability: 0,
          volatilityIndex: 0,
          domainDiversity: 0,
          avgResponseTime: 0,
          newContentDiscovery: 0,
          querySuccessRate: 0,
        };
      }
      const snapshotsByQuery: Record<string, RankingSnapshot[]> = {};
      const seenUrls = new Set<string>();
      let totalResponseTime = 0;
      let successCount = 0;
      const domainSet = new Set<string>();
      for (const snap of snapshots) {
        if (!snap.queryId) continue;
        if (!snap.results || !Array.isArray(snap.results)) continue;
        if (!snap.metadata || typeof snap.metadata.responseTime !== "number") continue;
        if (!snapshotsByQuery[snap.queryId]) {
          snapshotsByQuery[snap.queryId] = [];
        }
        snapshotsByQuery[snap.queryId].push(snap);
        totalResponseTime += snap.metadata.responseTime;
        if (snap.results.length > 0) successCount++;
        for (const result of snap.results) {
          try {
            const domain = new URL(result.url).hostname;
            domainSet.add(domain);
            seenUrls.add(result.url);
          } catch (e) {}
        }
      }
      const avgResponseTime = totalResponseTime / snapshots.length;
      const querySuccessRate = (successCount / snapshots.length) * 100;
      let totalRankChanges = 0;
      let totalComparisons = 0;
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
      });
      const stabilityScore =
        totalComparisons > 0 ? 100 - (totalRankChanges / totalComparisons) * 100 : 100;
      const volatilityIndex =
        totalComparisons > 0 ? (totalRankChanges / totalComparisons) * 10 : 0;
      const averageNewContentPerSnapshot = seenUrls.size / snapshots.length;
      return {
        rankingStability: parseFloat(stabilityScore.toFixed(2)),
        volatilityIndex: parseFloat(volatilityIndex.toFixed(2)),
        domainDiversity: domainSet.size,
        avgResponseTime: parseFloat(avgResponseTime.toFixed(2)),
        newContentDiscovery: parseFloat(averageNewContentPerSnapshot.toFixed(2)),
        querySuccessRate: parseFloat(querySuccessRate.toFixed(2)),
      };
    } catch (error) {
      console.error("Failed to calculate analytics:", error);
      return {
        rankingStability: 0,
        volatilityIndex: 0,
        domainDiversity: 0,
        avgResponseTime: 0,
        newContentDiscovery: 0,
        querySuccessRate: 0,
      };
    }
  }
}
