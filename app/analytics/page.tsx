// pages/analytics.tsx
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
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from "@/components/ui/card";
import { Download, Filter, RefreshCw, TrendingUp, BarChart3, Settings2, Target, Brain, AlertCircle, RotateCcw } from "lucide-react";

// UPDATED: Use the new store structure
import { useAnalyticsStore } from "@/app/store";
import { useQueriesStore } from "@/app/store/use-queries-store";
import { useSnapshotsStore } from "@/app/store/use-snapshots-store";
import { useWeaviateStore } from "@/app/store/weaviate-store";

import { formatResponseTime } from "@/hooks/format-response-time";
import { analyticsCalculations } from "@/app/logic/analyticsLogic";
import { useAuth } from "@/lib/contexts/auth-context";
import { toast } from "sonner";
import dynamic from "next/dynamic";

// Components
import { PredictiveRankingsWidget } from "@/components/analytics/PredictiveRankingsWidget";
import { SemanticHeatmap } from "@/components/analytics/SemanticHeatmap";
import { SERPJourneyFlow } from "@/components/analytics/SERPJourneyFlow";
import { RevolutionaryStatsCard } from "@/components/analytics/RevolutionaryStatsCard";

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
  const { user } = useAuth();

  // UPDATED: Use the new store structure
  const { 
    analytics, 
    isLoading: analyticsLoading,
    dataSource,
    setDataSource,
    fetchAnalytics,
    calculateAnalyticsFromSnapshots,
    error: analyticsError
  } = useAnalyticsStore();

  const { 
    queries, 
    isLoading: queriesLoading,
    fetchQueries,
    syncWithWeaviate
  } = useQueriesStore();

  const { 
    isConnected, 
    connectionStatus,
    semanticInsights,
    enhancedMetrics,
    isLoading: weaviateLoading,
    error: weaviateError,
    getSemanticAnalytics,
    checkConnection,
    syncData
  } = useWeaviateStore();

  const { 
    allSnapshots, 
    isLoadingAnalytics: isLoadingSnapshots,
    fetchAllSnapshots,
    checkAndRefreshIfEmpty
  } = useSnapshotsStore();

  // Refs and state
  const isMountedRef = useRef(true);
  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastFetchTimeRef = useRef(0);

  const [timeRange, setTimeRange] = useState("30d");
  const [deduplicationStrategy, setDeduplicationStrategy] = useState<DeduplicationStrategy>("latest");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [queryTypeFilter, setQueryTypeFilter] = useState("");
  const [domainFilter, setDomainFilter] = useState("");
  const [dataLoaded, setDataLoaded] = useState(false);

  // Filters memoization
  const filters = useMemo(() => ({
    queryType: queryTypeFilter || "",
    domain: domainFilter || ""
  }), [queryTypeFilter, domainFilter]);

  // Stable data arrays
  const stableQueries = useMemo(() => Array.isArray(queries) ? queries : [], [queries]);
  const stableSnapshots = useMemo(() => Array.isArray(allSnapshots) ? allSnapshots : [], [allSnapshots]);

  // UPDATED: Analytics calculations - now works with both data sources
  const analyticsData = useMemo(() => {
    if (dataSource === 'weaviate') {
      // For Weaviate mode, use data from analytics store (populated by WeaviateAnalyticsService)
      if (analytics) {
        return analytics;
      }
      // Fallback structure if no Weaviate data yet
      return {
        timeRangeMs: 30 * 24 * 60 * 60 * 1000,
        filteredSnapshots: stableSnapshots,
        rankingTrendData: [],
        categoryDistribution: [],
        successRateByHour: [],
        performanceData: [],
        topPerformingQueries: [],
        queryPerformanceStats: [],
      };
    } else {
      // For Appwrite mode, use traditional analytics calculations
      if (analytics) {
        return analytics;
      }
      // Fallback to real-time calculation
      return analyticsCalculations(
        stableQueries,
        stableSnapshots,
        timeRange,
        filters,
        deduplicationStrategy
      );
    }
  }, [analytics, dataSource, stableQueries, stableSnapshots, timeRange, filters, deduplicationStrategy]);

  const filteredSnapshotsLength = useMemo(() =>
    Array.isArray(analyticsData.filteredSnapshots) ? analyticsData.filteredSnapshots.length : 0,
    [analyticsData.filteredSnapshots]);

  const isLoading = useMemo(() =>
    queriesLoading || isLoadingSnapshots || analyticsLoading || weaviateLoading || !dataLoaded,
    [queriesLoading, isLoadingSnapshots, analyticsLoading, weaviateLoading, dataLoaded]);

  // UPDATED: Performance summary - enhanced for both modes
  const performanceSummary = useMemo(() => {
    try {
      if (dataSource === 'weaviate' && enhancedMetrics) {
        return {
          avgSuccessRate: enhancedMetrics.semanticStability?.toFixed(1) || "0",
          avgResponseTime: "Vector DB"
        };
      }

      if (!Array.isArray(analyticsData.successRateByHour) || analyticsData.successRateByHour.length === 0) {
        return { avgSuccessRate: "0", avgResponseTime: "0ms" };
      }

      const validHours = analyticsData.successRateByHour.filter(h => h && typeof h.successRate === 'number');
      if (validHours.length === 0) {
        return { avgSuccessRate: "0", avgResponseTime: "0ms" };
      }

      const avgSuccessRate = (validHours.reduce((sum, h) => sum + h.successRate, 0) / validHours.length).toFixed(1);
      const rawAvgTime = (validHours.reduce((sum, h) => sum + (h.avgTime || 0), 0) / validHours.length).toFixed(0);
      const avgResponseTime = formatResponseTime(Number(rawAvgTime));

      return { avgSuccessRate, avgResponseTime };
    } catch {
      return { avgSuccessRate: "0", avgResponseTime: "0ms" };
    }
  }, [analyticsData.successRateByHour, dataSource, enhancedMetrics]);

  useEffect(() => {
    if (user?.$id && !dataLoaded && isMountedRef.current) {
      const loadInitialData = async () => {
        try {
          await fetchAnalytics(user.$id, undefined, [], true);
          setDataLoaded(true);
        } catch (error) {
          console.error('Initial data load failed:', error);
          setDataLoaded(true);
        }
      };

      loadInitialData();
    }
  }, [user?.$id, dataLoaded, fetchAnalytics]);
  // Deduplication strategy info
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

  // Time range in milliseconds
  const timeRangeMs = useMemo(() => {
    const ranges: Record<string, number> = {
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
      '90d': 90 * 24 * 60 * 60 * 1000,
      '1y': 365 * 24 * 60 * 60 * 1000,
    };
    return ranges[timeRange] || ranges['30d'];
  }, [timeRange]);

  // UPDATED: Data fetching with proper dual-source handling
  const debouncedFetch = useCallback(async (force = false) => {
    const now = Date.now();
    const timeSinceLastFetch = now - lastFetchTimeRef.current;

    if (!force && timeSinceLastFetch < 5000) return;
    if (!user?.$id || !isMountedRef.current) return;

    try {
      lastFetchTimeRef.current = now;
      console.log(`[Analytics] Fetching data for ${dataSource} mode`);

      const promises = [];
      
      // Always fetch basic data
      if (fetchQueries) promises.push(fetchQueries(user.$id, force));
      if (fetchAllSnapshots) promises.push(fetchAllSnapshots(user.$id));

      // UPDATED: Use the new analytics store method
      if (fetchAnalytics) {
        promises.push(fetchAnalytics(user.$id, timeRangeMs, stableQueries, force));
      }

      // For Weaviate mode, also get semantic analytics
      if (dataSource === 'weaviate' && getSemanticAnalytics) {
        promises.push(getSemanticAnalytics(user.$id, timeRange));
      }

      await Promise.allSettled(promises);
      
      if (isMountedRef.current) {
        setDataLoaded(true);
      }
    } catch (error) {
      console.error('Fetch error:', error);
      if (isMountedRef.current) {
        setDataLoaded(true);
      }
    }
  }, [user?.$id, dataSource, timeRange, timeRangeMs, stableQueries, fetchQueries, fetchAllSnapshots, fetchAnalytics, getSemanticAnalytics]);

  // UPDATED: Data source change handler with sync capability
  const handleDataSourceChange = useCallback(async (newSource: 'appwrite' | 'weaviate') => {
    if (newSource !== dataSource) {
      setDataSource(newSource);
      setDataLoaded(false);
      
      if (newSource === 'weaviate') {
        // Check connection and sync if needed
        const connected = await checkConnection();
        if (connected && user?.$id) {
          setIsSyncing(true);
          try {
            await Promise.all([
              syncData(user.$id),
              syncWithWeaviate(user.$id)
            ]);
            toast.success("Data synchronized with AI analytics");
          } catch (error) {
            console.error("Sync failed:", error);
            toast.error("Failed to sync with AI analytics");
          } finally {
            setIsSyncing(false);
          }
        }
      }
      
      toast.success(`Switched to ${newSource === 'weaviate' ? 'AI-powered' : 'traditional'} analytics`);
    }
  }, [dataSource, setDataSource, checkConnection, syncData, syncWithWeaviate, user?.$id]);

  // Effects
  useEffect(() => {
    if (user?.$id && !dataLoaded && isMountedRef.current) {
      // Check if we need to refresh empty data
      checkAndRefreshIfEmpty?.(user.$id);
      
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
      fetchTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current) debouncedFetch(true);
      }, 100);
    }
    return () => {
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
    };
  }, [user?.$id, dataLoaded, debouncedFetch, checkAndRefreshIfEmpty]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
    };
  }, []);

  // UPDATED: Event handlers
  const handleRefresh = useCallback(async () => {
    if (isRefreshing || !isMountedRef.current) return;
    setIsRefreshing(true);
    try {
      await debouncedFetch(true);
      if (isMountedRef.current) toast.success("Analytics data refreshed successfully");
    } catch {
      if (isMountedRef.current) toast.error("Failed to refresh analytics data");
    } finally {
      if (isMountedRef.current) setIsRefreshing(false);
    }
  }, [isRefreshing, debouncedFetch]);

  const handleSync = useCallback(async () => {
    if (!user?.$id || isSyncing) return;
    
    setIsSyncing(true);
    try {
      await Promise.all([
        syncData(user.$id),
        syncWithWeaviate(user.$id)
      ]);
      
      // Refetch data after sync
      await debouncedFetch(true);
      
      toast.success("Data synchronized successfully");
    } catch (error) {
      console.error("Sync failed:", error);
      toast.error("Failed to sync data");
    } finally {
      setIsSyncing(false);
    }
  }, [user?.$id, isSyncing, syncData, syncWithWeaviate, debouncedFetch]);

  // UPDATED: Export handler for both data sources
  const handleExport = useCallback(() => {
    try {
      let dataToExport: any[] = [];
      let headers = "";
      
      if (dataSource === 'weaviate' && semanticInsights?.contentAnomalies) {
        dataToExport = semanticInsights.contentAnomalies;
        headers = "Type,Query ID,URL,Title,Anomaly Score,Timestamp\n";
      } else if (Array.isArray(analyticsData.rankingTrendData)) {
       dataToExport = analyticsData.rankingTrendData;
        headers = "Date,Avg Position,Volatility,Predicted Position,Is Anomaly,Count\n";
      }

      if (!Array.isArray(dataToExport) || dataToExport.length === 0) {
        toast.error("No data available for export");
        return;
      }

      let csvContent = "data:text/csv;charset=utf-8,";
      csvContent += `Analytics Export - ${new Date().toLocaleDateString()}\n`;
      csvContent += `Time Range: ${timeRange}\n`;
      csvContent += `Data Source: ${dataSource}\n`;
      csvContent += `Total Snapshots: ${filteredSnapshotsLength}\n\n`;
      csvContent += headers;

      if (dataSource === 'weaviate' && semanticInsights?.contentAnomalies) {
        csvContent += semanticInsights.contentAnomalies.map(row =>
          `${row.type},${row.queryId},${row.url},${row.title},${row.anomalyScore},${row.timestamp}`
        ).join("\n");
      } else {
        csvContent += (Array.isArray(analyticsData.rankingTrendData) ? analyticsData.rankingTrendData : []).map(row =>
          `${row?.date || "N/A"},${row?.avgPosition || 0},${row?.volatility || 0},${row?.predictedPosition || 0},${row?.isAnomaly || false},${row?.count || 0}`
        ).join("\n");
      }

      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `Exa_Analytics_${dataSource}_${timeRange}_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success("Analytics data exported successfully");
    } catch {
      toast.error("Failed to export data");
    }
  }, [timeRange, dataSource, filteredSnapshotsLength, analyticsData.rankingTrendData, semanticInsights]);

  const handleClearFilters = useCallback(() => {
    setQueryTypeFilter("");
    setDomainFilter("");
    setDeduplicationStrategy("latest");
    toast.success("Filters cleared");
  }, []);

  const handleTimeRangeChange = useCallback((value: string) => {
    if (value !== timeRange) {
      setTimeRange(value);
      setDataLoaded(false); // Trigger refetch
    }
  }, [timeRange]);

  const handleDeduplicationStrategyChange = useCallback((value: DeduplicationStrategy) => {
    if (value !== deduplicationStrategy) setDeduplicationStrategy(value);
  }, [deduplicationStrategy]);

  // Authentication guard
  if (!user) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <BarChart3 className="h-12 w-12 mx-auto mb-4 text-gray-400" />
          <h3 className="text-lg font-medium mb-2">Authentication Required</h3>
          <p className="text-gray-500 mb-4">Please log in to view analytics</p>
        </div>
      </div>
    );
  }

  // Empty state
  if (!isLoading && stableQueries.length === 0 && stableSnapshots.length === 0) {
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
            {(isRefreshing || isSyncing) && <RefreshCw className="h-5 w-5 animate-spin text-gray-400" />}
            {dataSource === 'weaviate' && isConnected && (
              <Badge variant="secondary" className="bg-purple-100 text-purple-700">
                <Brain className="h-3 w-3 mr-1" />
                AI Powered
              </Badge>
            )}
          </h2>
          <p className="text-gray-500 mt-1">
            Track your ranking performance with {dataSource === 'weaviate' ? 'AI-powered semantic analysis' : 'traditional analytics'}
          </p>
          
          {/* UPDATED: Data Source Selector with connection status */}
          <div className="flex items-center gap-4 mt-3">
            <span className="text-sm font-medium">Data Source:</span>
            <div className="flex rounded-lg border border-gray-200 p-1">
              <button
                onClick={() => handleDataSourceChange('appwrite')}
                disabled={isSyncing}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  dataSource === 'appwrite'
                    ? 'bg-blue-100 text-blue-700 font-medium'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Traditional
              </button>
              <button
                onClick={() => handleDataSourceChange('weaviate')}
                disabled={isSyncing}
                className={`px-3 py-1 text-sm rounded-md transition-colors flex items-center gap-1 ${
                  dataSource === 'weaviate'
                    ? 'bg-purple-100 text-purple-700 font-medium'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Brain className="h-3 w-3" />
                AI Analytics
                {isSyncing && <RefreshCw className="h-3 w-3 animate-spin" />}
              </button>
            </div>
          </div>

          {/* UPDATED: Status indicators */}
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 flex-wrap">
            <span>{stableQueries.length} queries</span>
            <span>{stableSnapshots.length} total snapshots</span>
            <span>{filteredSnapshotsLength} filtered snapshots</span>
            {deduplicationStrategy !== 'none' && dataSource === 'appwrite' && (
              <span>({deduplicationStrategy} strategy)</span>
            )}
            {dataSource === 'weaviate' && (
              <Badge 
                variant={connectionStatus === 'connected' ? "default" : connectionStatus === 'error' ? "destructive" : "secondary"} 
                className="text-xs"
              >
                <Target className="h-3 w-3 mr-1" />
                {connectionStatus === 'connecting' ? 'Connecting...' : 
                 connectionStatus === 'connected' ? 'Vector DB Connected' : 
                 connectionStatus === 'error' ? 'Connection Error' : 'Disconnected'}
              </Badge>
            )}
            {(weaviateError || analyticsError) && (
              <Badge variant="destructive" className="text-xs">
                <AlertCircle className="h-3 w-3 mr-1" />
                {weaviateError || analyticsError}
              </Badge>
            )}
          </div>
        </div>

        {/* UPDATED: Controls Section */}
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

          {dataSource === 'appwrite' && (
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
          )}

          {/* NEW: Sync button for Weaviate mode */}
          {dataSource === 'weaviate' && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={isSyncing || connectionStatus !== 'connected'}
              className="gap-1"
            >
              <RotateCcw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
              Sync
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing || isSyncing}
            className="gap-1"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
disabled={
   dataSource === 'appwrite'
     ? !(Array.isArray(analyticsData.rankingTrendData) && analyticsData.rankingTrendData.length > 0)
     : !(semanticInsights && Array.isArray(semanticInsights.contentAnomalies) && semanticInsights.contentAnomalies.length > 0)
 }            className="gap-1"
          >
            <Download className="h-4 w-4" />
            Export
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearFilters}
            disabled={!queryTypeFilter && !domainFilter && deduplicationStrategy === "latest"}
            className="gap-1"
          >
            <Filter className="h-4 w-4" />
            Clear
          </Button>
        </div>
      </div>

      {/* UPDATED: Revolutionary Stats Cards with proper data flow */}
      <RevolutionaryStatsCard
        analytics={analytics}
        snapshots={stableSnapshots}
        semanticAnalytics={dataSource === 'weaviate' ? semanticInsights : null}
        weaviateConnected={dataSource === 'weaviate' && isConnected}
        enhancedMetrics={dataSource === 'weaviate' ? enhancedMetrics : null}
      />

      {/* Strategy Info Card - Only show for Appwrite mode */}
      {dataSource === 'appwrite' && (
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
                <div className="text-xs text-gray-400">from {stableSnapshots.length} total</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* UPDATED: Weaviate Info Card with connection details */}
      {dataSource === 'weaviate' && (
        <Card className="border-l-4 border-l-purple-500">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <Badge variant="secondary" className="mb-2 bg-purple-100 text-purple-700">
                  <Brain className="h-3 w-3 mr-1" />
                  AI-Powered Semantic Analysis
                </Badge>
                <p className="text-sm text-gray-600">
                  Using vector embeddings and semantic clustering for enhanced insights
                </p>
                {connectionStatus === 'error' && (
                  <p className="text-xs text-red-600 mt-1">
                    Connection issue detected. Click sync to retry.
                  </p>
                )}
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-500">Vector Space</div>
                <div className="text-2xl font-bold text-purple-600">
                  {semanticInsights?.weaviateMetrics?.totalVectors || 0}
                </div>
                <div className="text-xs text-gray-400">embeddings processed</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Analytics Tabs - rest remains the same but uses updated data flow */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview" className="gap-2">
            <TrendingUp className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="rankings">Rankings</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="domains">Domains</TabsTrigger>
          <TabsTrigger value="ai-insights" className="gap-2">
            <Brain className="h-4 w-4" />
            AI Insights
          </TabsTrigger>
        </TabsList>

        {/* Tab contents remain the same structure... */}
        <TabsContent value="overview" className="space-y-6">
          {isLoading ? (
            <AnalyticsAPIsSkeleton />
          ) : (
            <AnalyticsAPIs analytics={analytics} />
          )}
          <div className="grid gap-6 lg:grid-cols-2">
            {isLoading ? (
              <>
                <RankingTrendChartSkeleton />
                <CategoryPieChartSkeleton />
              </>
            ) : (
              <>
                <RankingTrendChart data={analyticsData.rankingTrendData} />
                <CategoryPieChart data={analyticsData.categoryDistribution} />
              </>
            )}
          </div>
          {isLoading ? (
            <TopPerformingQueriesSkeleton />
          ) : (
            <TopPerformingQueries items={analyticsData.topPerformingQueries} />
          )}
        </TabsContent>

        {/* Other tab contents... (same as before but with proper data flow) */}
        <TabsContent value="rankings" className="space-y-6">
          <div className="grid gap-6">
            {isLoading ? (
              <>
                <RankingBarChartSkeleton />
                <QueryPerformanceStatsTableSkeleton />
              </>
            ) : (
              <>
                <RankingBarChart data={analyticsData.rankingTrendData} />
                <QueryPerformanceStatsTable stats={analyticsData.queryPerformanceStats} />
              </>
            )}
          </div>
        </TabsContent>

        <TabsContent value="performance" className="space-y-6">
          {isLoading ? (
            <PerformanceChartsSkeleton />
          ) : (
            <PerformanceCharts
              performanceData={analyticsData.performanceData}
              successRateByHour={analyticsData.successRateByHour}
            />
          )}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Performance Summary</CardTitle>
                <CardDescription>
                  {dataSource === 'weaviate' 
                    ? "AI-powered semantic analysis metrics"
                    : `Based on ${filteredSnapshotsLength} deduplicated snapshots using ${strategyInfo.label.toLowerCase()} strategy`
                  }
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <div className="text-2xl font-bold text-green-600">
                      {performanceSummary.avgSuccessRate}%
                    </div>
                    <div className="text-sm text-gray-500">
                      {dataSource === 'weaviate' ? 'Semantic Stability' : 'Avg Success Rate'}
                    </div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-blue-600">
                      {performanceSummary.avgResponseTime}
                    </div>
                    <div className="text-sm text-gray-500">Avg Response Time</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            {isLoading ? (
              <QueryPerformanceStatsTableSkeleton />
            ) : (
              <QueryPerformanceStatsTable stats={analyticsData.queryPerformanceStats} />
            )}
          </div>
        </TabsContent>

        <TabsContent value="domains" className="space-y-6">
          {isLoading ? (
            <DomainAnalysisSkeleton />
          ) : (
            <DomainAnalysis snapshots={analyticsData.filteredSnapshots} />
          )}
        </TabsContent>

        <TabsContent value="ai-insights" className="space-y-6">
          {dataSource === 'weaviate' ? (
            <>
              <PredictiveRankingsWidget
                userId={user.$id}
                queries={stableQueries}
                snapshots={analyticsData.filteredSnapshots}
                semanticAnalytics={semanticInsights}
                enhancedMetrics={enhancedMetrics}
              />

              <div className="grid gap-6 lg:grid-cols-2">
                <SemanticHeatmap
                  snapshots={analyticsData.filteredSnapshots}
                  queries={stableQueries}
                  semanticAnalytics={semanticInsights}
                />

                {enhancedMetrics && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Enhanced Metrics</CardTitle>
                      <CardDescription>AI-powered semantic analysis results</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <div className="text-2xl font-bold text-purple-600">
                            {enhancedMetrics.semanticStability?.toFixed(1)}%
                          </div>
                          <div className="text-sm text-gray-500">Semantic Stability</div>
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-blue-600">
                            {enhancedMetrics.contentCoherence?.toFixed(1)}%
                          </div>
                          <div className="text-sm text-gray-500">Content Coherence</div>
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-green-600">
                            {enhancedMetrics.diversityIndex?.toFixed(1)}
                          </div>
                          <div className="text-sm text-gray-500">Diversity Index</div>
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-orange-600">
                            {enhancedMetrics.anomalyCount}
                          </div>
                          <div className="text-sm text-gray-500">Content Anomalies</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              {semanticInsights?.contentAnomalies && semanticInsights.contentAnomalies.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Content Anomalies Detected</CardTitle>
                    <CardDescription>
                      AI-identified content that deviates from expected patterns
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {semanticInsights.contentAnomalies.slice(0, 5).map((anomaly, index) => (
                        <div key={index} className="border rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <Badge variant="destructive" className="text-xs">
                              {anomaly.type}
                            </Badge>
                            <span className="text-xs text-gray-500">
                              Score: {anomaly.anomalyScore.toFixed(2)}
                            </span>
                          </div>
                          <h4 className="font-medium text-sm mb-1">{anomaly.title}</h4>
                          <p className="text-xs text-gray-600 mb-1">{anomaly.description}</p>
                          <a href={anomaly.url} target="_blank" rel="noopener noreferrer" 
                             className="text-xs text-blue-500 hover:underline">
                            {anomaly.url}
                          </a>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {stableQueries.length > 0 && (
                <SERPJourneyFlow snapshots={analyticsData.filteredSnapshots} />
              )}
            </>
          ) : (
            <Card>
              <CardContent className="text-center py-12">
                <Brain className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                <h3 className="text-lg font-medium mb-2">AI Insights Unavailable</h3>
                <p className="text-gray-500 mb-4">Switch to AI Analytics mode to access semantic insights</p>
                <Button onClick={() => handleDataSourceChange('weaviate')}>
                  <Brain className="h-4 w-4 mr-2" />
                  Enable AI Analytics
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* UPDATED: Debug info for development */}
      {process.env.NODE_ENV === "development" && (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-sm">Debug Information</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-gray-500 space-y-1">
            <div>Data Source: {dataSource}</div>
            <div>Connection Status: {connectionStatus}</div>
            <div>Complete Dataset: {stableSnapshots.length} snapshots</div>
            <div>Filtered Dataset: {filteredSnapshotsLength} snapshots</div>
            <div>Queries: {stableQueries.length}</div>
            <div>Time Range: {timeRange} ({timeRangeMs}ms)</div>
            <div>Strategy: {deduplicationStrategy}</div>
            <div>Loading States: Analytics={analyticsLoading}, Queries={queriesLoading}, Weaviate={weaviateLoading}, Snapshots={isLoadingSnapshots}</div>
            <div>Weaviate Connected: {isConnected ? "Yes" : "No"}</div>
            <div>Semantic Insights: {semanticInsights ? "Available" : "None"}</div>
            <div>Enhanced Metrics: {enhancedMetrics ? "Available" : "None"}</div>
            <div>Analytics Data: {analytics ? "Available" : "None"}</div>
            {(weaviateError || analyticsError) && <div>Errors: {weaviateError || analyticsError}</div>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
