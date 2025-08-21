// app/services/AppwriteAnalyticsService.ts
import { AnalyticsService } from './analytics-service';
import { analyticsCalculations } from '@/app/logic/analyticsLogic';
import type { AnalyticsData, QueryConfig, RankingSnapshot, EnhancedAnalyticsData, ExecutionFrequency, DataFreshness, HourlyStats } from '@/lib/type';

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

export class AppwriteAnalyticsService extends AnalyticsService {
  constructor(isLocal: boolean = false) {
    super(isLocal);
  }

  /**
   * SIMPLIFIED: Main analytics method - now uses unified engine
   */
  async getAnalytics(
    userId?: string, 
    timeRangeMs?: number,
    queries: QueryConfig[] = []
  ): Promise<EnhancedAnalyticsData> {
    try {
      // Fetch snapshots using base class
      const baseAnalytics = await super.getAnalytics(userId, timeRangeMs);
      const snapshots = baseAnalytics.filteredSnapshots || [];
      
      if (snapshots.length === 0) {
        return this.getDefaultEnhancedAnalytics();
      }

      // Use unified analytics engine (vector-aware)
      const timeRange = timeRangeMs ? this.getTimeRangeString(timeRangeMs) : '30d';
      const unifiedAnalytics = analyticsCalculations(queries, snapshots, timeRange);
      // ✅ Fix tuple typing issues
      const successRateByHour = fixHourlyStats(unifiedAnalytics.successRateByHour);
      const performanceData = fixHourlyStats(unifiedAnalytics.performanceData);
      const topPerformingQueries = fixTopPerformingQueries(unifiedAnalytics.topPerformingQueries);

      // Add Appwrite-specific metadata enhancements
      const appwriteSpecific = this.calculateAppwriteSpecificMetadata(snapshots);

      return {
        ...baseAnalytics,
        ...unifiedAnalytics,
        ...appwriteSpecific,
        
        // ✅ Apply fixed arrays
        successRateByHour,
        performanceData,
        topPerformingQueries,
        
        // Appwrite-specific flags
        isAppwriteSource: true,
        dataSourceType: 'appwrite',
        calculatedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error("[AppwriteAnalyticsService] Failed to get analytics:", error);
      return this.getDefaultEnhancedAnalytics();
    }
  }

  /**
   * SIMPLIFIED: Calculate only Appwrite-specific metadata (response times, etc.)
   * All core analytics now handled by unified engine
   */
  private calculateAppwriteSpecificMetadata(snapshots: RankingSnapshot[]) {
    // Appwrite-specific: Response time analysis
    const responseTimes = snapshots
      .map(s => s.metadata?.responseTime)
      .filter((time): time is number => typeof time === 'number');

    const avgResponseTime = responseTimes.length > 0 
      ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length 
      : 0;

    // Appwrite-specific: Execution frequency
    const executionFrequency = this.calculateExecutionFrequency(snapshots);
    
    // Appwrite-specific: Data freshness
    const dataFreshness = this.calculateDataFreshness(snapshots);
    
    // Appwrite-specific: Query complexity
    const complexityMetrics = this.calculateQueryComplexity(snapshots);

    return {
      // Response time stats
      responseTimeStats: this.calculateStatistics(responseTimes),
      avgResponseTime: parseFloat(avgResponseTime.toFixed(2)),
      
      // Performance metrics
      executionFrequency,
      dataFreshness,
      complexityMetrics,
      
      // Summary metrics
      avgComplexityScore: complexityMetrics.avgComplexityScore,
      executionEfficiency: executionFrequency.efficiency,
    };
  }

  /**
   * KEPT: Appwrite-specific utility methods
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
        avgInterval: 0
      };
    }

    const intervals = [];
    for (let i = 1; i < executionTimes.length; i++) {
      intervals.push(executionTimes[i] - executionTimes[i - 1]);
    }

    const avgInterval = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
    const frequency = avgInterval > 0 ? 1000 * 60 * 60 * 24 / avgInterval : 0;
    
    const intervalVariance = intervals.reduce((sum, val) => {
      const diff = val - avgInterval;
      return sum + diff * diff;
    }, 0) / intervals.length;
    
    const efficiency = Math.max(0, 100 - (Math.sqrt(intervalVariance) / avgInterval) * 100);

    return {
      frequency: parseFloat(frequency.toFixed(2)),
      efficiency: parseFloat(efficiency.toFixed(2)),
      pattern: this.determineExecutionPattern(intervals),
      avgInterval: parseFloat(avgInterval.toFixed(2))
    };
  }

  protected calculateDataFreshness(snapshots: RankingSnapshot[]): DataFreshness {
    const now = Date.now();
    const ages = snapshots.map(s => now - new Date(s.timestamp).getTime());
    
    const avgAge = ages.length > 0 ? ages.reduce((sum, age) => sum + age, 0) / ages.length : 0;
    const maxAge = ages.length > 0 ? Math.max(...ages) : 0;
    const freshnessScore = Math.max(0, 100 - (avgAge / (24 * 60 * 60 * 1000)) * 10);
    
    return {
      avgAgeHours: parseFloat((avgAge / (60 * 60 * 1000)).toFixed(2)),
      maxAgeHours: parseFloat((maxAge / (60 * 60 * 1000)).toFixed(2)),
      freshnessScore: parseFloat(freshnessScore.toFixed(2)),
      stalenessIndicator: freshnessScore < 50 ? 'stale' : freshnessScore < 80 ? 'moderate' : 'fresh',
    };
  }

  private calculateQueryComplexity(snapshots: RankingSnapshot[]) {
    const complexityScores = snapshots.map(snapshot => {
      const resultCount = snapshot.results?.length || 0;
      const responseTime = snapshot.metadata?.responseTime || 0;
      const uniqueDomains = new Set(snapshot.results?.map(r => r.domain).filter(Boolean)).size;
      
      let complexity = 0;
      complexity += Math.min(resultCount / 10, 5);
      complexity += Math.min(responseTime / 1000, 3);
      complexity += Math.min(uniqueDomains / 5, 2);
      
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

  protected calculateStatistics(values: number[]) {
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

  protected determineExecutionPattern(intervals: number[]): string {
    if (intervals.length < 3) return 'insufficient_data';
    
    const avgInterval = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
    const variance = intervals.reduce((sum, val) => sum + Math.pow(val - avgInterval, 2), 0) / intervals.length;
    const coefficientOfVariation = Math.sqrt(variance) / avgInterval;
    
    if (coefficientOfVariation < 0.1) return 'very_regular';
    if (coefficientOfVariation < 0.3) return 'regular';
    if (coefficientOfVariation < 0.6) return 'irregular';
    return 'highly_irregular';
  }

  protected getTimeRangeString(timeRangeMs: number): string {
    const days = Math.floor(timeRangeMs / (24 * 60 * 60 * 1000));
    if (days >= 365) return '1y';
    if (days >= 90) return '90d';
    if (days >= 30) return '30d';
    if (days >= 7) return '7d';
    return '24h';
  }

  /**
   * SIMPLIFIED: Default analytics now use base class + Appwrite flags
   */
  protected getDefaultEnhancedAnalytics(): EnhancedAnalyticsData {
    return {
      ...super.getDefaultEnhancedAnalytics(),
      isAppwriteSource: true,
      dataSourceType: 'appwrite',
      calculatedAt: new Date().toISOString(),
    };
  }
}
