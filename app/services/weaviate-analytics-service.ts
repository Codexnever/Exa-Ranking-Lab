// app/services/WeaviateAnalyticsService.ts
import { WeaviateService } from './weaviate-service';
import { AnalyticsService } from './analytics-service';
import { analyticsCalculations } from '@/app/logic/analyticsLogic';
import type { 
  RankingSnapshot, 
  QueryConfig, 
  AnalyticsData
} from '@/lib/type';

export interface SemanticInsights {
  contentAnomalies: Array<{
    type: string;
    queryId: string;
    url: string;
    title: string;
    anomalyScore: number;
    timestamp: Date;
    description: string;
  }>;
  semanticClusters: Array<{
    id: string;
    queryIds: string[];
    coherence: number;
    theme: string;
    size: number;
    items?: Array<{
      id: string;
      queryId: string;
      content: string;
      url: string;
      similarity: number;
      vector?: number[];
    }>;
    centroid?: number[];
  }>;
  contentEvolution: {
    discoveryRate: number;
    stabilityTrend: any[];
    contentTurnover: number;
  };
  weaviateMetrics: {
    totalVectors: number;
    avgSimilarity: number;
    clusterCount: number;
    isConnected: boolean;
    cacheStats: any;
  };
}

export interface EnhancedMetrics {
  semanticStability: number;
  contentCoherence: number;
  diversityIndex: number;
  anomalyCount: number;
  clusterQuality: number;
  vectorSpaceUtilization: number;
}

export interface WeaviateAnalyticsData extends AnalyticsData {
  semanticInsights: SemanticInsights;
  enhancedMetrics: EnhancedMetrics;
  isWeaviateSource: boolean;
}

export class WeaviateAnalyticsService extends AnalyticsService {
  private weaviate: WeaviateService;

  constructor(isLocal: boolean, weaviateService: WeaviateService) {
    super(isLocal);
    this.weaviate = weaviateService;
  }

  async getSemanticAnalyticsMerged(
    userId: string, 
    timeRangeMs: number,
    queries: QueryConfig[] = []
  ): Promise<WeaviateAnalyticsData> {
    try {
      // Step 1: Export and normalize snapshots from Weaviate
      const normalizedSnapshots = await this.exportSnapshotsFromWeaviate(userId, timeRangeMs);
      
      if (!normalizedSnapshots.length) {
        console.warn("[WeaviateAnalyticsService] No snapshots available for analysis");
        return this.getEmptyWeaviateAnalytics();
      }

      // Step 2: Run base analytics calculations using shared logic
      const timeRange = this.getTimeRangeString(timeRangeMs);
      const baseCalculations = analyticsCalculations(
        queries,
        normalizedSnapshots,
        timeRange,
        {},
        'latest'
      );

      // Step 3: Generate semantic insights in parallel
      const [contentAnomalies, semanticClusters, contentEvolution] = await Promise.all([
        this.weaviate.detectContentAnomalies(userId, timeRangeMs),
        this.analyzeSemanticClusters(userId, timeRangeMs),
        this.analyzeContentEvolution(userId, timeRangeMs)
      ]);

      // Step 4: Calculate enhanced metrics
      const enhancedMetrics = this.calculateEnhancedMetrics(
        normalizedSnapshots,
        semanticClusters,
        contentAnomalies
      );

      // Step 5: Build semantic insights
      const semanticInsights: SemanticInsights = {
        contentAnomalies: contentAnomalies.map(anomaly => ({
          type: anomaly.type,
          queryId: anomaly.queryId,
          url: anomaly.url,
          title: anomaly.title,
          anomalyScore: anomaly.anomalyScore,
          timestamp: new Date(anomaly.timestamp),
          description: this.getAnomalyDescription(anomaly)
        })),
        semanticClusters,
        contentEvolution,
        weaviateMetrics: {
          totalVectors: normalizedSnapshots.reduce((sum, s) => sum + s.results.length, 0),
          avgSimilarity: this.calculateAverageSimilarity(contentAnomalies),
          clusterCount: semanticClusters.length,
          isConnected: this.weaviate.isWeaviateConnected(),
          cacheStats: this.weaviate.getCacheStats()
        }
      };

      // Step 6: Calculate traditional metrics from normalized snapshots
      const traditionalMetrics = this.calculateTraditionalMetrics(normalizedSnapshots);

      // Step 7: Merge everything together
      return {
        // Base analytics from analyticsCalculations
        ...baseCalculations,
        
        // Traditional metrics calculated from snapshots
        ...traditionalMetrics,
        
        // Semantic insights and enhanced metrics
        semanticInsights,
        enhancedMetrics,
        isWeaviateSource: true,

        // Override certain metrics with semantic-enhanced versions
        rankingStability: enhancedMetrics.semanticStability,
        volatilityIndex: this.calculateVolatilityFromClusters(semanticClusters),
        domainDiversity: enhancedMetrics.diversityIndex,
        newContentDiscovery: contentEvolution.discoveryRate,
        isAnomaly: contentAnomalies.length > 0
      };

    } catch (error) {
      console.error("[WeaviateAnalyticsService] getSemanticAnalyticsMerged failed:", error);
      return this.getEmptyWeaviateAnalytics();
    }
  }

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
            contentType: "text/html" as const,
            score: typeof item.score === "number" ? item.score : 0,
            timestamp: new Date(item.timestamp),
            contentHash: item.contentHash || "",
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

  private calculateTraditionalMetrics(snapshots: RankingSnapshot[]) {
    const querySuccessRate = snapshots.length > 0 
      ? (snapshots.filter(s => s.results && s.results.length > 0).length / snapshots.length) * 100 
      : 0;

    const allPositions = snapshots.flatMap(s => 
      s.results?.map(r => r.position || 0) || []
    );

    const trendSlope = this.calculateTrendSlope(allPositions);
    const predictedPosition = this.predictTrend(allPositions);

    return {
      querySuccessRate: parseFloat(querySuccessRate.toFixed(2)),
      trendSlope,
      predictedPosition,
      avgResponseTime: 0,
    };
  }

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

  private getTimeRangeString(timeRangeMs: number): string {
    if (timeRangeMs <= 7 * 24 * 60 * 60 * 1000) return '7d';
    if (timeRangeMs <= 30 * 24 * 60 * 60 * 1000) return '30d';
    if (timeRangeMs <= 90 * 24 * 60 * 60 * 1000) return '90d';
    return '1y';
  }

  private calculateTrendSlope(positions: number[]): number {
    if (positions.length < 2) return 0;
    const firstPos = positions[0];
    const lastPos = positions[positions.length - 1];
    return (lastPos - firstPos) / (positions.length - 1);
  }

  private predictTrend(positions: number[], forecastDays: number = 7): number {
    if (positions.length < 2) return positions[0] || 0;
    
    const n = positions.length;
    const sumX = positions.reduce((sum, _, i) => sum + i, 0);
    const sumY = positions.reduce((sum, y) => sum + y, 0);
    const sumXY = positions.reduce((sum, y, i) => sum + i * y, 0);
    const sumX2 = positions.reduce((sum, _, i) => sum + i * i, 0);
    
    const denominator = n * sumX2 - sumX * sumX;
    if (denominator === 0) return positions[0];
    
    const slope = (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;
    
    return intercept + slope * (n + forecastDays - 1);
  }

  private calculateAverageSimilarity(anomalies: any[]): number {
    if (!anomalies.length) return 0;
    const similarities = anomalies.map(a => a.avgSimilarity || 0);
    return similarities.reduce((sum, sim) => sum + sim, 0) / similarities.length;
  }

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

  private getAnomalyDescription(anomaly: any): string {
    switch (anomaly.type) {
      case 'content_anomaly':
        return `Content significantly differs from similar results (${anomaly.anomalyScore.toFixed(2)}σ deviation)`;
      default:
        return 'Unknown anomaly detected';
    }
  }

  private getEmptyWeaviateAnalytics(): WeaviateAnalyticsData {
    return {
      timeRangeMs: 0,
      filteredSnapshots: [],
      rankingTrendData: [],
      categoryDistribution: [],
      successRateByHour: [],
      performanceData: [],
      topPerformingQueries: [],
      queryPerformanceStats: [],
      rankingStability: 0,
      volatilityIndex: 0,
      domainDiversity: 0,
      avgResponseTime: 0,
      newContentDiscovery: 0,
      querySuccessRate: 0,
      trendSlope: 0,
      predictedPosition: 0,
      isAnomaly: false,
      semanticInsights: {
        contentAnomalies: [],
        semanticClusters: [],
        contentEvolution: { discoveryRate: 0, stabilityTrend: [], contentTurnover: 0 },
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
      isWeaviateSource: true
    };
  }
}
