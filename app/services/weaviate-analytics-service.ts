// app/services/WeaviateAnalyticsService.ts
import { WeaviateService } from './weaviate-service';
import { AnalyticsService } from './analytics-service';
import { analyticsCalculations } from '@/app/logic/analyticsLogic';
import type { 
  RankingSnapshot, 
  QueryConfig, 
  AnalyticsData,
  EnhancedAnalyticsData,
  HourlyStats
} from '@/lib/type';

export interface ContentAnomaly {
  type: string;
  queryId: string;
  url: string;
  title: string;
  anomalyScore: number;
  timestamp: Date;
  description: string;
}

export interface SemanticInsights {
  contentAnomalies: {
    count: number;
    anomalies: ContentAnomaly[];
    severityDistribution: { low: number; medium: number; high: number; critical: number; };
  };
  semanticClusters: {
    clusters: Array<any>;
    diversity: number;
    dominantThemes: string[];
  };
  contentEvolution: {
    periods: any[];
    overallTrend: string;
    volatility: number;
    trendDirection: "improving" | "declining" | "stable";
    discoveryRate: number;
    stabilityTrend: any[];
    contentTurnover: number;
  };
  weaviateMetrics: any;
}

export interface EnhancedMetrics {
  semanticStability: number;
  contentCoherence: number;
  diversityIndex: number;
  anomalyCount: number;
  clusterQuality: number;
  vectorSpaceUtilization: number;
}

export interface WeaviateAnalyticsData extends EnhancedAnalyticsData {
  semanticInsights: SemanticInsights;
  enhancedMetrics: EnhancedMetrics;
  isWeaviateSource: boolean;
}

// ✅ TUPLE FIXING UTILITY
function fixHourlyStats(arr: any[]): HourlyStats[] {
  return (arr || []).map((h: any) => ({
    ...h,
    confidenceInterval: Array.isArray(h.confidenceInterval) && h.confidenceInterval.length === 2
      ? [Number(h.confidenceInterval[0]), Number(h.confidenceInterval)]
      : [0, 0]
  }));
}

function fixTopPerformingQueries(arr: any[]): any[] {
  return (arr || []).map(item => {
    const validTrends = ['up', 'down', 'stable'];
    const trend: 'up' | 'down' | 'stable' = validTrends.includes(item.trend) ? item.trend : 'stable';
    return { ...item, trend };
  });
}

export class WeaviateAnalyticsService extends AnalyticsService {
  private weaviate: WeaviateService;

  constructor(isLocal: boolean, weaviateService: WeaviateService) {
    super(isLocal);
    this.weaviate = weaviateService;
  }

  async getAnalytics(
    userId: string, 
    timeRangeMs: number,
    queries: QueryConfig[] = []
  ): Promise<WeaviateAnalyticsData> {
    try {
      // Step 1: Export vector-enabled snapshots from Weaviate
      const normalizedSnapshots = await this.exportSnapshotsFromWeaviate(userId, timeRangeMs);

      if (!normalizedSnapshots.length) {
        console.warn("[WeaviateAnalyticsService] No snapshots available for analysis");
        return this.getEmptyWeaviateAnalytics();
      }

      // Step 2: Unified analytics calculations
      const timeRange = this.getTimeRangeString(timeRangeMs);
      const unifiedAnalytics = analyticsCalculations(queries, normalizedSnapshots, timeRange);

      // Step 3: Weaviate-specific semantic insights and metrics
      const [rawAnomalies, rawClusters, rawEvolution] = await Promise.all([
        this.weaviate.detectContentAnomalies(userId, timeRangeMs),
        this.analyzeSemanticClusters(userId, timeRangeMs),
        this.analyzeContentEvolution(userId, timeRangeMs)
      ]);

      // ✅ FIX TUPLE ISSUES
      const successRateByHour = fixHourlyStats(unifiedAnalytics.successRateByHour);
      const performanceData = fixHourlyStats(unifiedAnalytics.performanceData);
      const topPerformingQueries = fixTopPerformingQueries(unifiedAnalytics.topPerformingQueries);

      // Step 4: Compose semanticInsights to match your SemanticInsights interface
      const semanticInsights: SemanticInsights = {
        contentAnomalies: {
          count: rawAnomalies.length,
          anomalies: rawAnomalies,
          severityDistribution: this.categorizeAnomalies(rawAnomalies)
        },
        semanticClusters: {
          clusters: rawClusters,
          diversity: this.calculateSemanticDiversity(rawClusters),
          dominantThemes: this.extractDominantThemes(rawClusters)
        },
        contentEvolution: this.buildContentEvolution(rawEvolution),
        weaviateMetrics: this.weaviate.getCacheStats()
      };

      // Step 5: Calculate enhancedMetrics
      const enhancedMetrics = this.calculateEnhancedMetrics(
        normalizedSnapshots,
        rawClusters,
        rawAnomalies
      );

      // Step 6: Merge everything and ensure type safety
      return {
        ...unifiedAnalytics,
        successRateByHour, // ✅ Fixed tuple type
        performanceData,   // ✅ Fixed tuple type
        topPerformingQueries, // ✅ Fixed union type
        semanticInsights,
        enhancedMetrics,
        isWeaviateSource: true,
        dataSourceType: 'weaviate',
        calculatedAt: new Date().toISOString(),
        rankingStability: enhancedMetrics.semanticStability,
        volatilityIndex: this.calculateVolatilityFromClusters(rawClusters),
        domainDiversity: enhancedMetrics.diversityIndex,
        newContentDiscovery: (rawEvolution?.discoveryRate || 0),
        isAnomaly: rawAnomalies.length > 0
      };
    } catch (error) {
      console.error("[WeaviateAnalyticsService] getAnalytics failed:", error);
      return this.getEmptyWeaviateAnalytics();
    }
  }

  // Helper for interface-shape contentEvolution
  private buildContentEvolution(evolution: any): SemanticInsights["contentEvolution"] {
    return {
      periods: evolution.periods || [],
      overallTrend: evolution.overallTrend || "stable",
      volatility: evolution.volatility || 0,
      trendDirection: evolution.trendDirection || "stable",
      discoveryRate: evolution.discoveryRate || 0,
      stabilityTrend: evolution.stabilityTrend || [],
      contentTurnover: evolution.contentTurnover || 0
    };
  }

  // Helper for interface-shape anomaly severityDistribution
  private categorizeAnomalies(anomalies: ContentAnomaly[]): { low: number; medium: number; high: number; critical: number; } {
    const dist = { low: 0, medium: 0, high: 0, critical: 0 };
    anomalies.forEach(anomaly => {
      if (anomaly.anomalyScore < 1) dist.low++;
      else if (anomaly.anomalyScore < 2) dist.medium++;
      else if (anomaly.anomalyScore < 3) dist.high++;
      else dist.critical++;
    });
    return dist;
  }

  private calculateSemanticDiversity(clusters: any[]): number {
    // Shannon entropy based diversity
    if (!clusters.length) return 0;
    const total = clusters.reduce((sum, c) => sum + (c.size || 0), 0);
    if (!total) return 0;
    const entropy = clusters.reduce((H, cluster) => {
      const prop = (cluster.size || 0) / total;
      return prop > 0 ? H - prop * Math.log2(prop) : H;
    }, 0);
    const maxEntropy = Math.log2(clusters.length);
    return maxEntropy > 0 ? entropy / maxEntropy : 0;
  }

  private extractDominantThemes(clusters: any[]): string[] {
    return clusters
      .slice()
      .sort((a, b) => (b.size || 0) - (a.size || 0))
      .map(cluster => cluster.theme)
      .filter((theme, i, arr) => arr.indexOf(theme) === i)
      .slice(0, 5);
  }

  private determineEvolutionTrend(evolution: any): "improving" | "declining" | "stable" {
    // Basic slope-based logic
    if (!evolution.periods || evolution.periods.length < 2) return "stable";
    const recent = evolution.periods.slice(-3);
    const vals = recent.map((p: any) => p.stability);
    const slope = this.linearSlope(vals);
    if (slope > 0.1) return "improving";
    if (slope < -0.1) return "declining";
    return "stable";
  }

  private linearSlope(vals: number[]): number {
    if (vals.length < 2) return 0;
    const n = vals.length;
    const sumX = vals.reduce((sum, _, i) => sum + i, 0);
    const sumY = vals.reduce((sum, y) => sum + y, 0);
    const sumXY = vals.reduce((sum, y, i) => sum + i * y, 0);
    const sumX2 = vals.reduce((sum, _, i) => sum + i * i, 0);
    const denom = n * sumX2 - sumX * sumX;
    if (denom === 0) return 0;
    return (n * sumXY - sumX * sumY) / denom;
  }

  /**
   * KEPT: Weaviate-specific data fetching with vectors
   */
  private async exportSnapshotsFromWeaviate(userId: string, timeRangeMs: number): Promise<RankingSnapshot[]> {
    try {
      await this.weaviate.initialize();

      const cutoffDate = new Date(Date.now() - timeRangeMs).toISOString();
      
      const result = await this.weaviate.client.graphql
        .get()
        .withClassName("SearchResult")
        .withFields(`
          url title snippet domain position score queryId snapshotId userId timestamp contentHash category
          _additional { certainty distance vector }
        `)
        .withWhere({
          operator: "And",
          operands: [
            { path: ["userId"], operator: "Equal", valueText: userId },
            { path: ["timestamp"], operator: "GreaterThan", valueDate: cutoffDate },
          ],
        })
        .withLimit(3000)
        .do();

      const items: any[] = result.data?.Get?.SearchResult || [];
      if (!items.length) {
        console.log(`[WeaviateAnalyticsService] No items found for user ${userId}`);
        return [];
      }

      // Group by snapshotId if present; else by day+queryId
      const groups = new Map<string, any[]>();
      for (const item of items) {
        const dateKey = new Date(item.timestamp).toISOString().split("T")[0];
        const key = item.snapshotId || `${item.queryId || "unknown"}_${dateKey}`;
        
        if (!groups.has(key)) {
          groups.set(key, []);
        }
        groups.get(key)!.push(item);
      }

      const snapshots: RankingSnapshot[] = [];
      for (const [key, group] of groups.entries()) {
        if (!group.length) continue;

        const head = group[0];
        const queryId = head.queryId || "unknown";
        const userIdVal = head.userId || userId;
        const snapshotId = head.snapshotId || key;

        const results = group
          .map((item: any, idx: number) => ({
            id: `${item.queryId || "q"}_${idx + 1}`,
            url: item.url || "",
            title: item.title || "",
            snippet: item.snippet || "",
            position: Number(item.position) || idx + 1,
            domain: item.domain || "",
            contentType: "article" as const,
            score: typeof item.score === "number" ? item.score : 0,
            timestamp: new Date(item.timestamp),
            contentHash: item.contentHash || "",
            vector: item._additional?.vector || undefined // ← KEY: Include vectors
          }))
          .sort((a: any, b: any) => (a.position || 0) - (b.position || 0));

        snapshots.push({
          id: snapshotId,
          queryId,
          userId: userIdVal,
          results,
          metadata: {
            totalResults: results.length,
            responseTime: 0,
            executedAt: new Date().toISOString(),
            source: "weaviate_export",
            isFromWeaviate: true,
          } as any,
          timestamp: new Date(head.timestamp),
          queryType: head.category || "unknown",
        });
      }

      return snapshots.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

    } catch (error) {
      console.error("[WeaviateAnalyticsService] Error in exportSnapshotsFromWeaviate:", error);
      return [];
    }
  }

  /**
   * KEPT: Weaviate-specific semantic clustering analysis
   */
  private async analyzeSemanticClusters(userId: string, timeRangeMs: number) {
    try {
      const cutoffDate = new Date(Date.now() - timeRangeMs).toISOString();
      
      const result = await this.weaviate.client.graphql
        .get()
        .withClassName('SearchResult')
        .withFields(`
          queryId title snippet url
          _additional { vector }
        `)
        .withWhere({
          operator: 'And',
          operands: [
            { path: ['userId'], operator: 'Equal', valueText: userId },
            { path: ['timestamp'], operator: 'GreaterThan', valueDate: cutoffDate }
          ]
        })
        .withLimit(200)
        .do();

      const items = (result.data?.Get?.SearchResult || []) as any[];
      
      if (items.length < 3) return [];

      // Group by queryId for cluster analysis
      const queryGroups = new Map<string, any[]>();
      items.forEach(item => {
        const queryId = item.queryId || 'unknown';
        if (!queryGroups.has(queryId)) {
          queryGroups.set(queryId, []);
        }
        queryGroups.get(queryId)!.push(item);
      });

      const clusters: any[] = [];
      queryGroups.forEach((groupItems, queryId) => {
        if (groupItems.length < 2) return;

        const coherence = this.calculateClusterCoherence(groupItems);
        const avgVector = this.calculateAverageVector(groupItems.map(i => i._additional.vector));
        
        clusters.push({
          id: queryId,
          queryIds: [queryId],
          items: groupItems.map(item => ({
            id: `${queryId}_${item.url}`,
            queryId,
            content: `${item.title} ${item.snippet}`.trim(),
            url: item.url,
            similarity: 1.0,
            vector: item._additional.vector
          })),
          centroid: avgVector,
          coherence,
          theme: this.generateClusterTheme(groupItems),
          size: groupItems.length
        });
      });

      return clusters.sort((a, b) => b.coherence - a.coherence);
    } catch (error) {
      console.error('[WeaviateAnalyticsService] Error in analyzeSemanticClusters:', error);
      return [];
    }
  }

  private async analyzeContentEvolution(userId: string, timeRangeMs: number) {
    const snapshots = await this.exportSnapshotsFromWeaviate(userId, timeRangeMs);
    const uniqueUrls = new Set();
    
    snapshots.forEach(s => {
      s.results?.forEach(r => {
        if (r.url) uniqueUrls.add(r.url);
      });
    });
    
    return {
      discoveryRate: snapshots.length > 0 ? uniqueUrls.size / snapshots.length : 0,
      stabilityTrend: [],
      contentTurnover: snapshots.length > 1 ? uniqueUrls.size / snapshots.length : 0
    };
  }

  /**
   * KEPT: Weaviate-specific vector calculations
   */
  private calculateClusterCoherence(items: any[]): number {
    if (items.length < 2) return 1.0;

    const vectors = items.map(i => i._additional?.vector).filter(Boolean);
    if (vectors.length < 2) return 0.5;

    let totalSimilarity = 0;
    let pairCount = 0;

    for (let i = 0; i < vectors.length - 1; i++) {
      for (let j = i + 1; j < vectors.length; j++) {
        totalSimilarity += this.cosineSimilarity(vectors[i], vectors[j]);
        pairCount++;
      }
    }

    return pairCount > 0 ? totalSimilarity / pairCount : 0.5;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (!a?.length || !b?.length || a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator > 0 ? dotProduct / denominator : 0;
  }

  private calculateEnhancedMetrics(
    snapshots: RankingSnapshot[],
    clusters: any[],
    anomalies: any[]
  ): EnhancedMetrics {
    const semanticStability = clusters.length > 0 
      ? clusters.reduce((sum, c) => sum + c.coherence, 0) / clusters.length * 100
      : 50;

    const contentCoherence = clusters.length > 0
      ? Math.min(95, semanticStability + (clusters.filter(c => c.coherence > 0.8).length / clusters.length) * 20)
      : 50;

    const diversityIndex = this.calculateDiversityIndex(snapshots);

    return {
      semanticStability,
      contentCoherence,
      diversityIndex,
      anomalyCount: anomalies.length,
      clusterQuality: contentCoherence / 100,
      vectorSpaceUtilization: Math.min(100, clusters.length * 10)
    };
  }

  /**
   * KEPT: Utility methods
   */
  private calculateVolatilityFromClusters(clusters: any[]): number {
    if (!clusters.length) return 0;
    const coherences = clusters.map(c => c.coherence);
    const variance = coherences.reduce((sum, c) => sum + Math.pow(c - 0.5, 2), 0) / coherences.length;
    return Math.sqrt(variance) * 100;
  }

  private calculateDiversityIndex(snapshots: RankingSnapshot[]): number {
    const domains = new Set();
    snapshots.forEach(s => {
      s.results?.forEach(r => {
        if (r.domain) domains.add(r.domain);
      });
    });
    return Math.min(100, domains.size * 5);
  }

  private calculateAverageVector(vectors: number[][]): number[] {
    if (!vectors.length) return [];
    const length = vectors[0]?.length || 0;
    if (!length) return [];

    const avg = new Array(length).fill(0);
    vectors.forEach(vector => {
      vector.forEach((val, idx) => {
        avg[idx] += val / vectors.length;
      });
    });
    return avg;
  }

  private generateClusterTheme(items: any[]): string {
    const titles = items.map(i => i.title || '').join(' ');
    const words = titles.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const wordCount = new Map<string, number>();
    
    words.forEach(word => {
      wordCount.set(word, (wordCount.get(word) || 0) + 1);
    });
    
    const mostCommon = [...wordCount.entries()]
      .sort(([,a], [,b]) => b - a)[0];
    
    return mostCommon ? mostCommon[0] : 'mixed_content';
  }

  private getEmptyWeaviateAnalytics(): WeaviateAnalyticsData {
    return {
      ...super.getDefaultEnhancedAnalytics(),
      semanticInsights: {
        contentAnomalies: {
          count: 0,
          anomalies: [],
          severityDistribution: { low: 0, medium: 0, high: 0, critical: 0 }
        },
        semanticClusters: {
          clusters: [],
          diversity: 0,
          dominantThemes: []
        },
        contentEvolution: {
          periods: [],
          overallTrend: "stable",
          volatility: 0,
          trendDirection: "stable",
          discoveryRate: 0,
          stabilityTrend: [],
          contentTurnover: 0
        },
        weaviateMetrics: {
          totalVectors: 0,
          avgSimilarity: 0,
          clusterCount: 0,
          isConnected: false,
          cacheStats: { size: 0, hitRate: 0, maxSize: 0 }
        }
      },
      enhancedMetrics: {
        semanticStability: 0,
        contentCoherence: 0,
        diversityIndex: 0,
        anomalyCount: 0,
        clusterQuality: 0,
        vectorSpaceUtilization: 0
      },
      isWeaviateSource: true,
      dataSourceType: 'weaviate'
    };
  }
}
