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
 * - Smart snapshot deduplication strategies
 * 
 */

// app/logic/analyticsLogic.ts
// No React imports needed for pure calculation
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
 * Filters and deduplicates ranking snapshots based on time range and custom criteria.
 * 
 * Applies temporal filtering, deduplication strategies, optional query type filtering,
 * domain-specific filtering, and enforces a maximum snapshot limit for performance optimization.
 * 
 * @param {RankingSnapshot[]} snapshots - Array of ranking snapshot data
 * @param {number} timeRangeMs - Time range in milliseconds for filtering
 * @param {Object} filters - Optional filtering criteria
 * @param {string} [filters.queryType] - Filter by specific query type
 * @param {string} [filters.domain] - Filter by domain presence in results
 * @param {number} [maxSnapshots=1000] - Maximum number of snapshots to return
 * @param {string} [deduplicationStrategy="latest"] - Strategy for handling duplicates
 * @returns {RankingSnapshot[]} Filtered and deduplicated array of snapshots
 */
export function filterSnapshots(
  snapshots: RankingSnapshot[],
  timeRangeMs: number,
  filters: { queryType?: string; domain?: string } = {},
  maxSnapshots: number = 1000,
  deduplicationStrategy: 'latest' | 'average' | 'best' | 'worst' | 'none' = 'latest'
): RankingSnapshot[] {
  if (!Array.isArray(snapshots)) return [];
  
  const cutoffDate = new Date(Date.now() - timeRangeMs);
  let filtered = snapshots.filter(s => s && s.timestamp && new Date(s.timestamp) > cutoffDate);

  // Apply existing filters
  if (filters.queryType) {
    filtered = filtered.filter(s => s.queryType === filters.queryType);
  }
  if (filters.domain) {
    filtered = filtered.filter(s =>
      s.results?.some(r => r.url?.includes(filters.domain!))
    );
  }

  // Apply deduplication strategy
  if (deduplicationStrategy !== 'none') {
    filtered = deduplicateSnapshots(filtered, deduplicationStrategy);
  }

  return filtered.slice(0, maxSnapshots);
}

/**
 * Deduplicates snapshots based on query ID and date using specified strategy.
 * 
 * Groups snapshots by query ID and date (YYYY-MM-DD), then applies the selected
 * strategy to choose the representative snapshot for each group.
 * 
 * @param {RankingSnapshot[]} snapshots - Snapshots to deduplicate
 * @param {string} strategy - Deduplication strategy
 * @returns {RankingSnapshot[]} Deduplicated snapshots
 */
export function deduplicateSnapshots(
  snapshots: RankingSnapshot[],
  strategy: "latest" | "average" | "best" | "worst"
): RankingSnapshot[] {
  if (!Array.isArray(snapshots)) return [];

  const grouped = new Map<string, RankingSnapshot[]>();

  snapshots.forEach((snapshot) => {
    if (!snapshot.timestamp || !snapshot.queryId) return;

    const date = new Date(snapshot.timestamp).toISOString().split("T")[0];
    const key = `${snapshot.queryId}-${date}`;

    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(snapshot);
  });

  const deduplicated: RankingSnapshot[] = [];

  grouped.forEach((groupSnapshots) => {
    if (groupSnapshots.length === 1) {
      deduplicated.push(groupSnapshots[0]);
      return;
    }

    let selectedSnapshot: RankingSnapshot;

    switch (strategy) {
      case "latest":
        selectedSnapshot = groupSnapshots.reduce((latest, current) =>
          new Date(current.timestamp) > new Date(latest.timestamp) ? current : latest
        );
        break;

      case "best":
        selectedSnapshot = groupSnapshots.reduce((best, current) => {
          const currentAvg =
            current.results?.length > 0
              ? current.results.reduce((sum, r) => sum + (r.position || 0), 0) / current.results.length
              : Infinity;
          const bestAvg =
            best.results?.length > 0
              ? best.results.reduce((sum, r) => sum + (r.position || 0), 0) / best.results.length
              : Infinity;
          return currentAvg < bestAvg ? current : best;
        });
        break;

      case "worst":
        selectedSnapshot = groupSnapshots.reduce((worst, current) => {
          const currentAvg =
            current.results?.length > 0
              ? current.results.reduce((sum, r) => sum + (r.position || 0), 0) / current.results.length
              : 0;
          const worstAvg =
            worst.results?.length > 0
              ? worst.results.reduce((sum, r) => sum + (r.position || 0), 0) / worst.results.length
              : 0;
          return currentAvg > worstAvg ? current : worst;
        });
        break;

      case "average":
        selectedSnapshot = createAverageSnapshot(groupSnapshots);
        break;

      default: 
        selectedSnapshot = groupSnapshots[0];
    }

    deduplicated.push(selectedSnapshot);
  });

  return deduplicated;
}


/**
 * Creates a synthetic snapshot representing the average of multiple snapshots.
 * 
 * Combines multiple snapshots from the same query on the same day into a single
 * representative snapshot with averaged metrics and deduplicated results.
 * 
 * @param {RankingSnapshot[]} snapshots - Snapshots to average
 * @returns {RankingSnapshot} Synthetic averaged snapshot
 */
export function createAverageSnapshot(snapshots: RankingSnapshot[]): RankingSnapshot {
  if (!Array.isArray(snapshots) || snapshots.length === 0) {
    throw new Error("Invalid snapshots array for averaging");
  }

  if (snapshots.length === 1) return snapshots[0];

  const base = snapshots[0];

  const avgResponseTime =
    snapshots.reduce((sum, s) => sum + (s.metadata?.responseTime || 0), 0) / snapshots.length;

  const urlMap = new Map<string, { positions: number[]; title: string; snippet: string }>();

  snapshots.forEach((snapshot) => {
    snapshot.results?.forEach((result) => {
      if (!result.url) return;
      if (!urlMap.has(result.url)) {
        urlMap.set(result.url, {
          positions: [],
          title: result.title || "",
          snippet: result.snippet || "",
        });
      }
      urlMap.get(result.url)!.positions.push(result.position || 0);
    });
  });

  const averagedResults = Array.from(urlMap.entries())
    .map(([url, data]) => {
      let foundResult: any = null;
      for (const snapshot of snapshots) {
        foundResult = snapshot.results?.find((r) => r.url === url);
        if (foundResult) break;
      }
      const avgPosition = data.positions.reduce((sum, pos) => sum + pos, 0) / data.positions.length;
      return {
        id: foundResult?.id ?? `avg-${url}`,
        url,
        title: data.title,
        snippet: data.snippet,
        position: avgPosition,
        domain: foundResult?.domain ?? "",
        contentType: foundResult?.contentType ?? "",
        score: foundResult?.score ?? 0,
        timestamp: foundResult?.timestamp ?? new Date(),
        contentHash: foundResult?.contentHash ?? "",
      };
    })
    .sort((a, b) => a.position - b.position);

  return {
    ...base,
    id: `avg-${base.queryId}-${new Date(base.timestamp).toISOString().split("T")[0]}`,
    results: averagedResults,
    metadata: {
      ...base.metadata,
      responseTime: avgResponseTime,
      isAveraged: true,
      sourceCount: snapshots.length,
    } as any,
    timestamp: base.timestamp,
  };
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
 */
export function clusterCategories(categories: Record<string, number>): Record<string, number> {
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
 */
export function predictTrend(positions: number[], forecastDays: number = 7): number {
  if (!Array.isArray(positions) || positions.length < 2) return positions?.[0] || 0;

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
 * Calculate ranking trend data - PURE FUNCTION
 */
export function calculateRankingTrendData(filteredSnapshots: RankingSnapshot[]): TrendPoint[] {
  if (!Array.isArray(filteredSnapshots) || filteredSnapshots.length === 0) return [];

  const dailyData = new Map<string, { positions: number[]; volatility: number; isAnomaly: boolean }>();
  const allVolatilities: number[] = [];
  const allPositions: number[] = [];

  filteredSnapshots.forEach((snapshot) => {
    if (!snapshot.timestamp || !snapshot.results) return;
    
    const date = new Date(snapshot.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const existing = dailyData.get(date) || { positions: [], volatility: 0, isAnomaly: false };
    const positions = snapshot.results.map(r => r.position || 0);
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
}

/**
 * Calculate category distribution - PURE FUNCTION
 */
export function calculateCategoryDistribution(queries: QueryConfig[]) {
  if (!Array.isArray(queries) || queries.length === 0) return [];

  const categoryColors: Record<string, string> = {
    "company": "#3b82f6",
    "research paper": "#a21caf",
    "news": "#22c55e",
    "pdf": "#f59e42",
    "github": "#24292f",
    "tweet": "#1df27dff",
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
}

/**
 * Calculate success rate by hour - PURE FUNCTION
 */
export function calculateSuccessRateByHour(filteredSnapshots: RankingSnapshot[]) {
  if (!Array.isArray(filteredSnapshots) || filteredSnapshots.length === 0) {
    return Array.from({ length: 24 }, (_, hour) => ({ 
      hour, 
      successRate: 0, 
      avgTime: 0, 
      failureRate: 0,
      confidenceInterval: [0, 0] 
    }));
  }

  const hourlyStats = Array.from({ length: 24 }, () => ({ success: 0, total: 0, time: 0, failures: 0, times: [] as number[] }));
  filteredSnapshots.forEach((snapshot) => {
    if (!snapshot.timestamp || !snapshot.metadata) return;
    
    const hour = new Date(snapshot.timestamp).getHours();
    hourlyStats[hour].total++;
    if (snapshot.results && snapshot.results.length > 0) {
      hourlyStats[hour].success++;
      hourlyStats[hour].time += snapshot.metadata.responseTime || 0;
      hourlyStats[hour].times.push(snapshot.metadata.responseTime || 0);
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
    const failureRate = stats.total > 0 ? (stats.failures / stats.total) * 100 : 0;
    return { hour, successRate, avgTime, failureRate, confidenceInterval };
  });
}

/**
 * Calculate top performing queries - PURE FUNCTION
 */
export function calculateTopPerformingQueries(queries: QueryConfig[], filteredSnapshots: RankingSnapshot[]) {
  if (!Array.isArray(queries) || !Array.isArray(filteredSnapshots) || queries.length === 0 || filteredSnapshots.length === 0) return [];

  const queryStats = new Map<string, { name: string; positions: number[]; lastPosition: number | null }>();
  filteredSnapshots.forEach((snapshot) => {
    const query = queries.find(q => q.id === snapshot.queryId);
    if (!query) return;
    const stats = queryStats.get(query.id) || { name: query.name, positions: [], lastPosition: null };
    const avgPosition = snapshot.results && snapshot.results.length > 0
      ? snapshot.results.reduce((sum, r) => sum + (r.position || 0), 0) / snapshot.results.length
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
    return { name: stats.name, avgPosition, stability, trend, trendSlope, predictedPosition };
  }).sort((a, b) => b.stability - a.stability).slice(0, 5);
}

/**
 * Comprehensive analytics calculation hook for Exa Ranking Lab.
 * 
 * This is the main analytics engine that processes queries and snapshots to generate
 * actionable insights including ranking trends, performance metrics, anomaly detection,
 * and predictive analytics. All calculations are memoized for optimal performance.
 * 
 * @param {QueryConfig[]} queries - Array of search query configurations
 * @param {RankingSnapshot[]} snapshots - Array of ranking snapshot data
 * @param {string} timeRange - Time range for analysis ("7d", "30d", "90d", "1y")
 * @param {Object} [filters={}] - Optional filtering criteria
 * @param {string} [deduplicationStrategy="latest"] - Strategy for handling duplicate snapshots
 * 
 * @returns {Object} Comprehensive analytics data object
 */
export function analyticsCalculations(
  queries: QueryConfig[],
  snapshots: RankingSnapshot[],
  timeRange: string,
  filters: { queryType?: string; domain?: string } = {},
  deduplicationStrategy: 'latest' | 'average' | 'best' | 'worst' | 'none' = 'latest'
) {
  const stableFilters = {
    queryType: filters.queryType || "",
    domain: filters.domain || ""
  };

  const timeRangeMs = calculateTimeRangeMs(timeRange);
  const filteredSnapshots = filterSnapshots(snapshots || [], timeRangeMs, stableFilters, 1000, deduplicationStrategy);
  const rankingTrendData = calculateRankingTrendData(filteredSnapshots);
  const categoryDistribution = calculateCategoryDistribution(queries || []);
  const successRateByHour = calculateSuccessRateByHour(filteredSnapshots);
  const performanceData = successRateByHour;
  const topPerformingQueries = calculateTopPerformingQueries(queries || [], filteredSnapshots);
  const queryPerformanceStats = topPerformingQueries.map(q => ({
    name: q.name,
    lastPosition: q.avgPosition,
    predictedPosition: q.predictedPosition,
  })).sort((a, b) => (a.lastPosition ?? 0) - (b.lastPosition ?? 0)).slice(0, 5);

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
