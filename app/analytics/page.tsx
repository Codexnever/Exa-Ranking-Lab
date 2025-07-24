"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Filter, RefreshCw, TrendingUp, BarChart3, Settings2 } from "lucide-react";
import { useAnalyticsStore } from "@/app/store";
import { useQueriesStore } from "@/app/store";
import { useSnapshotsStore } from "@/app/store";
import { analyticsCalculations } from "@/app/logic/analyticsLogic";
import { useAuth } from "@/lib/contexts/auth-context";
import { toast } from "sonner";
import dynamic from "next/dynamic";

// Skeleton imports
import AnalyticsAPIsSkeleton from "@/components/loaders/AnalyticsAPIsSkeleton";
import RankingTrendChartSkeleton from "@/components/loaders/RankingTrendChartSkeleton";
import CategoryPieChartSkeleton from "@/components/loaders/CategoryPieChartSkeleton";
import TopPerformingQueriesSkeleton from "@/components/loaders/TopPerformingQueriesSkeleton";
import RankingBarChartSkeleton from "@/components/loaders/RankingBarChartSkeleton";
import PerformanceChartsSkeleton from "@/components/loaders/PerformanceChartsSkeleton";
import QueryPerformanceStatsTableSkeleton from "@/components/loaders/QueryPerformanceStatsTableSkeleton";
import DomainAnalysisSkeleton from "@/components/loaders/DomainAnalysisSkeleton";

// Dynamic imports
const AnalyticsAPIs = dynamic(() => import("@/components/analytics/AnalyticsAPIs").then(mod => mod.AnalyticsAPIs), {
  loading: () => <AnalyticsAPIsSkeleton />,
  ssr: false,
});
const RankingTrendChart = dynamic(() => import("@/components/analytics/RankingTrendChart").then(mod => mod.RankingTrendChart), {
  loading: () => <RankingTrendChartSkeleton />,
  ssr: false,
});
const CategoryPieChart = dynamic(() => import("@/components/analytics/CategoryPieChart").then(mod => mod.CategoryPieChart), {
  loading: () => <CategoryPieChartSkeleton />,
  ssr: false,
});
const TopPerformingQueries = dynamic(() => import("@/components/analytics/TopPerformingQueries").then(mod => mod.TopPerformingQueries), {
  loading: () => <TopPerformingQueriesSkeleton />,
  ssr: false,
});
const RankingBarChart = dynamic(() => import("@/components/analytics/RankingBarChart").then(mod => mod.RankingBarChart), {
  loading: () => <RankingBarChartSkeleton />,
  ssr: false,
});
const PerformanceCharts = dynamic(() => import("@/components/analytics/PerformanceCharts").then(mod => mod.PerformanceCharts), {
  loading: () => <PerformanceChartsSkeleton />,
  ssr: false,
});
const QueryPerformanceStatsTable = dynamic(() => import("@/components/analytics/QueryPerformanceStatsTable").then(mod => mod.QueryPerformanceStatsTable), {
  loading: () => <QueryPerformanceStatsTableSkeleton />,
  ssr: false,
});
const DomainAnalysis = dynamic(() => import("@/components/analytics/DomainAnalysis").then(mod => mod.DomainAnalysis), {
  loading: () => <DomainAnalysisSkeleton />,
  ssr: false,
});

type DeduplicationStrategy = 'latest' | 'average' | 'best' | 'worst' | 'none';

export default function Analytics() {
  const { userId } = useAuth();
  const { analytics } = useAnalyticsStore();
  
  // Use stores directly to avoid wrapper hook issues
  const { queries, fetchQueries, isLoading: queriesLoading } = useQueriesStore();
  const { snapshots, fetchSnapshots, isLoading: snapshotsLoading } = useSnapshotsStore();
  
  // Refs to prevent infinite loops
  const isMountedRef = useRef(true);
  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastFetchTimeRef = useRef(0);
  
  // State management - stable initial values
  const [timeRange, setTimeRange] = useState("30d");
  const [deduplicationStrategy, setDeduplicationStrategy] = useState<DeduplicationStrategy>("latest");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [queryTypeFilter, setQueryTypeFilter] = useState("");
  const [domainFilter, setDomainFilter] = useState("");
  const [dataLoaded, setDataLoaded] = useState(false);

  // Stable filters object - prevents infinite loops
  const filters = useMemo(() => {
    return {
      queryType: queryTypeFilter || "",
      domain: domainFilter || ""
    };
  }, [queryTypeFilter, domainFilter]);

  // Stable arrays to prevent infinite recalculations
  const stableQueries = useMemo(() => Array.isArray(queries) ? queries : [], [queries]);
  const stableSnapshots = useMemo(() => Array.isArray(snapshots) ? snapshots : [], [snapshots]);



  // Memoize analytics calculations at the component level
 // In your Analytics component
const analyticsData = useMemo(() =>
  analyticsCalculations(
    stableQueries,
    stableSnapshots,
    timeRange,
    filters,
    deduplicationStrategy
  ),
  [stableQueries, stableSnapshots, timeRange, filters, deduplicationStrategy]
);


  // Computed values with guards
const filteredSnapshotsLength = useMemo(() => 
  Array.isArray(analyticsData.filteredSnapshots) ? analyticsData.filteredSnapshots.length : 0, 
  [analyticsData.filteredSnapshots]
);
  
  const isLoading = useMemo(() => 
    queriesLoading || snapshotsLoading || !dataLoaded, 
    [queriesLoading, snapshotsLoading, dataLoaded]
  );

  // Performance summary with error handling
  const performanceSummary = useMemo(() => {
  try {
    if (!Array.isArray(analyticsData.successRateByHour) || analyticsData.successRateByHour.length === 0) {
      return { avgSuccessRate: "0", avgResponseTime: "0" };
    }
    const validHours = analyticsData.successRateByHour.filter(h => h && typeof h.successRate === 'number');
    if (validHours.length === 0) {
      return { avgSuccessRate: "0", avgResponseTime: "0" };
    }
    const avgSuccessRate = (validHours.reduce((sum, h) => sum + h.successRate, 0) / validHours.length).toFixed(1);
    const avgResponseTime = (validHours.reduce((sum, h) => sum + (h.avgTime || 0), 0) / validHours.length).toFixed(0);
    return { avgSuccessRate, avgResponseTime };
  } catch (error) {
    console.error("Performance summary error:", error);
    return { avgSuccessRate: "0", avgResponseTime: "0" };
  }
}, [analyticsData.successRateByHour]);

  // Strategy info
  const strategyInfo = useMemo(() => {
    const info = {
      latest: { label: "Latest per Day", description: "Uses the most recent snapshot for each query per day" },
      average: { label: "Daily Average", description: "Creates synthetic snapshots by averaging multiple daily snapshots" },
      best: { label: "Best per Day", description: "Uses the snapshot with the best (lowest) average position per day" },
      worst: { label: "Worst per Day", description: "Uses the snapshot with the worst (highest) average position per day" },
      none: { label: "No Deduplication", description: "Uses all snapshots including duplicates" }
    };
    return info[deduplicationStrategy] || info.latest;
  }, [deduplicationStrategy]);

  // Debounced fetch function to prevent spam
// Move fetchQueries and fetchSnapshots out of the dependency array
const debouncedFetch = useCallback(async (force = false) => {
  const now = Date.now();
  const timeSinceLastFetch = now - lastFetchTimeRef.current;
  
  // Prevent fetching more than once every 5 seconds unless forced
  if (!force && timeSinceLastFetch < 5000) {
    console.log("Fetch debounced, too soon since last fetch");
    return;
  }

  if (!userId || !isMountedRef.current) return;

  try {
    lastFetchTimeRef.current = now;
    console.log("Fetching data for userId:", userId);
    
    // Get fresh references from the stores
    const queriesStore = useQueriesStore.getState();
    const snapshotsStore = useSnapshotsStore.getState();
    
    const promises = [];
    if (queriesStore.fetchQueries) promises.push(queriesStore.fetchQueries(userId));
    if (snapshotsStore.fetchSnapshots) promises.push(snapshotsStore.fetchSnapshots(undefined, userId));
    
    if (promises.length > 0) {
      await Promise.all(promises);
      if (isMountedRef.current) {
        setDataLoaded(true);
      }
    }
  } catch (error) {
    console.error("Fetch error:", error);
    if (isMountedRef.current) {
      setDataLoaded(true); // Still mark as loaded to prevent infinite loading
    }
  }
}, [userId]); // Only depend on userId


  // Initial data fetch - only once on mount with userId
  useEffect(() => {
    if (userId && !dataLoaded && isMountedRef.current) {
      // Clear any existing timeout
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
      
      // Debounce the initial fetch
      fetchTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          debouncedFetch(true);
        }
      }, 100);
    }
    
    return () => {
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
    };
  }, [userId, dataLoaded, debouncedFetch]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    
    return () => {
      isMountedRef.current = false;
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
    };
  }, []);

  // Stable event handlers
  const handleRefresh = useCallback(async () => {
    if (isRefreshing || !isMountedRef.current) return;
    
    setIsRefreshing(true);
    try {
      await debouncedFetch(true);
      if (isMountedRef.current) {
        toast.success("Data refreshed successfully");
      }
    } catch (error) {
      console.error("Refresh error:", error);
      if (isMountedRef.current) {
        toast.error("Failed to refresh data");
      }
    } finally {
      if (isMountedRef.current) {
        setIsRefreshing(false);
      }
    }
  }, [isRefreshing, debouncedFetch]);

 const handleExport = useCallback(() => {
  try {
    if (!Array.isArray(analyticsData.rankingTrendData) || analyticsData.rankingTrendData.length === 0) {
      toast.error("No data available for export");
      return;
    }

      const csvContent = "data:text/csv;charset=utf-8," + 
        `Analytics Export - ${new Date().toLocaleDateString()}\n` +
        `Time Range: ${timeRange}\n` +
        `Deduplication Strategy: ${deduplicationStrategy}\n` +
        `Total Snapshots: ${filteredSnapshotsLength}\n\n` +
        "Date,Avg Position,Volatility,Predicted Position,Is Anomaly,Count\n" + 
        analyticsData.rankingTrendData.map(row => 
          `${row?.date || "N/A"},${row?.avgPosition || 0},${row?.volatility || 0},${row?.predictedPosition || 0},${row?.isAnomaly || false},${row?.count || 0}`
        ).join("\n");
      
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `Exa_Analytics_${timeRange}_${deduplicationStrategy}_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success("Analytics data exported successfully");
 } catch (error) {
    console.error("Export error:", error);
    toast.error("Failed to export data");
  }
}, [timeRange, deduplicationStrategy, filteredSnapshotsLength, analyticsData.rankingTrendData]);

  const handleClearFilters = useCallback(() => {
    setQueryTypeFilter("");
    setDomainFilter("");
    setDeduplicationStrategy("latest");
    toast.success("Filters cleared");
  }, []);

  // Stable change handlers
  const handleTimeRangeChange = useCallback((value: string) => {
    if (value !== timeRange) {
      setTimeRange(value);
    }
  }, [timeRange]);

  const handleDeduplicationStrategyChange = useCallback((value: DeduplicationStrategy) => {
    if (value !== deduplicationStrategy) {
      setDeduplicationStrategy(value);
    }
  }, [deduplicationStrategy]);

  // // Loading state
  // if (isLoading) {
  //   return (
  //     <div className="flex-1 flex items-center justify-center min-h-[400px]">
  //       <div className="text-center">
  //         <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
  //         <h3 className="text-lg font-medium mb-2">Loading Analytics</h3>
  //         <p className="text-gray-500">Fetching your ranking data...</p>
  //       </div>
  //     </div>
  //   );
  // }

  // Empty state
  if (stableQueries.length === 0 && stableSnapshots.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <BarChart3 className="h-12 w-12 mx-auto mb-4 text-gray-400" />
          <h3 className="text-lg font-medium mb-2">No Data Available</h3>
          <p className="text-gray-500 mb-4">Create some queries and snapshots to see analytics</p>
          <Button onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh Data
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="h-8 w-8 text-blue-600" />
            Analytics Dashboard
            {isRefreshing && <RefreshCw className="h-5 w-5 animate-spin text-gray-400" />}
          </h2>
          <p className="text-gray-500 mt-1">
            Track your ranking performance and insights with advanced deduplication
          </p>
        </div>
        
        {/* Controls Section */}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={timeRange} onValueChange={handleTimeRangeChange}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="1y">Last year</SelectItem>
            </SelectContent>
          </Select>

          <Select value={deduplicationStrategy} onValueChange={handleDeduplicationStrategyChange}>
            <SelectTrigger className="w-[160px]">
              <Settings2 className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="latest">Latest per Day</SelectItem>
              <SelectItem value="average">Daily Average</SelectItem>
              <SelectItem value="best">Best per Day</SelectItem>
              <SelectItem value="worst">Worst per Day</SelectItem>
              <SelectItem value="none">No Deduplication</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="gap-1"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleExport} 
            className="gap-1"
            disabled={analyticsData.rankingTrendData.length === 0}
          >
            <Download className="h-4 w-4" />
            Export
          </Button>

          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleClearFilters} 
            className="gap-1"
            disabled={!queryTypeFilter && !domainFilter && deduplicationStrategy === "latest"}
          >
            <Filter className="h-4 w-4" />
            Clear
          </Button>
        </div>
      </div>

      {/* Strategy Info Badge */}
      <Card className="border-l-4 border-l-blue-500">
        <CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <div>
              <Badge variant="secondary" className="mb-2">
                Current Strategy: {strategyInfo.label}
              </Badge>
              <p className="text-sm text-gray-600">{strategyInfo.description}</p>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-500">Filtered Snapshots</div>
              <div className="text-2xl font-bold text-blue-600">{filteredSnapshotsLength}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Analytics Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview" className="gap-2">
            <TrendingUp className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="rankings">Rankings</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="domains">Domains</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <AnalyticsAPIs analytics={analytics} />
          <div className="grid gap-6 lg:grid-cols-2">
            <RankingTrendChart data={analyticsData.rankingTrendData} />
            <CategoryPieChart data={analyticsData.categoryDistribution} />
          </div>
          <TopPerformingQueries items={analyticsData.topPerformingQueries} />
        </TabsContent>

        <TabsContent value="rankings" className="space-y-6">
          <div className="grid gap-6">
            <RankingBarChart data={analyticsData.rankingTrendData} />
            <QueryPerformanceStatsTable stats={analyticsData.queryPerformanceStats} />
          </div>
        </TabsContent>

        <TabsContent value="performance" className="space-y-6">
          <PerformanceCharts 
            performanceData={analyticsData.performanceData} 
            successRateByHour={analyticsData.successRateByHour} 
          />
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Performance Summary</CardTitle>
                <CardDescription>
                  Based on {filteredSnapshotsLength} deduplicated snapshots using {strategyInfo.label.toLowerCase()} strategy
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <div className="text-2xl font-bold text-green-600">
                      {performanceSummary.avgSuccessRate}%
                    </div>
                    <div className="text-sm text-gray-500">Avg Success Rate</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-blue-600">
                      {performanceSummary.avgResponseTime}ms
                    </div>
                    <div className="text-sm text-gray-500">Avg Response Time</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <QueryPerformanceStatsTable stats={analyticsData.queryPerformanceStats} />
          </div>
        </TabsContent>

        <TabsContent value="domains" className="space-y-6">
          <DomainAnalysis snapshots={analyticsData.filteredSnapshots} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
