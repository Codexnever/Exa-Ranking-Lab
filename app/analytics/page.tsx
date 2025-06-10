"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, MemoizedSelectTrigger as SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import { TrendingUp, TrendingDown, BarChart3, LucidePieChart, Download, Globe, Clock, Target } from "lucide-react"
import { useAnalytics } from "@/hooks/use-analytics"
import { useQueries } from "@/hooks/use-queries"
import { useSnapshots } from "@/hooks/use-snapshots"
import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart as RechartsBarChart,
  Bar,
  PieChart as RechartsPieChart,
  Cell,
  Pie,
} from "recharts"
import { useEffect, useMemo, useState } from "react"
import type { QueryConfig, RankingSnapshot, SearchResult } from "@/lib/types"

interface DailyStats {
  totalPosition: number
  count: number
  volatility: number
}

interface HourlyStats {
  totalTime: number
  successCount: number
  totalCount: number
}

interface QueryStats {
  name: string
  positions: number[]
  lastPosition: number | null
}

interface RankingTrendDataPoint {
  date: string
  avgPosition: number
  volatility: number
}

interface CategoryDistribution {
  name: string
  value: number
  percent: number
}

interface SuccessRateDataPoint {
  hour: number
  successRate: number
  avgTime: number
}

interface HourlyData {
  success: number;
  total: number;
  time: number;
}

interface PerformanceDataPoint {
  hour: number;
  responseTime: number;
  successRate: number;
}

interface CategoryData extends CategoryDistribution {
  color: string;
}

export default function Analytics() {
  const { analytics, fetchAnalytics } = useAnalytics()
  const { queries } = useQueries()
  const { snapshots } = useSnapshots()
  const [timeRange, setTimeRange] = useState("30d")

  useEffect(() => {
    fetchAnalytics()
  }, [])
console.log("Debugg Analytics response frontend:", analytics);

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
    const dailyData = new Map<string, DailyStats>();

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

    // Sort outside the loop and inside the same useMemo
    return unsorted.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }, [filteredSnapshots]);


  // Generate category distribution data with colors
  const categoryDistribution = useMemo(() => {
    const categoryColors = {
      web: "#3b82f6",
      news: "#22c55e",
      research: "#eab308",
      code: "#ec4899"
    };

    const categories = queries.reduce<Record<string, number>>((acc, query: QueryConfig) => {
      acc[query.category] = (acc[query.category] || 0) + 1;
      return acc;
    }, {});

    const total = Object.values(categories).reduce((sum, count) =>
      sum + (typeof count === 'number' ? count : 0), 0);

    return Object.entries(categories).map(([name, value]): CategoryData => ({
      name,
      value: typeof value === 'number' ? value : 0,
      percent: total > 0 ? ((typeof value === 'number' ? value : 0) / total) * 100 : 0,
      color: categoryColors[name as keyof typeof categoryColors] || "#94a3b8"
    }));
  }, [queries])

  // Calculate success rate by hour
  const successRateByHour: SuccessRateDataPoint[] = useMemo(() => {
    const hourlyStats: HourlyData[] = new Array(24).fill(null).map(() => ({
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
  const performanceData: PerformanceDataPoint[] = useMemo(() => {
    const hourlyData = filteredSnapshots.reduce((acc: Map<number, HourlyData>, snapshot: RankingSnapshot) => {
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
    const queryStats = new Map<string, QueryStats>()

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

        // Calculate trend
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
    const statsMap = new Map<string, QueryStats>();

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

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Analytics</h2>
          <p className="text-gray-500">Track your ranking performance and insights</p>
        </div>
        <div className="flex items-center space-x-2">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select timeframe" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="1y">Last year</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="rankings">Rankings</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="domains">Domains</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Key Performance Indicators */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                  <Target className="w-4 h-4" />
                  Ranking Stability Score
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-gray-900">{analytics?.rankingStability?.toFixed(1) ?? 0}%</div>
                <div className="flex items-center gap-2 mt-2">
                  <Progress value={analytics?.rankingStability || 0} className="flex-1" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" />
                  Volatility Index
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-gray-900">{analytics?.volatilityIndex?.toFixed(1) ?? 0}</div>
                <p className="text-xs text-gray-500 mt-1">Lower is better</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                  <Globe className="w-4 h-4" />
                  Domain Diversity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-gray-900">{analytics?.domainDiversity ?? 0}</div>
                <p className="text-xs text-gray-500 mt-1">Unique domains tracked</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Avg Response Time
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-gray-900">{analytics?.avgResponseTime?.toFixed(1) ?? 0}s</div>
                <p className="text-xs text-gray-500 mt-1">API response time</p>
              </CardContent>
            </Card>
          </div>

          {/* Trend Analysis */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-gray-900">Ranking Changes Over Time</CardTitle>
                <CardDescription>Position movements across all tracked queries</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  {rankingTrendData.length > 0 ? (

                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsLineChart data={rankingTrendData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip />
                        <Line type="monotone" dataKey="avgPosition" stroke="#2563eb" strokeWidth={2} name="Avg Position" />
                        <Line type="monotone" dataKey="volatility" stroke="#7c3aed" strokeWidth={2} name="Volatility" />
                      </RechartsLineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-96 items-center justify-center text-gray-500">
                      No ranking data available yet.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-gray-900">Query Category Distribution</CardTitle>
                <CardDescription>Breakdown of queries by category</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <Pie
                        data={categoryDistribution}
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {categoryDistribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Top Performing Queries */}
          <Card>
            <CardHeader>
              <CardTitle className="text-gray-900">Top Performing Queries</CardTitle>
              <CardDescription>Queries with the most stable and high-quality rankings</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {topPerformingQueries.map((item, i) => (
                  <div key={i} className="flex items-center gap-4 p-3 rounded-lg border border-gray-100">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{item.name}</p>
                      <div className="flex items-center gap-4 mt-1">
                        <span className="text-xs text-gray-500">Avg position: #{item.avgPosition.toFixed(1)}</span>
                        <span className="text-xs text-gray-500">Stability: {item.stability.toFixed(1)}%</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={item.trend === "up" ? "default" : item.trend === "down" ? "destructive" : "secondary"}
                      >
                        {item.trend === "up" && <TrendingUp className="w-3 h-3 mr-1" />}
                        {item.trend === "down" && <TrendingDown className="w-3 h-3 mr-1" />}
                        {item.trend}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rankings" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-gray-900">Ranking Analysis</CardTitle>
              <CardDescription>Detailed ranking performance and position tracking</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsBarChart data={rankingTrendData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="avgPosition" fill="#2563eb" />
                  </RechartsBarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-gray-900">Performance Metrics</CardTitle>
              <CardDescription>API response times, success rates, and system performance</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  {performanceData.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-gray-400">No performance data</div>
                  ) : (
                    <RechartsLineChart data={performanceData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="hour" />
                      <YAxis yAxisId="left" tickFormatter={(v) => `${v} ms`} />
                      <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${v}%`} />
                      <Tooltip />
                      <Line yAxisId="left" type="monotone" dataKey="responseTime" stroke="#2563eb" strokeWidth={2} />
                      <Line yAxisId="right" type="monotone" dataKey="successRate" stroke="#059669" strokeWidth={2} />
                    </RechartsLineChart>
                  )}
                </ResponsiveContainer>

              </div>
            </CardContent>
          </Card>

          {/* Success Rate by Hour Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-gray-900">Success Rate by Hour</CardTitle>
              <CardDescription>Hourly success rate and average response time</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  {successRateByHour.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-gray-400">No hourly data</div>
                  ) : (
                    <RechartsBarChart data={successRateByHour}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="hour" />
                      <YAxis yAxisId="left" />
                      <YAxis yAxisId="right" orientation="right" />
                      <Tooltip />
                      <Bar yAxisId="left" dataKey="successRate" fill="#22c55e" name="Success Rate (%)" />
                      <Line yAxisId="right" type="monotone" dataKey="avgTime" stroke="#2563eb" strokeWidth={2} name="Avg Time (s)" />
                    </RechartsBarChart>
                  )}
                </ResponsiveContainer>

              </div>
            </CardContent>
          </Card>

          {/* Query Performance Stats Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-gray-900">Query Performance Stats</CardTitle>
              <CardDescription>Top queries by last average position</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                {queryPerformanceStats.length === 0 ? (
                  <div className="text-gray-500 text-sm text-center py-10">No query stats available</div>
                ) : (
                  <table className="min-w-full divide-y divide-gray-200">

                    <thead>
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Query</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Avg Position</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Positions (last 5)</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">

                      {queryPerformanceStats.map((stat, idx) => (
                        <tr key={idx}>
                          <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">{stat.name}</td>
                          <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">{stat.lastPosition !== null ? stat.lastPosition.toFixed(2) : "-"}</td>
                          <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">{stat.positions.slice(-5).map(p => p.toFixed(2)).join(", ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="domains" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-gray-900">Domain Analysis</CardTitle>
              <CardDescription>Domain authority tracking and ranking distribution</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-96 flex items-center justify-center border-2 border-dashed border-gray-200 rounded-lg">
                <div className="text-center">
                  <LucidePieChart className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <p className="text-lg font-medium text-gray-600">Domain Distribution</p>
                  <p className="text-sm text-gray-500 mt-2">
                    Analysis of domain authority, ranking patterns, and content diversity
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
