// All analytics-related calculation hooks and logic for the analytics page
import { useMemo } from "react"
import type { QueryConfig, RankingSnapshot, SearchResult } from "@/lib/type"

 export function useAnalyticsCalculations(queries: QueryConfig[], snapshots: RankingSnapshot[], timeRange: string) {
  // Calculate time range based on selection
  const timeRangeMs = useMemo(() => {
    const days = timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : timeRange === "90d" ? 90 : 365
    return days * 24 * 60 * 60 * 1000
  }, [timeRange])

  // Filter snapshots based on time range
  const filteredSnapshots = useMemo(() => {
    const cutoffDate = new Date(Date.now() - timeRangeMs)
    return snapshots.filter(s => new Date(s.timestamp) > cutoffDate)
  }, [snapshots, timeRangeMs])

  // Generate ranking trend data from real snapshots
  const rankingTrendData = useMemo(() => {
    const dailyData = new Map<string, { totalPosition: number, count: number, volatility: number }>();
    filteredSnapshots.forEach((snapshot) => {
      const date = new Date(snapshot.timestamp).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      const existing = dailyData.get(date) || { totalPosition: 0, count: 0, volatility: 0 };
      const avgPosition =
        snapshot.results.reduce((sum: number, r) => sum + r.position, 0) / snapshot.results.length;
      dailyData.set(date, {
        totalPosition: existing.totalPosition + avgPosition,
        count: existing.count + 1,
        volatility:
          existing.volatility +
          (snapshot.results.length
            ? Math.sqrt(
              snapshot.results.reduce(
                (sum: number, r) => sum + Math.pow(r.position - avgPosition, 2),
                0
              ) / snapshot.results.length
            )
            : 0),
      });
    });
    const unsorted = Array.from(dailyData.entries()).map(([date, data]) => ({
      date,
      avgPosition: data.totalPosition / data.count,
      volatility: data.volatility / data.count,
    }));
    return unsorted.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }, [filteredSnapshots]);

  // Generate category distribution data with colors
  const categoryDistribution = useMemo(() => {
    const categoryColors = {
      "company": "#3b82f6",
      "research paper": "#a21caf",
      "news": "#22c55e",
      "pdf": "#f59e42",
      "github": "#24292f",
      "tweet": "#1da1f2",
      "personal site": "#f43f5e",
      "linkedin profile": "#0a66c2",
      "financial report": "#eab308"
    };
    const categories = queries.reduce<Record<string, number>>((acc, query: QueryConfig) => {
      acc[query.category] = (acc[query.category] || 0) + 1;
      return acc;
    }, {});
    const total = Object.values(categories).reduce((sum, count) =>
      sum + (typeof count === 'number' ? count : 0), 0);
    return Object.entries(categories).map(([name, value]) => ({
      name,
      value: typeof value === 'number' ? value : 0,
      percent: total > 0 ? ((typeof value === 'number' ? value : 0) / total) * 100 : 0,
      color: categoryColors[name as keyof typeof categoryColors] || "#94a3b8"
    }));
  }, [queries])

  // Calculate success rate by hour
  const successRateByHour = useMemo(() => {
    const hourlyStats: { success: number, total: number, time: number }[] = new Array(24).fill(null).map(() => ({
      success: 0,
      total: 0,
      time: 0
    }))
    filteredSnapshots.forEach((snapshot: RankingSnapshot) => {
      const currentHour = new Date(snapshot.timestamp).getHours()
      const isSuccess = snapshot.results.length > 0
      hourlyStats[currentHour].total++
      if (isSuccess) {
        hourlyStats[currentHour].success++
        hourlyStats[currentHour].time += snapshot.metadata.responseTime
      }
    })
    return hourlyStats.map((stats, hourIndex) => ({
      hour: hourIndex,
      successRate: stats.total > 0 ? (stats.success / stats.total) * 100 : 0,
      avgTime: stats.success > 0 ? stats.time / stats.success : 0
    }))
  }, [filteredSnapshots])

  // Calculate performance data
  const performanceData = useMemo(() => {
    const hourlyData = filteredSnapshots.reduce((acc: Map<number, { success: number, total: number, time: number }>, snapshot: RankingSnapshot) => {
      const hour = new Date(snapshot.timestamp).getHours()
      const current = acc.get(hour) || { success: 0, total: 0, time: 0 }
      current.total++
      if (snapshot.results.length > 0) {
        current.success++
        current.time += snapshot.metadata.responseTime
      }
      acc.set(hour, current)
      return acc
    }, new Map())
    return Array.from(hourlyData.entries())
      .map(([hour, data]) => ({
        hour,
        responseTime: data.success > 0 ? data.time / data.success : 0,
        successRate: (data.success / data.total) * 100
      }))
      .sort((a, b) => a.hour - b.hour)
  }, [filteredSnapshots])

  // Calculate top performing queries
  const topPerformingQueries = useMemo(() => {
    const queryStats = new Map<string, { name: string, positions: number[], lastPosition: number | null }>()
    filteredSnapshots.forEach(snapshot => {
      const query = queries.find(q => q.id === snapshot.queryId)
      if (!query) return
      const stats = queryStats.get(query.id) || {
        name: query.name,
        positions: [],
        lastPosition: null
      }
      const avgPosition = snapshot.results.reduce((sum: number, r) => sum + r.position, 0) / snapshot.results.length
      stats.positions.push(avgPosition)
      stats.lastPosition = avgPosition
      queryStats.set(query.id, stats)
    })
    return Array.from(queryStats.entries())
      .map(([_, stats]) => {
        const avgPosition = stats.positions.reduce((sum: number, pos: number) => sum + pos, 0) / stats.positions.length
        const stability = 100 - (Math.sqrt(stats.positions.reduce((sum: number, pos: number) =>
          sum + Math.pow(pos - avgPosition, 2), 0) / stats.positions.length))
        const recentPositions = stats.positions.slice(-2)
        const trend = recentPositions.length < 2 ? "stable"
          : recentPositions[1] < recentPositions[0] ? "up"
            : recentPositions[1] > recentPositions[0] ? "down"
              : "stable"
        return {
          name: stats.name,
          avgPosition,
          stability,
          trend
        }
      })
      .sort((a, b) => b.stability - a.stability)
      .slice(0, 5)
  }, [queries, filteredSnapshots])

  // Update query performance stats with proper typing
  const queryPerformanceStats = useMemo(() => {
    const statsMap = new Map<string, { name: string, positions: number[], lastPosition: number | null }>();
    filteredSnapshots.forEach((snapshot: RankingSnapshot) => {
      const query = queries.find((q: QueryConfig) => q.id === snapshot.queryId);
      if (!query) return;
      const avgPosition = snapshot.results.reduce((sum: number, r: SearchResult) =>
        sum + r.position, 0) / snapshot.results.length;
      let stats = statsMap.get(query.id);
      if (!stats) {
        stats = {
          name: query.name,
          positions: [] as number[],
          lastPosition: null
        };
        statsMap.set(query.id, stats);
      }
      stats.positions.push(avgPosition);
      stats.lastPosition = avgPosition;
    });
    return Array.from(statsMap.values())
      .sort((a, b) => (b.lastPosition ?? 0) - (a.lastPosition ?? 0))
      .slice(0, 5);
  }, [filteredSnapshots, queries]);

  return {
    timeRangeMs,
    filteredSnapshots,
    rankingTrendData,
    categoryDistribution,
    successRateByHour,
    performanceData,
    topPerformingQueries,
    queryPerformanceStats
  }
}
