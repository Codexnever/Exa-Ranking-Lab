/**
 * @fileoverview Advanced Analytics Logic Engine for Exa Ranking Lab
 * 
 * This module provides comprehensive analytics calculations for search ranking data analysis.
 * It includes time-based filtering, trend analysis, anomaly detection, predictive modeling,
 * and performance metrics computation. The analytics engine is designed to process large
 * datasets efficiently using React's useMemo for optimal performance.
 * 
 * Key Features:
 * - Real-time ranking trend analysis with volatility detection
 * - Predictive modeling using linear regression
 * - Statistical anomaly detection (2-sigma threshold)
 * - Performance analytics with confidence intervals
 * - Category distribution analysis with semantic clustering support
 * - Time-based data filtering and aggregation
 * 
 */

// app/logic/analyticsLogic.ts
import { useMemo } from "react";
import type { QueryConfig, RankingSnapshot, TrendPoint } from "@/lib/type";
import { pipeline } from '@xenova/transformers'; // For semantic clustering (npm install @xenova/transformers)

/**
 * Converts time range string to milliseconds for date calculations.
 * 
 * Supports standard time ranges commonly used in analytics dashboards.
 * Falls back to 30 days if an invalid range is provided.
 * 
 * @param {string} timeRange - Time range identifier ("7d", "30d", "90d", "1y")
 * @returns {number} Time range in milliseconds
 * 
 * @example
 * ```
 * const thirtyDaysMs = calculateTimeRangeMs("30d");
 * const oneYearMs = calculateTimeRangeMs("1y");
 * ```
 */
export function calculateTimeRangeMs(timeRange: string): number {
  switch (timeRange) {
    case "7d": return 7 * 24 * 60 * 60 * 1000;
    case "30d": return 30 * 24 * 60 * 60 * 1000;
    case "90d": return 90 * 24 * 60 * 60 * 1000;
    case "1y": return 365 * 24 * 60 * 60 * 1000;
    default: return 30 * 24 * 60 * 60 * 1000;
  }
}

/**
 * Filters and limits ranking snapshots based on time range and custom criteria.
 * 
 * Applies temporal filtering, optional query type filtering, domain-specific filtering,
 * and enforces a maximum snapshot limit for performance optimization.
 * 
 * @param {RankingSnapshot[]} snapshots - Array of ranking snapshot data
 * @param {number} timeRangeMs - Time range in milliseconds for filtering
 * @param {Object} filters - Optional filtering criteria
 * @param {string} [filters.queryType] - Filter by specific query type
 * @param {string} [filters.domain] - Filter by domain presence in results
 * @param {number} [maxSnapshots=1000] - Maximum number of snapshots to return
 * @returns {RankingSnapshot[]} Filtered array of snapshots
 * 
 * @example
 * ```
 * const filtered = filterSnapshots(
 *   allSnapshots, 
 *   calculateTimeRangeMs("7d"),
 *   { queryType: "research", domain: "example.com" }
 * );
 * ```
 */
function filterSnapshots(
  snapshots: RankingSnapshot[],
  timeRangeMs: number,
  filters: { queryType?: string; domain?: string } = {},
  maxSnapshots: number = 1000
): RankingSnapshot[] {
  const cutoffDate = new Date(Date.now() - timeRangeMs);
  let filtered = snapshots.filter(s => new Date(s.timestamp) > cutoffDate);

  if (filters.queryType) {
    filtered = filtered.filter(s => s.queryType === filters.queryType); // Now safe after adding to type
  }
  if (filters.domain) {
    filtered = filtered.filter(s =>
      s.results.some(r => r.url?.includes(filters.domain!)) // ✅ safe now
    );
  }

  return filtered.slice(0, maxSnapshots);
}

/**
 * Performs semantic clustering of query categories for better organization.
 * 
 * Currently implements basic category preservation with support for future
 * semantic clustering using transformers. Can be extended to merge similar
 * categories based on semantic similarity.
 * 
 * @param {Record<string, number>} categories - Category counts to cluster
 * @returns {Record<string, number>} Clustered category counts
 * 
 * @example
 * ```
 * const clustered = clusterCategories({
 *   "research paper": 5,
 *   "academic": 3,
 *   "pdf": 2
 * });
 * ```
 */
function clusterCategories(categories: Record<string, number>): Record<string, number> {
  // Example: Merge similar categories manually if needed
  // For now, just return as-is (can add manual merges here)
  return { ...categories };
}

/**
 * Predicts future ranking positions using linear regression analysis.
 * 
 * Implements least squares linear regression to forecast ranking trends.
 * Handles edge cases with single data points and provides reasonable
 * predictions based on historical position data.
 * 
 * @param {number[]} positions - Historical ranking positions
 * @param {number} [forecastDays=7] - Number of days to forecast ahead
 * @returns {number} Predicted ranking position
 * 
 * @example
 * ```
 * const positions = ;
 * const prediction = predictTrend(positions, 7);
 * console.log(`Predicted position in 7 days: ${prediction}`);
 * ```
 */
function predictTrend(positions: number[], forecastDays: number = 7): number {
  if (positions.length < 2) return positions[0] || 0;
  const n = positions.length;
  const sumX = positions.reduce((sum, _, i) => sum + i, 0);
  const sumY = positions.reduce((sum, y) => sum + y, 0);
  const sumXY = positions.reduce((sum, y, i) => sum + i * y, 0);
  const sumX2 = positions.reduce((sum, _, i) => sum + i * i, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  return intercept + slope * (n + forecastDays - 1); // Forecast next value
}

/**
 * Comprehensive analytics calculation hook for Exa Ranking Lab.
 * 
 * This is the main analytics engine that processes queries and snapshots to generate
 * actionable insights including ranking trends, performance metrics, anomaly detection,
 * and predictive analytics. All calculations are memoized for optimal performance.
 * 
 * Features:
 * - Ranking trend analysis with volatility and anomaly detection
 * - Category distribution with optional semantic clustering
 * - Hourly success rate analysis with confidence intervals
 * - Top performing queries identification
 * - Statistical performance metrics
 * - Predictive modeling for future rankings
 * 
 * @param {QueryConfig[]} queries - Array of search query configurations
 * @param {RankingSnapshot[]} snapshots - Array of ranking snapshot data
 * @param {string} timeRange - Time range for analysis ("7d", "30d", "90d", "1y")
 * @param {Object} [filters={}] - Optional filtering criteria
 * @param {string} [filters.queryType] - Filter by specific query type
 * @param {string} [filters.domain] - Filter by domain presence
 * 
 * @returns {Object} Comprehensive analytics data object
 * @returns {number} returns.timeRangeMs - Time range in milliseconds
 * @returns {RankingSnapshot[]} returns.filteredSnapshots - Filtered snapshot data
 * @returns {TrendPoint[]} returns.rankingTrendData - Daily ranking trends with predictions
 * @returns {Object[]} returns.categoryDistribution - Query category distribution
 * @returns {Object[]} returns.successRateByHour - Hourly success rate statistics
 * @returns {Object[]} returns.performanceData - Performance metrics by hour
 * @returns {Object[]} returns.topPerformingQueries - Top 5 most stable queries
 * @returns {Object[]} returns.queryPerformanceStats - Query performance statistics
 * 
 * @example
 * ```
 * const {
 *   rankingTrendData,
 *   categoryDistribution,
 *   topPerformingQueries
 * } = useAnalyticsCalculations(
 *   queries,
 *   snapshots,
 *   "30d",
 *   { queryType: "research" }
 * );
 * ```
 */
export function useAnalyticsCalculations(
  queries: QueryConfig[],
  snapshots: RankingSnapshot[],
  timeRange: string,
  filters: { queryType?: string; domain?: string } = {}
) {
  /**
   * Memoized time range calculation in milliseconds
   */
  const timeRangeMs = useMemo(() => calculateTimeRangeMs(timeRange), [timeRange]);

  /**
   * Memoized filtered snapshots based on time range and custom filters
   */
  const filteredSnapshots = useMemo(() => filterSnapshots(snapshots, timeRangeMs, filters), [snapshots, timeRangeMs, filters]);

  /**
   * Ranking trend analysis with volatility detection and anomaly identification.
   * 
   * Aggregates daily ranking data, calculates volatility metrics, applies statistical
   * anomaly detection using 2-sigma threshold, and generates trend predictions.
   */
  // Enhanced anomaly detection in rankingTrendData
const rankingTrendData = useMemo(() => {
  if (filteredSnapshots.length === 0) return [];

  const dailyData = new Map<string, { positions: number[]; volatility: number; isAnomaly: boolean }>();
  const allVolatilities: number[] = [];
  const allPositions: number[] = [];

  filteredSnapshots.forEach((snapshot) => {
    const date = new Date(snapshot.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const existing = dailyData.get(date) || { positions: [], volatility: 0, isAnomaly: false };
    const positions = snapshot.results.map(r => r.position);
    existing.positions.push(...positions);
    allPositions.push(...positions);
    dailyData.set(date, existing);
  });

  const trend: TrendPoint[] = Array.from(dailyData.entries()).map(([date, data]) => {
    const avgPosition = data.positions.length > 0 ? data.positions.reduce((sum, pos) => sum + pos, 0) / data.positions.length : 0;
    const variance = data.positions.length > 0 ? data.positions.reduce((sum, pos) => sum + Math.pow(pos - avgPosition, 2), 0) / data.positions.length : 0;
    const volatility = Math.sqrt(variance);
    allVolatilities.push(volatility);
    return { 
      date, 
      avgPosition, 
      volatility, 
      count: data.positions.length, 
      predictedPosition: predictTrend(data.positions), 
      isAnomaly: false,
      anomalyType: undefined,
      anomalyScore: 0,
      volatilityThreshold: 0
    };
  });

  // Enhanced anomaly detection with multiple criteria
  if (trend.length > 2) {
    const meanVol = allVolatilities.reduce((sum, v) => sum + v, 0) / allVolatilities.length;
    const stdDevVol = Math.sqrt(allVolatilities.reduce((sum, v) => sum + Math.pow(v - meanVol, 2), 0) / allVolatilities.length);
    
    const meanPos = allPositions.reduce((sum, p) => sum + p, 0) / allPositions.length;
    const stdDevPos = Math.sqrt(allPositions.reduce((sum, p) => sum + Math.pow(p - meanPos, 2), 0) / allPositions.length);
    
    trend.forEach((point, index) => {
      const volatilityThreshold = meanVol + 2 * stdDevVol;
      point.volatilityThreshold = volatilityThreshold;
      
      // 1. High volatility anomaly
      if (point.volatility > volatilityThreshold) {
        point.isAnomaly = true;
        point.anomalyType = 'high_volatility';
        point.anomalyScore = (point.volatility - meanVol) / stdDevVol;
      }
      
      // 2. Position spike anomaly
      if (Math.abs(point.avgPosition - meanPos) > 2 * stdDevPos) {
        point.isAnomaly = true;
        point.anomalyType = 'position_spike';
        point.anomalyScore = Math.abs(point.avgPosition - meanPos) / stdDevPos;
      }
      
      // 3. Sudden position changes (comparing to previous day)
      if (index > 0) {
        const prevPoint = trend[index - 1];
        const positionChange = Math.abs(point.avgPosition - prevPoint.avgPosition);
        const changeThreshold = stdDevPos * 1.5; // More sensitive to daily changes
        
        if (positionChange > changeThreshold) {
          point.isAnomaly = true;
          if (point.avgPosition > prevPoint.avgPosition) {
            point.anomalyType = 'sudden_drop'; // Higher position number = worse ranking
          } else {
            point.anomalyType = 'sudden_rise'; // Lower position number = better ranking
          }
          point.anomalyScore = positionChange / stdDevPos;
        }
      }
    });
  }

  return trend.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}, [filteredSnapshots]);


  /**
   * Category distribution analysis with semantic clustering support.
   * 
   * Analyzes query categories, applies optional semantic clustering,
   * calculates distribution percentages, and assigns predefined colors
   * for consistent visualization across the application.
   */
  const categoryDistribution = useMemo(() => {
    if (queries.length === 0) return [];

    const categoryColors: Record<string, string> = {
      "company": "#3b82f6",
      "research paper": "#a21caf",
      "news": "#22c55e",
      "pdf": "#f59e42",
      "github": "#24292f",
      "tweet": "#1da1f2",
      "personal site": "#f43f5e",
      "linkedin profile": "#0a66c2",
      "financial report": "#eab308",
      "documents": "#f97316", // for clustered categories like 'pdf' + 'financial report'
    };
    // Count category frequency
    const rawCounts: Record<string, number> = queries.reduce((acc, query) => {
      const category = query.category || "unknown";
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Optionally cluster categories
    const clusteredCounts = clusterCategories(rawCounts);

    // Total number of categorized queries
    const total = Object.values(clusteredCounts).reduce((sum, count) => sum + count, 0);

    // Build the final distribution array
    const distribution = Object.entries(clusteredCounts).map(([name, value]) => ({
      name,
      value,
      percent: total > 0 ? (value / total) * 100 : 0,
      color: categoryColors[name] || "#94a3b8", // fallback color
      diversity: value / queries.length, // how much this category contributes
    }));

    return distribution.sort((a, b) => b.percent - a.percent);
  }, [queries]);

  /**
   * Hourly success rate analysis with statistical confidence intervals.
   * 
   * Calculates success rates, response times, and failure rates by hour of day.
   * Includes 95% confidence intervals for response times using normal distribution
   * approximation for statistical significance testing.
   */
  const successRateByHour = useMemo(() => {
    if (filteredSnapshots.length === 0) return new Array(24).fill({ hour: 0, successRate: 0, avgTime: 0, confidenceInterval: [0, 0] });

    const hourlyStats = Array.from({ length: 24 }, () => ({ success: 0, total: 0, time: 0, failures: 0, times: [] as number[] }));
    filteredSnapshots.forEach((snapshot) => {
      const hour = new Date(snapshot.timestamp).getHours();
      hourlyStats[hour].total++;
      if (snapshot.results.length > 0) {
        hourlyStats[hour].success++;
        hourlyStats[hour].time += snapshot.metadata.responseTime;
        hourlyStats[hour].times.push(snapshot.metadata.responseTime);
      } else {
        hourlyStats[hour].failures++;
      }
    });

    return hourlyStats.map((stats, hour) => {
      const successRate = stats.total > 0 ? (stats.success / stats.total) * 100 : 0;
      const avgTime = stats.success > 0 ? stats.time / stats.success : 0;
      const variance = stats.times.length > 0 ? stats.times.reduce((sum, t) => sum + Math.pow(t - avgTime, 2), 0) / stats.times.length : 0;
      const stdDev = Math.sqrt(variance);
      const confidenceInterval = [avgTime - 1.96 * stdDev, avgTime + 1.96 * stdDev]; // 95% CI
      return { hour, successRate, avgTime, failureRate: (stats.failures / stats.total) * 100, confidenceInterval };
    });
  }, [filteredSnapshots]);

  /**
   * Performance data alias for backward compatibility.
   * 
   * Provides the same hourly statistics as successRateByHour for components
   * that expect performance-specific data formatting.
   */
  const performanceData = useMemo(() => successRateByHour, [successRateByHour]);

  /**
   * Top performing queries analysis with stability metrics and trend predictions.
   * 
   * Identifies the most stable queries based on position variance, calculates
   * trend slopes, determines trend direction, and provides future position
   * predictions using linear regression.
   */
  const topPerformingQueries = useMemo(() => {
    if (queries.length === 0 || filteredSnapshots.length === 0) return [];

    const queryStats = new Map<string, { name: string; positions: number[]; lastPosition: number | null }>();
    filteredSnapshots.forEach((snapshot) => {
      const query = queries.find(q => q.id === snapshot.queryId);
      if (!query) return;
      const stats = queryStats.get(query.id) || { name: query.name, positions: [], lastPosition: null };
      const avgPosition = snapshot.results.length > 0
        ? snapshot.results.reduce((sum, r) => sum + r.position, 0) / snapshot.results.length
        : 0;
      stats.positions.push(avgPosition);
      stats.lastPosition = avgPosition;
      queryStats.set(query.id, stats);
    });

    return Array.from(queryStats.values()).map(stats => {
      const avgPosition = stats.positions.length > 0 ? stats.positions.reduce((sum, pos) => sum + pos, 0) / stats.positions.length : 0;
      const variance = stats.positions.length > 0 ? stats.positions.reduce((sum, pos) => sum + Math.pow(pos - avgPosition, 2), 0) / stats.positions.length : 0;
      const stability = 100 - Math.sqrt(variance);
      const recentPositions = stats.positions.slice(-3);
      const trendSlope = recentPositions.length < 2 ? 0 : (recentPositions[recentPositions.length - 1] - recentPositions[0]) / (recentPositions.length - 1);
      const trend = trendSlope < 0 ? "up" : trendSlope > 0 ? "down" : "stable";
      const predictedPosition = predictTrend(stats.positions);
      return { name: stats.name, avgPosition, stability, trend, trendSlope, predictedPosition }; // New: Prediction
    }).sort((a, b) => b.stability - a.stability).slice(0, 5);
  }, [queries, filteredSnapshots]);

  /**
   * Query performance statistics summary for tabular display.
   * 
   * Transforms top performing queries data into a format optimized for
   * table components, including current and predicted positions sorted
   * by performance ranking.
   */
  const queryPerformanceStats = useMemo(() => {
    return topPerformingQueries.map(q => ({
      name: q.name,
      lastPosition: q.avgPosition,
      predictedPosition: q.predictedPosition, // New
    })).sort((a, b) => (a.lastPosition ?? 0) - (b.lastPosition ?? 0)).slice(0, 5);
  }, [topPerformingQueries]);

  return {
    timeRangeMs,
    filteredSnapshots,
    rankingTrendData,
    categoryDistribution,
    successRateByHour,
    performanceData,
    topPerformingQueries,
    queryPerformanceStats,
  };
}
