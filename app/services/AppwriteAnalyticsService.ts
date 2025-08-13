// app/services/AppwriteAnalyticsService.ts
import { AnalyticsService } from './analytics-service';
import { analyticsCalculations } from '@/app/logic/analyticsLogic';
import type { AnalyticsData, QueryConfig, RankingSnapshot } from '@/lib/type';

export class AppwriteAnalyticsService extends AnalyticsService {
  constructor(isLocal: boolean = false) {
    super(isLocal);
  }

  /**
   * Get comprehensive analytics specifically from Appwrite data source
   * This is the main method called when in traditional analytics mode
   */
  async getAnalytics(
    userId: string, 
    timeRangeMs: number,
    queries: QueryConfig[] = []
  ): Promise<AnalyticsData> {
    try {

        
      // Fetch snapshots using parent implementation (handles both local and remote)
      const snapshots = await this.fetchSnapshots(userId, timeRangeMs);
      
      console.log(`[AppwriteAnalyticsService] Fetched ${snapshots.length} snapshots for user ${userId}`);

      // Calculate analytics using both shared logic and legacy metrics
      return this.calculateAnalyticsFromSnapshots(snapshots, queries, timeRangeMs);

    } catch (error) {
      console.error("[AppwriteAnalyticsService] Failed to get analytics:", error);
      return this.getDefaultAnalytics();
    }
  }

  /**
   * Calculate analytics with enhanced Appwrite-specific processing
   * Combines shared analytics logic with Appwrite-optimized calculations
   */
 calculateAnalyticsFromSnapshots(
    snapshots: RankingSnapshot[], 
    queries: QueryConfig[] = [],
    timeRangeMs?: number
  ): AnalyticsData {
    if (!snapshots || snapshots.length === 0) {
      console.warn("[AppwriteAnalyticsService] No snapshots for calculation.");
      return this.getDefaultAnalytics();
    }
try {
      // Use the shared analytics logic
      const timeRange = timeRangeMs ? this.getTimeRangeString(timeRangeMs) : '30d';
      const baseAnalytics = analyticsCalculations(queries, snapshots, timeRange);

      // Calculate Appwrite-specific metrics
      const appwriteMetrics = this.calculateAppwriteSpecificMetrics(snapshots);

    // Enhanced performance metrics specific to Appwrite data
    const enhancedPerformanceMetrics = this.calculateEnhancedPerformanceMetrics(snapshots);

    // Merge all analytics data
    return {
      ...baseAnalytics,
      ...appwriteMetrics,
      ...enhancedPerformanceMetrics,
      
      // Override with calculated values
      rankingStability: appwriteMetrics.rankingStability,
      volatilityIndex: appwriteMetrics.volatilityIndex,
      domainDiversity: appwriteMetrics.domainDiversity,
      avgResponseTime: appwriteMetrics.avgResponseTime,
      newContentDiscovery: appwriteMetrics.newContentDiscovery,
      querySuccessRate: appwriteMetrics.querySuccessRate,
      
      // Additional Appwrite-specific flags
      isAppwriteSource: true,
      dataSourceType: 'appwrite',
      calculatedAt: new Date().toISOString(),
    };
     } catch (error) {
      console.error("[AppwriteAnalyticsService] Analytics calculation failed:", error);
      return this.getDefaultAnalytics();
    }
  }

  /**
   * Calculate Appwrite-specific metrics that leverage response times and metadata
   * These metrics are only available from Appwrite data due to metadata richness
   */
  private calculateAppwriteSpecificMetrics(snapshots: RankingSnapshot[]) {
    // Store original response times before any processing
    const originalResponseTimes = snapshots
      .filter(snap => snap.metadata?.responseTime && typeof snap.metadata.responseTime === 'number')
      .map(snap => snap.metadata.responseTime);

    const snapshotsByQuery: Record<string, RankingSnapshot[]> = {};
    const seenUrls = new Set<string>();
    const domainSet = new Set<string>();
    const contentTypes = new Set<string>();
    let allPositions: number[] = [];

    // Process each snapshot for metrics calculation
    for (const snap of snapshots) {
      if (!snap.queryId || !snap.results || !Array.isArray(snap.results)) continue;

      // Group by query for stability calculations
      if (!snapshotsByQuery[snap.queryId]) {
        snapshotsByQuery[snap.queryId] = [];
      }
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
          
          // Content type tracking
          if (result.contentType) {
            contentTypes.add(result.contentType);
          }
          
          // Position tracking for trend analysis
          if (typeof result.position === 'number') {
            allPositions.push(result.position);
          }
        } catch (e) {
          console.warn("[AppwriteAnalyticsService] Invalid URL in result:", result.url, e);
        }
      }
    }

    // Calculate ranking stability and volatility
    const { stabilityScore, volatilityIndex } = this.calculateRankingMetrics(snapshotsByQuery);
    
    // Calculate domain and content diversity
    const domainDiversity = domainSet.size;
    const contentTypeDiversity = contentTypes.size;
    
    // Calculate content discovery rate
    const newContentDiscovery = snapshots.length > 0 ? seenUrls.size / snapshots.length : 0;

    // Calculate average response time (Appwrite-specific)
    const avgResponseTime = originalResponseTimes.length > 0 
      ? originalResponseTimes.reduce((sum, time) => sum + time, 0) / originalResponseTimes.length 
      : 0;

    // Calculate query success rate
    const querySuccessRate = snapshots.length > 0 
      ? (snapshots.filter(s => s.results && s.results.length > 0).length / snapshots.length) * 100 
      : 0;

    // Calculate trend metrics
    const trendSlope = this.calculateTrendSlope(allPositions);
    const predictedPosition = this.predictTrend(allPositions);
    
    // Detect anomalies in ranking patterns
    const isAnomaly = this.detectAnomalies(snapshotsByQuery);

    return {
      rankingStability: parseFloat(stabilityScore.toFixed(2)),
      volatilityIndex: parseFloat(volatilityIndex.toFixed(2)),
      domainDiversity,
      contentTypeDiversity,
      avgResponseTime: parseFloat(avgResponseTime.toFixed(2)),
      newContentDiscovery: parseFloat(newContentDiscovery.toFixed(2)),
      querySuccessRate: parseFloat(querySuccessRate.toFixed(2)),
      trendSlope,
      predictedPosition,
      isAnomaly,
    };
  }

  /**
   * Calculate enhanced performance metrics leveraging Appwrite metadata
   */
  private calculateEnhancedPerformanceMetrics(snapshots: RankingSnapshot[]) {
    const responseTimes = snapshots
      .map(s => s.metadata?.responseTime)
      .filter((time): time is number => typeof time === 'number');

    const executionTimes = snapshots
      .map(s => s.metadata?.executedAt ? new Date(s.metadata.executedAt).getTime() : null)
      .filter((time): time is number => time !== null);

    // Response time statistics
    const responseTimeStats = this.calculateStatistics(responseTimes);
    
    // Query execution frequency analysis
    const executionFrequency = this.calculateExecutionFrequency(executionTimes);
    
    // Data freshness metrics
    const dataFreshness = this.calculateDataFreshness(snapshots);
    
    // Query complexity metrics (based on result count and response time correlation)
    const complexityMetrics = this.calculateQueryComplexity(snapshots);

    return {
      responseTimeStats,
      executionFrequency,
      dataFreshness,
      complexityMetrics,
      
      // Summary metrics
      avgComplexityScore: complexityMetrics.avgComplexityScore,
      dataFreshnessScore: dataFreshness.freshnessScore,
      executionEfficiency: executionFrequency.efficiency,
    };
  }

  /**
   * Calculate ranking stability and volatility metrics
   * These metrics change with deduplication as they depend on position comparisons
   */
  private calculateRankingMetrics(snapshotsByQuery: Record<string, RankingSnapshot[]>) {
    let totalRankChanges = 0;
    let totalComparisons = 0;
    let totalVolatility = 0;
    let queryCount = 0;

    Object.values(snapshotsByQuery).forEach((snaps) => {
      if (snaps.length < 2) return;
      
      // Sort by timestamp for chronological comparison
      snaps.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      
      queryCount++;
      
      // Calculate rank changes
      for (let i = 1; i < snaps.length; i++) {
        const prev = snaps[i - 1].results?.map((r) => r.url) || [];
        const curr = snaps[i].results?.map((r) => r.url) || [];
        const maxLength = Math.max(prev.length, curr.length);
        
        let changes = 0;
        for (let j = 0; j < maxLength; j++) {
          const prevUrl = prev[j] || null;
          const currUrl = curr[j] || null;
          
          if (prevUrl && currUrl) {
            if (prevUrl !== currUrl) changes++;
          } else {
            changes++; // Position appeared or disappeared
          }
          totalComparisons++;
        }
        totalRankChanges += changes;
      }
      
      // Calculate volatility for this query
      const positions = snaps.flatMap(s => s.results?.map(r => r.position || 0) || []);
      if (positions.length > 0) {
        const mean = positions.reduce((sum, pos) => sum + pos, 0) / positions.length;
        const variance = positions.reduce((sum, pos) => sum + Math.pow(pos - mean, 2), 0) / positions.length;
        totalVolatility += Math.sqrt(variance);
      }
    });

    const stabilityScore = totalComparisons > 0 
      ? 100 - (totalRankChanges / totalComparisons) * 100 
      : 100;
    
    const volatilityIndex = queryCount > 0 
      ? totalVolatility / queryCount 
      : 0;

    return { stabilityScore, volatilityIndex };
  }

  /**
   * Calculate trend slope from position data
   */
  private calculateTrendSlope(allPositions: number[]): number {
    if (allPositions.length < 2) return 0;
    
    const firstPos = allPositions[0];
    const lastPos = allPositions[allPositions.length - 1];
    return (lastPos - firstPos) / (allPositions.length - 1);
  }

  /**
   * Predict future ranking positions using linear regression
   */
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

  /**
   * Detect anomalies in ranking patterns
   */
  private detectAnomalies(snapshotsByQuery: Record<string, RankingSnapshot[]>): boolean {
    const allVolatilities: number[] = [];

    Object.values(snapshotsByQuery).forEach((snaps) => {
      const positions = snaps.flatMap(s => s.results?.map(r => r.position || 0) || []);
      if (positions.length > 0) {
        const avg = positions.reduce((sum, pos) => sum + pos, 0) / positions.length;
        const variance = positions.reduce((sum, pos) => sum + Math.pow(pos - avg, 2), 0) / positions.length;
        allVolatilities.push(Math.sqrt(variance));
      }
    });

    if (allVolatilities.length === 0) return false;

    const meanVol = allVolatilities.reduce((sum, v) => sum + v, 0) / allVolatilities.length;
    const stdDev = Math.sqrt(
      allVolatilities.reduce((sum, v) => sum + Math.pow(v - meanVol, 2), 0) / allVolatilities.length
    );
    
    return allVolatilities.some(v => v > meanVol + 2 * stdDev);
  }

  /**
   * Calculate statistical metrics for numerical arrays
   */
  private calculateStatistics(values: number[]) {
    if (values.length === 0) {
      return { min: 0, max: 0, mean: 0, median: 0, stdDev: 0, percentile95: 0 };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    
    return {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      mean: parseFloat(mean.toFixed(2)),
      median: sorted[Math.floor(sorted.length / 2)],
      stdDev: parseFloat(Math.sqrt(variance).toFixed(2)),
      percentile95: sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1],
    };
  }

  /**
   * Calculate query execution frequency and patterns
   */
  private calculateExecutionFrequency(executionTimes: number[]) {
    if (executionTimes.length < 2) {
      return { frequency: 0, efficiency: 100, pattern: 'insufficient_data' };
    }

    const intervals = [];
    for (let i = 1; i < executionTimes.length; i++) {
      intervals.push(executionTimes[i] - executionTimes[i - 1]);
    }

    const avgInterval = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
    const frequency = avgInterval > 0 ? 1000 * 60 * 60 * 24 / avgInterval : 0; // Executions per day
    
    // Calculate efficiency based on interval consistency
    const intervalVariance = intervals.reduce((sum, val) => sum + Math.pow(val - avgInterval, 2), 0) / intervals.length;
    const efficiency = Math.max(0, 100 - (Math.sqrt(intervalVariance) / avgInterval) * 100);

    return {
      frequency: parseFloat(frequency.toFixed(2)),
      efficiency: parseFloat(efficiency.toFixed(2)),
      pattern: this.determineExecutionPattern(intervals),
      avgInterval: avgInterval,
    };
  }

  /**
   * Calculate data freshness metrics
   */
  private calculateDataFreshness(snapshots: RankingSnapshot[]) {
    const now = Date.now();
    const ages = snapshots.map(s => now - new Date(s.timestamp).getTime());
    
    const avgAge = ages.reduce((sum, age) => sum + age, 0) / ages.length;
    const maxAge = Math.max(...ages);
    
    // Freshness score (0-100, where 100 is very fresh)
    const freshnessScore = Math.max(0, 100 - (avgAge / (24 * 60 * 60 * 1000)) * 10); // Deduct 10 points per day
    
    return {
      avgAgeHours: parseFloat((avgAge / (60 * 60 * 1000)).toFixed(2)),
      maxAgeHours: parseFloat((maxAge / (60 * 60 * 1000)).toFixed(2)),
      freshnessScore: parseFloat(freshnessScore.toFixed(2)),
      stalenessIndicator: freshnessScore < 50 ? 'stale' : freshnessScore < 80 ? 'moderate' : 'fresh',
    };
  }

  /**
   * Calculate query complexity metrics based on result patterns and response times
   */
  private calculateQueryComplexity(snapshots: RankingSnapshot[]) {
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
  private determineExecutionPattern(intervals: number[]): string {
    if (intervals.length < 3) return 'insufficient_data';
    
    const avgInterval = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
    const variance = intervals.reduce((sum, val) => sum + Math.pow(val - avgInterval, 2), 0) / intervals.length;
    const coefficientOfVariation = Math.sqrt(variance) / avgInterval;
    
    if (coefficientOfVariation < 0.1) return 'very_regular';
    if (coefficientOfVariation < 0.3) return 'regular';
    if (coefficientOfVariation < 0.6) return 'irregular';
    return 'highly_irregular';
  }

  /**
   * Enhanced default analytics with Appwrite-specific structure
   */
  protected getDefaultAnalytics(): AnalyticsData {
    return {
      ...super.getDefaultAnalytics(),
      
      // Appwrite-specific additions
      isAppwriteSource: true,
      dataSourceType: 'appwrite',
      calculatedAt: new Date().toISOString(),
      
      // Enhanced performance metrics defaults
      responseTimeStats: {
        min: 0, max: 0, mean: 0, median: 0, stdDev: 0, percentile95: 0
      },
      executionFrequency: {
        frequency: 0, efficiency: 100, pattern: 'insufficient_data', avgInterval: 0
      },
      dataFreshness: {
        avgAgeHours: 0, maxAgeHours: 0, freshnessScore: 0, stalenessIndicator: 'fresh'
      },
      complexityMetrics: {
        avgComplexityScore: 0, complexityDistribution: {
          min: 0, max: 0, mean: 0, median: 0, stdDev: 0, percentile95: 0
        }, highComplexityQueries: 0
      },
      
      // Summary metrics defaults
      avgComplexityScore: 0,
      dataFreshnessScore: 0,
      executionEfficiency: 100,
      contentTypeDiversity: 0,
    };
  }
}
