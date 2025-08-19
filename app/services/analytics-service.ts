// app/services/analytics-service.ts

import { databases, DATABASE_ID, COLLECTIONS } from "@/app/server/appwrite";
import { Query } from "appwrite";
import { calculateStandardDeviation } from "@/lib/analytics-calculations";
import type {
  EnhancedAnalyticsData,
  AnalyticsData,
  RankingSnapshot,
  StatisticalValidationResult,
  DataQualityResult,
  ResponseTimeStats,
  ExecutionFrequency,
  DataFreshness,
  ComplexityMetrics,
  HourlyStats
} from "@/lib/type";
import { loadFromStorage, transformSnapshotDocument } from "./db-utils";
import { analyticsCalculations } from "@/app/logic/analyticsLogic";

function fixHourlyStats(arr: any[]): HourlyStats[] {
  // Ensures confidenceInterval is a [number, number] tuple
  return (arr || []).map((h: any) => ({
    ...h,
    confidenceInterval: Array.isArray(h.confidenceInterval) && h.confidenceInterval.length === 2
      ? [Number(h.confidenceInterval[0]), Number(h.confidenceInterval)]
      : [0, 0]
  }));
}

export class AnalyticsService {
  private isLocal: boolean;
  constructor(isLocal: boolean) {
    this.isLocal = isLocal;
  }
  protected getTimeRangeString(timeRangeMs: number): string {
    const days = Math.floor(timeRangeMs / (24 * 60 * 60 * 1000));
    if (days >= 365) return '1y';
    if (days >= 90) return '90d';
    if (days >= 30) return '30d';
    if (days >= 7) return '7d';
    return '24h';
  }
  async getAnalytics(userId?: string, timeRangeMs?: number): Promise<EnhancedAnalyticsData> {
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
        const tempid = COLLECTIONS.SNAPSHOTS || "683382eb0006b9130dc5";
        const response = await databases.listDocuments(DATABASE_ID, tempid, queries);
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
      return this.calculateEnhancedAnalyticsFromSnapshots(snapshots);
    } catch (error) {
      console.error("Failed to get analytics:", error);
      return this.getDefaultEnhancedAnalytics();
    }
  }



  /**
   * Enhanced analytics calculation using the unified logic
   */
  calculateEnhancedAnalyticsFromSnapshots(snapshots: RankingSnapshot[]): EnhancedAnalyticsData {
    if (!snapshots || snapshots.length === 0) {
      console.warn("[AnalyticsService] No snapshots for calculation.");
      return this.getDefaultEnhancedAnalytics();
    }

    // Use central analytics engine, provides all core metrics
    const timeRangeStr = snapshots.length ? this.getTimeRangeString(
      Date.now() - new Date(snapshots[0].timestamp).getTime()
    ) : '30d';

    // Only queries parameter needs to be passed from upper layer if available
    const analytics = analyticsCalculations([], snapshots, timeRangeStr);

    // Fix hourly stats to ensure proper confidence interval format on all outputs
    const successRateByHour = fixHourlyStats(analytics.successRateByHour);
    const performanceData = fixHourlyStats(analytics.performanceData);

     function fixTopPerformingQueries(arr: any[]): any[] {
  return (arr || []).map(item => {
    const validTrends = ['up', 'down', 'stable'];
    const trend: 'up' | 'down' | 'stable' = validTrends.includes(item.trend) ? item.trend : 'stable';
    return { ...item, trend };
  });
}
const topPerformingQueries = fixTopPerformingQueries(analytics.topPerformingQueries);
    // Data Quality Assessment and Appwrite-specific metadata
    const dataQuality = this.assessDataQuality(snapshots);
    const responseTimeStats = analytics.performanceData ?
      this.calculateResponseTimeStatistics(snapshots)
      : { min: 0, max: 0, mean: 0, median: 0, stdDev: 0, percentile95: 0 };
    const executionFrequency = this.calculateExecutionFrequency(snapshots);
    const dataFreshness = this.calculateDataFreshness(snapshots);
    const complexityMetrics = this.calculateComplexityMetrics(snapshots);
    return {
      ...analytics,
      successRateByHour,
      topPerformingQueries,
      performanceData,
      dataQuality,
      responseTimeStats,
      executionFrequency,
      dataFreshness,
      complexityMetrics,
      isAppwriteSource: true,
      timeRangeMs: 0,
      calculatedAt: new Date().toISOString(),
      dataSourceType: 'appwrite'
    };
  }

  // ---- Utility and statistical functions are unchanged below ----

  protected extractDocumentsFromSnapshots(snapshots: RankingSnapshot[]): Array<{ title: string, content: string, vector?: number[] }> {
    const documents: Array<{ title: string, content: string, vector?: number[] }> = [];
    snapshots.forEach(snapshot => {
      snapshot.results?.forEach(result => {
        if (result.title && result.snippet) {
          documents.push({
            title: result.title,
            content: result.snippet,
            vector: result.vector // If available
          });
        }
      });
    });
    return documents;
  }
  protected extractTimeSeriesFromSnapshots(snapshots: RankingSnapshot[]): Array<{ timestamp: number, content: string, vectors?: number[][] }> {
    return snapshots
      .map(snapshot => {
        const content = snapshot.results
          ?.map(result => `${result.title || ''} ${result.snippet || ''}`)
          .join(' ') || '';
        const vectors = snapshot.results
          ?.map(result => result.vector)
          .filter(Boolean) as number[][] || [];
        return {
          timestamp: new Date(snapshot.timestamp).getTime(),
          content: content.trim(),
          vectors: vectors.length > 0 ? vectors : undefined
        };
      })
      .filter(item => item.content.length > 0)
      .sort((a, b) => a.timestamp - b.timestamp);
  }
  /**
   * Assess data quality
   */
  protected assessDataQuality(snapshots: RankingSnapshot[]): DataQualityResult {
    const now = Date.now();
    let validSnapshots = 0;
    let completeSnapshots = 0;
    let consistentSnapshots = 0;
    let anomalyCount = 0;
    const ages: number[] = [];
    snapshots.forEach(snapshot => {
      if (snapshot.results && Array.isArray(snapshot.results)) {
        validSnapshots++;
      }
      if (snapshot.results?.length > 0 && 
          snapshot.results.every(r => r.url && r.title)) {
        completeSnapshots++;
      }
      if (snapshot.results?.every((result, index) => 
          result.position === index + 1 || result.position > 0)) {
        consistentSnapshots++;
      }
      ages.push(now - new Date(snapshot.timestamp).getTime());
      if (snapshot.results && (snapshot.results.length === 0 || snapshot.results.length > 50)) {
        anomalyCount++;
      }
    });
    const totalSnapshots = snapshots.length;
    const avgAge = ages.length > 0 ? ages.reduce((sum, age) => sum + age, 0) / ages.length : 0;
    return {
      completeness: totalSnapshots > 0 ? (completeSnapshots / totalSnapshots) * 100 : 0,
      accuracy: totalSnapshots > 0 ? (validSnapshots / totalSnapshots) * 100 : 0,
      consistency: totalSnapshots > 0 ? (consistentSnapshots / totalSnapshots) * 100 : 0,
      freshness: Math.max(0, 100 - (avgAge / (24 * 60 * 60 * 1000)) * 10),
      validity: totalSnapshots > 0 ? (validSnapshots / totalSnapshots) * 100 : 0,
      anomalyCount,
      assessedAt: now
    };
  }

  /**
   * Calculate response time statistics
   */
  protected calculateResponseTimeStatistics(snapshots: RankingSnapshot[]): ResponseTimeStats {
    const responseTimes = snapshots
      .map(s => s.metadata?.responseTime)
      .filter((time): time is number => typeof time === 'number');
    if (responseTimes.length === 0) {
      return { min: 0, max: 0, mean: 0, median: 0, stdDev: 0, percentile95: 0 };
    }
    const sorted = [...responseTimes].sort((a, b) => a - b);
    const mean = responseTimes.reduce((sum, val) => sum + val, 0) / responseTimes.length;
    const stdDev = calculateStandardDeviation(responseTimes);
    return {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      mean: parseFloat(mean.toFixed(2)),
      median: sorted[Math.floor(sorted.length / 2)],
      stdDev: parseFloat(stdDev.toFixed(2)),
      percentile95: sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1],
    };
  }

  /**
   * Calculate execution frequency
   */
  protected calculateExecutionFrequency(snapshots: RankingSnapshot[]): ExecutionFrequency {
  const executionTimes = snapshots
    .map(s => new Date(s.timestamp).getTime())
    .sort((a, b) => a - b);

  if (executionTimes.length < 2) {
    return { 
      frequency: 0, 
      efficiency: 100, 
      pattern: 'insufficient_data', 
      avgInterval: 0 // FIXED: Always provide avgInterval
    };
  }

     const intervals = [];
  for (let i = 1; i < executionTimes.length; i++) {
    intervals.push(executionTimes[i] - executionTimes[i - 1]);
  }

  const avgInterval = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
  const frequency = avgInterval > 0 ? 1000 * 60 * 60 * 24 / avgInterval : 0;
  
  // Calculate efficiency based on interval consistency
  const intervalStdDev = calculateStandardDeviation(intervals);
  const efficiency = Math.max(0, 100 - (intervalStdDev / avgInterval) * 100);

  return {
    frequency: parseFloat(frequency.toFixed(2)),
    efficiency: parseFloat(efficiency.toFixed(2)),
    pattern: this.determineExecutionPattern(intervals),
    avgInterval: parseFloat(avgInterval.toFixed(2)) // FIXED: Always include avgInterval
  };
}
  /**
   * Calculate data freshness
   */
  protected calculateDataFreshness(snapshots: RankingSnapshot[]): DataFreshness {
    const now = Date.now();
    const ages = snapshots.map(s => now - new Date(s.timestamp).getTime());
    
    const avgAge = ages.length > 0 ? ages.reduce((sum, age) => sum + age, 0) / ages.length : 0;
    const maxAge = ages.length > 0 ? Math.max(...ages) : 0;
    
    // Freshness score (0-100, where 100 is very fresh)
    const freshnessScore = Math.max(0, 100 - (avgAge / (24 * 60 * 60 * 1000)) * 10);
    
    return {
      avgAgeHours: parseFloat((avgAge / (60 * 60 * 1000)).toFixed(2)),
      maxAgeHours: parseFloat((maxAge / (60 * 60 * 1000)).toFixed(2)),
      freshnessScore: parseFloat(freshnessScore.toFixed(2)),
      stalenessIndicator: freshnessScore < 50 ? 'stale' : freshnessScore < 80 ? 'moderate' : 'fresh',
    };
  }

  /**
   * Calculate complexity metrics
   */
  protected calculateComplexityMetrics(snapshots: RankingSnapshot[]): ComplexityMetrics {
    const complexityScores = snapshots.map(snapshot => {
      const resultCount = snapshot.results?.length || 0;
      const responseTime = snapshot.metadata?.responseTime || 0;
      const uniqueDomains = new Set(snapshot.results?.map(r => r.domain).filter(Boolean)).size;
      
      // Complexity score based on multiple factors
      let complexity = 0;
      complexity += Math.min(resultCount / 10, 5); // Result count factor (max 5)
      complexity += Math.min(responseTime / 1000, 3); // Response time factor (max 3)
      complexity += Math.min(uniqueDomains / 5, 2); // Domain diversity factor (max 2)
      
      return complexity;
    });

    const avgComplexityScore = complexityScores.length > 0
      ? complexityScores.reduce((sum, score) => sum + score, 0) / complexityScores.length
      : 0;

    return {
      avgComplexityScore: parseFloat(avgComplexityScore.toFixed(2)),
      complexityDistribution: this.calculateStatistics(complexityScores),
      highComplexityQueries: snapshots.filter((_, i) => complexityScores[i] > avgComplexityScore * 1.5).length,
    };
  }

  /**
   * Determine execution pattern based on intervals
   */
  protected determineExecutionPattern(intervals: number[]): string {
    if (intervals.length < 3) return 'insufficient_data';
    
    const avgInterval = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
    const stdDev = calculateStandardDeviation(intervals);
    const coefficientOfVariation = stdDev / avgInterval;
    
    if (coefficientOfVariation < 0.1) return 'very_regular';
    if (coefficientOfVariation < 0.3) return 'regular';
    if (coefficientOfVariation < 0.6) return 'irregular';
    return 'highly_irregular';
  }

  /**
   * Calculate statistics for arrays
   */
  protected calculateStatistics(values: number[]) {
    if (values.length === 0) {
      return { min: 0, max: 0, mean: 0, median: 0, stdDev: 0, percentile95: 0 };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const stdDev = calculateStandardDeviation(values);
    
    return {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      mean: parseFloat(mean.toFixed(2)),
      median: sorted[Math.floor(sorted.length / 2)],
      stdDev: parseFloat(stdDev.toFixed(2)),
      percentile95: sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1],
    };
  }

  /**
   * Calculates analytics from snapshots with proper deduplication handling
   */
  calculateAnalyticsFromSnapshots(snapshots: RankingSnapshot[]): AnalyticsData {
    if (!snapshots || snapshots.length === 0) {
      console.warn("[AnalyticsService] No snapshots for calculation.");
      return this.getDefaultAnalytics();
    }

    // Store original response times before any processing
    const originalResponseTimes = snapshots
      .filter(snap => snap.metadata?.responseTime)
      .map(snap => snap.metadata!.responseTime!);

    const snapshotsByQuery: Record<string, RankingSnapshot[]> = {};
    const seenUrls = new Set<string>();
    const domainSet = new Set<string>();
    let allPositions: number[] = [];

    // Process each snapshot
    for (const snap of snapshots) {
      if (!snap.queryId || !snap.results || !Array.isArray(snap.results)) continue;
      
      // Group by query for stability calculations
      if (!snapshotsByQuery[snap.queryId]) snapshotsByQuery[snap.queryId] = [];
      snapshotsByQuery[snap.queryId].push(snap);

      // Process results for diversity and URL tracking
      for (const result of snap.results) {
        if (!result.url) continue;
        
        try {
          // Domain diversity calculation
          const domain = new URL(result.url).hostname;
          domainSet.add(domain);
          
          // URL tracking for content discovery
          seenUrls.add(result.url);
          
          // Position tracking for trend analysis
          if (typeof result.position === 'number') {
            allPositions.push(result.position);
          }
        } catch (e) {
          console.warn("Invalid URL in result:", e);
        }
      }
    }

    // Calculate metrics
    const { stabilityScore, volatilityIndex } = this.calculateRankingMetrics(snapshotsByQuery);
    const domainDiversity = domainSet.size;
    const newContentDiscovery = snapshots.length > 0 ? seenUrls.size / snapshots.length : 0;

    // Calculate metrics that are NOT affected by deduplication
    const avgResponseTime = originalResponseTimes.length > 0 
      ? originalResponseTimes.reduce((sum, time) => sum + time, 0) / originalResponseTimes.length 
      : 0;

    const querySuccessRate = snapshots.length > 0 
      ? (snapshots.filter(s => (s.results?.length || 0) > 0).length / snapshots.length) * 100 
      : 0;

    // Calculate trend metrics
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
   * Calculate ranking stability and volatility metrics
   */
  protected calculateRankingMetrics(snapshotsByQuery: Record<string, RankingSnapshot[]>) {
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
   * Calculate trend slope from position data
   */
  protected calculateTrendSlope(allPositions: number[]): number {
    if (allPositions.length < 2) return 0;
    const firstPos = allPositions[0];
    const lastPos = allPositions[allPositions.length - 1];
    return (lastPos - firstPos) / (allPositions.length - 1);
  }

  /**
   * Predict future ranking positions using linear regression
   */
  protected predictTrend(positions: number[], forecastDays: number = 7): number {
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

  /**
   * Detect anomalies in ranking patterns
   */
  protected detectAnomalies(snapshotsByQuery: Record<string, RankingSnapshot[]>): boolean {
    const allVolatilities: number[] = [];

    Object.values(snapshotsByQuery).forEach((snaps) => {
      const positions = snaps.flatMap(s => s.results?.map(r => r.position).filter(p => typeof p === 'number') || []);
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
   * Enhanced default analytics
   */
protected getDefaultEnhancedAnalytics(): EnhancedAnalyticsData {
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
    contentCoherence: undefined, // FIXED: Use undefined instead of null
    semanticStability: undefined, // FIXED: Use undefined instead of null
    dataQuality: {
      completeness: 0,
      accuracy: 0,
      consistency: 0,
      freshness: 0,
      validity: 0,
      anomalyCount: 0,
      assessedAt: Date.now()
    },
    responseTimeStats: {
      min: 0, max: 0, mean: 0, median: 0, stdDev: 0, percentile95: 0
    },
    executionFrequency: {
      frequency: 0, 
      efficiency: 100, 
      pattern: 'insufficient_data', 
      avgInterval: 0 // FIXED: Always provide avgInterval
    },
    dataFreshness: {
      avgAgeHours: 0, 
      maxAgeHours: 0, 
      freshnessScore: 0, 
      stalenessIndicator: 'fresh'
    },
    complexityMetrics: {
      avgComplexityScore: 0, 
      complexityDistribution: { 
        min: 0, max: 0, mean: 0, median: 0, stdDev: 0, percentile95: 0 
      },
      highComplexityQueries: 0
    },
    calculatedAt: new Date().toISOString(),
    dataSourceType: 'appwrite'
  };
}

  /**
   * Returns default analytics when no data is available
   */
  protected getDefaultAnalytics(): AnalyticsData {
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
