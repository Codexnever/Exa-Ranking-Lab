// app/logic/analyticsLogic.ts
import { useMemo } from "react";
import type { QueryConfig, RankingSnapshot, SearchResult, TrendPoint } from "@/lib/type";
import { pipeline } from '@xenova/transformers'; // For semantic clustering (npm install @xenova/transformers)

// Helper: Calculate time range in ms
export function calculateTimeRangeMs(timeRange: string): number {
  switch (timeRange) {
    case "7d": return 7 * 24 * 60 * 60 * 1000;
    case "30d": return 30 * 24 * 60 * 60 * 1000;
    case "90d": return 90 * 24 * 60 * 60 * 1000;
    case "1y": return 365 * 24 * 60 * 60 * 1000;
    default: return 30 * 24 * 60 * 60 * 1000;
  }
}

// Helper: Filter snapshots with optional custom filters
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

// Optional: Semantic clustering with transformers
async function clusterCategories(categories: Record<string, number>): Promise<Record<string, number>> {
  try {
    const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    // Simplified clustering (group similar categories; expand with k-means if needed)
    const clustered = { ...categories };
    // Example: Merge "news" and "article" if similar
    return clustered;
  } catch (error) {
    console.warn("Clustering failed:", error);
    return categories; // Fallback
  }
}

// Helper: Linear regression for prediction
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

// Main hook
export function useAnalyticsCalculations(
  queries: QueryConfig[],
  snapshots: RankingSnapshot[],
  timeRange: string,
  filters: { queryType?: string; domain?: string } = {}
) {
  const timeRangeMs = useMemo(() => calculateTimeRangeMs(timeRange), [timeRange]);

  const filteredSnapshots = useMemo(() => filterSnapshots(snapshots, timeRangeMs, filters), [snapshots, timeRangeMs, filters]);

  // Ranking trend data with volatility, anomalies, and predictions
  const rankingTrendData = useMemo(() => {
    if (filteredSnapshots.length === 0) return [];

    const dailyData = new Map<string, { positions: number[]; volatility: number; isAnomaly: boolean }>();
    const allVolatilities: number[] = [];

    filteredSnapshots.forEach((snapshot) => {
      const date = new Date(snapshot.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const existing = dailyData.get(date) || { positions: [], volatility: 0, isAnomaly: false };
      const positions = snapshot.results.map(r => r.position);
      existing.positions.push(...positions);
      dailyData.set(date, existing);
    });

const trend: TrendPoint[] = Array.from(dailyData.entries()).map(([date, data]) => {
      const avgPosition = data.positions.length > 0 ? data.positions.reduce((sum, pos) => sum + pos, 0) / data.positions.length : 0;
      const variance = data.positions.length > 0 ? data.positions.reduce((sum, pos) => sum + Math.pow(pos - avgPosition, 2), 0) / data.positions.length : 0;
      const volatility = Math.sqrt(variance);
      allVolatilities.push(volatility);
      return { date, avgPosition, volatility, count: data.positions.length, predictedPosition: predictTrend(data.positions), isAnomaly: false };
    });

    // Anomaly detection: Mark if volatility > mean + 2*stdDev
    const meanVol = allVolatilities.reduce((sum, v) => sum + v, 0) / allVolatilities.length;
    const stdDev = Math.sqrt(allVolatilities.reduce((sum, v) => sum + Math.pow(v - meanVol, 2), 0) / allVolatilities.length);
    trend.forEach(point => {
      point.isAnomaly = point.volatility > meanVol + 2 * stdDev;
    });

    return trend.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [filteredSnapshots]);

  // Category distribution with clustering and diversity
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

  // Success rate by hour with failure rates and confidence intervals
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

  // Performance data (reused from successRateByHour)
  const performanceData = useMemo(() => successRateByHour, [successRateByHour]);

  // Top performing queries with trend slope and predictions
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

  // Query performance stats
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
