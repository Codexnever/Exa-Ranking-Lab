"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, MemoizedSelectTrigger as SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { LucidePieChart, Download } from "lucide-react"
import { useAnalytics } from "@/hooks/use-analytics"
import { useQueries } from "@/hooks/use-queries"
import { useSnapshots } from "@/hooks/use-snapshots"
import { useAnalyticsCalculations } from "@/logic/analyticsLogic"
import { useEffect, useMemo, useState } from "react"
import { AnalyticsAPIs } from "@/components/analytics/AnalyticsAPIs"
import { RankingTrendChart } from "@/components/analytics/RankingTrendChart"
import { CategoryPieChart } from "@/components/analytics/CategoryPieChart"
import { TopPerformingQueries } from "@/components/analytics/TopPerformingQueries"
import { RankingBarChart } from "@/components/analytics/RankingBarChart"
import { PerformanceCharts } from "@/components/analytics/PerformanceCharts"
import { QueryPerformanceStatsTable } from "@/components/analytics/QueryPerformanceStatsTable"

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
  const { queries, fetchQueries } = useQueries()
  const { snapshots, fetchSnapshots } = useSnapshots()
  const [timeRange, setTimeRange] = useState("30d")

  // Use extracted analytics logic
  const {
    timeRangeMs,
    filteredSnapshots,
    rankingTrendData,
    categoryDistribution,
    successRateByHour,
    performanceData,
    topPerformingQueries,
    queryPerformanceStats
  } = useAnalyticsCalculations(queries, snapshots, timeRange)

  useEffect(() => {
    fetchQueries()
    fetchAnalytics()
    fetchSnapshots()
  }, [])

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
          <AnalyticsAPIs analytics={analytics} />
          <div className="grid gap-6 lg:grid-cols-2">
            <RankingTrendChart data={rankingTrendData} />
            <CategoryPieChart data={categoryDistribution} />
          </div>
          <TopPerformingQueries items={topPerformingQueries} />
        </TabsContent>
        <TabsContent value="rankings" className="space-y-6">
          <RankingBarChart data={rankingTrendData} />
        </TabsContent>
        <TabsContent value="performance" className="space-y-6">
          <PerformanceCharts performanceData={performanceData} successRateByHour={successRateByHour} />
          <QueryPerformanceStatsTable stats={queryPerformanceStats} />
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
