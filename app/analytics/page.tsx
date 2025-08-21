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
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from "@/components/ui/card";
import { Download, Filter, RefreshCw, TrendingUp, BarChart3, Settings2, Target, Brain, AlertCircle, RotateCcw } from "lucide-react";

import { useAnalyticsStore } from "@/app/store";
import { useQueriesStore } from "@/app/store/use-queries-store";
import { useSnapshotsStore } from "@/app/store/use-snapshots-store";
import { useWeaviateStore } from "@/app/store/weaviate-store";

import { formatResponseTime } from "@/hooks/format-response-time";
import { analyticsCalculations } from "@/app/logic/analyticsLogic";
import { useAuth } from "@/lib/contexts/auth-context";
import { toast } from "sonner";
import dynamic from "next/dynamic";

import { PredictiveRankingsWidget } from "@/components/analytics/PredictiveRankingsWidget";
import { SemanticHeatmap } from "@/components/analytics/SemanticHeatmap";
import { SERPJourneyFlow } from "@/components/analytics/SERPJourneyFlow";
import { RevolutionaryStatsCard } from "@/components/analytics/RevolutionaryStatsCard";
import AnalyticsAPIsSkeleton from "@/components/loaders/AnalyticsAPIsSkeleton";
import RankingTrendChartSkeleton from "@/components/loaders/RankingTrendChartSkeleton";
import CategoryPieChartSkeleton from "@/components/loaders/CategoryPieChartSkeleton";
import TopPerformingQueriesSkeleton from "@/components/loaders/TopPerformingQueriesSkeleton";
import RankingBarChartSkeleton from "@/components/loaders/RankingBarChartSkeleton";
import PerformanceChartsSkeleton from "@/components/loaders/PerformanceChartsSkeleton";
import QueryPerformanceStatsTableSkeleton from "@/components/loaders/QueryPerformanceStatsTableSkeleton";
import DomainAnalysisSkeleton from "@/components/loaders/DomainAnalysisSkeleton";

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
  const userId = user?.$id;

  const {
    analytics,
    isLoading: analyticsLoading,
    dataSource,
    setDataSource,
    fetchAnalytics,
    error: analyticsError
  } = useAnalyticsStore();
  console.log("[Analytics] Loaded analytics dataSource:", dataSource);
 
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
    syncData,
    assessDataQuality,
    syncQueries,
    getConnectionHealth,
    calculateContentCoherence,
  } = useWeaviateStore();

  console.log("semanticInsights:", semanticInsights);
console.log("enhancedMetrics:", enhancedMetrics);
console.log("ContentCoherence:", calculateContentCoherence);
console.log("isConnected:", isConnected, "connectionStatus:", connectionStatus);

  const {
    allSnapshots,
    isLoadingAnalytics: isLoadingSnapshots,
    fetchAllSnapshots,
    checkAndRefreshIfEmpty
  } = useSnapshotsStore();

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

 
  const filters = useMemo(() => ({
    queryType: queryTypeFilter || "",
    domain: domainFilter || ""
  }), [queryTypeFilter, domainFilter]);

  const stableQueries = useMemo(() => Array.isArray(queries) ? queries : [], [queries]);
  const stableSnapshots = useMemo(() => Array.isArray(allSnapshots) ? allSnapshots : [], [allSnapshots]);

  const timeRangeMs = useMemo(() => {
    const ranges: Record<string, number> = {
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
      '90d': 90 * 24 * 60 * 60 * 1000,
      '1y': 365 * 24 * 60 * 60 * 1000,
    };
    return ranges[timeRange] || ranges['30d'];
  }, [timeRange]);

  useEffect(() => {
    if (!userId) return;
    fetchAnalytics(userId, timeRangeMs, queries);
  }, [fetchAnalytics, userId, queries, dataSource, timeRangeMs]);

  // ✅ IMPROVED: Enhanced analytics data with vector-awareness indicators
  const analyticsData = useMemo(() => {
    if (dataSource === 'weaviate') {
      if (analytics) {
        return {
          ...analytics,
          // Add semantic enhancement flags
          hasSemanticData: !!analytics.vectorsAvailable,
          isVectorEnhanced: !!semanticInsights,
        };
      }
      return {
        timeRangeMs: 30 * 24 * 60 * 60 * 1000,
        filteredSnapshots: stableSnapshots,
        rankingTrendData: [],
        categoryDistribution: [],
        successRateByHour: [],
        performanceData: [],
        topPerformingQueries: [],
        queryPerformanceStats: [],
        hasSemanticData: false,
        isVectorEnhanced: false,
      };
    } else {
      if (analytics) {
        return {
          ...analytics,
          // Indicate if Appwrite data has vectors (from Weaviate sync)
          hasSemanticData: !!analytics.vectorsAvailable,
          isVectorEnhanced: !!analytics.vectorsAvailable,
        };
      }
      // Fallback to unified analytics calculation
      const calculated = analyticsCalculations(
        stableQueries,
        stableSnapshots,
        timeRange,
        filters,
        deduplicationStrategy
      );
      return {
        ...calculated,
        hasSemanticData: !!(analytics as any).vectorsAvailable,
        isVectorEnhanced: !!(analytics as any).vectorsAvailable,
      };
    }
  }, [analytics, dataSource, stableQueries, stableSnapshots, timeRange, filters, deduplicationStrategy, semanticInsights]);

  const filteredSnapshotsLength = useMemo(() =>
    Array.isArray(analyticsData.filteredSnapshots) ? analyticsData.filteredSnapshots.length : 0,
    [analyticsData.filteredSnapshots]
  );

  const isLoading = useMemo(() =>
    queriesLoading || isLoadingSnapshots || analyticsLoading || weaviateLoading || !dataLoaded,
    [queriesLoading, isLoadingSnapshots, analyticsLoading, weaviateLoading, dataLoaded]
  );

  // ✅ IMPROVED: Enhanced performance summary with semantic metrics
  const performanceSummary = useMemo(() => {
    try {
      if (dataSource === 'weaviate' && enhancedMetrics) {
        // Handle semantic stability from enhanced metrics
        let stabilityValue = 0;
        let coherenceValue = 0;

        if (typeof enhancedMetrics.semanticStability === 'number') {
          stabilityValue = enhancedMetrics.semanticStability;
        } else if (enhancedMetrics.semanticStability && typeof enhancedMetrics.semanticStability === 'object') {
          stabilityValue = enhancedMetrics.semanticStability.stabilityScore || 0;
        }

        if (typeof enhancedMetrics.contentCoherence === 'number') {
          coherenceValue = enhancedMetrics.contentCoherence;
        } else if (enhancedMetrics.contentCoherence && typeof enhancedMetrics.contentCoherence === 'object') {
          coherenceValue = enhancedMetrics.contentCoherence.overallCoherence || 0;
        }

        return {
          avgSuccessRate: stabilityValue.toFixed(1),
          avgResponseTime: "Vector DB",
          contentCoherence: coherenceValue.toFixed(1),
          diversityIndex: enhancedMetrics.diversityIndex?.toFixed(1) || "0",
          isSemanticEnhanced: true
        };
      }

      // Traditional analytics
      if (!analyticsData?.successRateByHour ||
        !Array.isArray(analyticsData.successRateByHour) ||
        analyticsData.successRateByHour.length === 0) {
        return {
          avgSuccessRate: "0",
          avgResponseTime: "0ms",
          isSemanticEnhanced: analyticsData.hasSemanticData || false
        };
      }

      const validHours = analyticsData.successRateByHour.filter(h =>
        h &&
        typeof h === 'object' &&
        typeof h.successRate === 'number' &&
        !isNaN(h.successRate)
      );

      if (validHours.length === 0) {
        return {
          avgSuccessRate: "0",
          avgResponseTime: "0ms",
          isSemanticEnhanced: analyticsData.hasSemanticData || false
        };
      }

      const avgSuccessRate = (
        validHours.reduce((sum, h) => sum + h.successRate, 0) / validHours.length
      ).toFixed(1);

      const rawAvgTime = (
        validHours.reduce((sum, h) => sum + (h.avgTime || 0), 0) / validHours.length
      ).toFixed(0);

      const avgResponseTime = formatResponseTime(Number(rawAvgTime));

      return {
        avgSuccessRate,
        avgResponseTime,
        isSemanticEnhanced: analyticsData.hasSemanticData || false
      };
    } catch (error) {
      console.warn('Error calculating performance summary:', error);
      return {
        avgSuccessRate: "0",
        avgResponseTime: "0ms",
        isSemanticEnhanced: false
      };
    }
  }, [analyticsData?.successRateByHour, analyticsData?.hasSemanticData, dataSource, enhancedMetrics]);

  const connectionHealth = useMemo(() =>
    dataSource === "weaviate" ? getConnectionHealth() : null,
    [getConnectionHealth, dataSource]
  );

  // ✅ IMPROVED: Enhanced strategy info with semantic benefits
  const strategyInfo = useMemo(() => {
    const baseInfo = {
      latest: { label: "Latest per Day", description: "Uses the most recent snapshot for each query per day" },
      average: { label: "Daily Average", description: "Creates synthetic snapshots by averaging multiple daily snapshots" },
      best: { label: "Best per Day", description: "Uses the snapshot with the best (lowest) average position per day" },
      worst: { label: "Worst per Day", description: "Uses the snapshot with the worst (highest) average position per day" },
      none: { label: "No Deduplication", description: "Uses all snapshots including duplicates" }
    };

    const info = baseInfo[deduplicationStrategy] || baseInfo.latest;

    // Add semantic enhancement note if applicable
    if (analyticsData.hasSemanticData) {
      info.description += " • Enhanced with vector-based semantic analysis";
    }

    return info;
  }, [deduplicationStrategy, analyticsData.hasSemanticData]);

  const debouncedFetch = useCallback(async (force = false) => {
    const now = Date.now();
    const timeSinceLastFetch = now - lastFetchTimeRef.current;
    if (!force && timeSinceLastFetch < 5000) return;
    if (!userId || !isMountedRef.current) return;

    try {
      lastFetchTimeRef.current = now;
      const promises = [];

      if (fetchQueries) promises.push(fetchQueries(user.$id, force));
      if (fetchAllSnapshots) promises.push(fetchAllSnapshots(user.$id));
      if (fetchAnalytics) promises.push(fetchAnalytics(userId, timeRangeMs, stableQueries, force));

      if (dataSource === 'weaviate' && getSemanticAnalytics) {
        promises.push(getSemanticAnalytics(userId, timeRange));
      }

      await Promise.allSettled(promises);
      if (isMountedRef.current) setDataLoaded(true);
    } catch (error) {
      if (isMountedRef.current) setDataLoaded(true);
    }
  }, [userId, dataSource, timeRangeMs, fetchQueries, fetchAllSnapshots, fetchAnalytics, getSemanticAnalytics, stableQueries, timeRange]);

  useEffect(() => {
    if (userId && !dataLoaded && isMountedRef.current) {
      checkAndRefreshIfEmpty?.(user.$id);
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
      fetchTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current) debouncedFetch(true);
      }, 100);
    }
    return () => {
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
    };
  }, [userId, dataLoaded, debouncedFetch, checkAndRefreshIfEmpty]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
    };
  }, []);

  // ✅ IMPROVED: Enhanced data source change with semantic feedback
  const handleDataSourceChange = useCallback(async (newSource: 'appwrite' | 'weaviate') => {
    if (newSource !== dataSource) {
      setDataSource(newSource);
      setDataLoaded(false);
      console.log("[Analytics] Data source changed:", newSource);
      if (newSource === 'weaviate') {
        setIsSyncing(true);
        try {
          await Promise.all([
            syncData(userId ?? ''),
            syncQueries(userId ?? '')
          ]);
          toast.success("Data synchronized with AI analytics. Semantic insights now available!");
        } catch (error) {
          toast.error("Failed to sync with AI analytics");
        } finally {
          setIsSyncing(false);
        }
      }

      const sourceLabel = newSource === 'weaviate' ? 'AI-powered semantic' : 'traditional';
      toast.success(`Switched to ${sourceLabel} analytics`);
    }
  }, [dataSource, setDataSource, syncData, syncQueries, userId]);

  const handleRefresh = useCallback(async () => {
    if (isRefreshing || !isMountedRef.current) return;
    setIsRefreshing(true);
    try {
      await debouncedFetch(true);
      if (isMountedRef.current) {
        const enhancementNote = analyticsData.hasSemanticData ? " with semantic enhancements" : "";
        toast.success(`Analytics data refreshed successfully${enhancementNote}`);
      }
    } catch {
      if (isMountedRef.current) toast.error("Failed to refresh analytics data");
    } finally {
      if (isMountedRef.current) setIsRefreshing(false);
    }
  }, [isRefreshing, debouncedFetch, analyticsData.hasSemanticData]);

  const handleSync = useCallback(async () => {
    if (!userId || isSyncing) return;
    setIsSyncing(true);
    try {
      const [dataResult, queriesResult] = await Promise.allSettled([
        syncData(user.$id),
        syncQueries(user.$id)
      ]);

      let successMessage = "Data synchronized successfully";

      if (queriesResult.status === 'fulfilled') {
        const stats = queriesResult.value;
        successMessage += ` (${stats.synced} queries synced)`;
      }

      toast.success(successMessage);
      await debouncedFetch(true);

    } catch (error) {
      toast.error("Failed to sync data");
    } finally {
      setIsSyncing(false);
    }
  }, [userId, isSyncing, syncData, syncQueries, debouncedFetch]);

  // ✅ IMPROVED: Enhanced export with semantic data support
  const handleExport = useCallback(() => {
    try {
      let dataToExport: any[] = [];
      let headers = "";
      let filename = "";

      if (dataSource === 'weaviate' && semanticInsights?.contentAnomalies) {
        dataToExport = semanticInsights.contentAnomalies;
        headers = "Type,Query ID,URL,Title,Anomaly Score,Timestamp\n";
        filename = `Exa_Semantic_Analytics_${timeRange}_${new Date().toISOString().split('T')[0]}.csv`;
      } else if (Array.isArray(analyticsData.rankingTrendData)) {
        dataToExport = analyticsData.rankingTrendData;
        headers = "Date,Avg Position,Volatility,Predicted Position,Is Anomaly,Count\n";
        filename = `Exa_Analytics_${dataSource}_${timeRange}_${new Date().toISOString().split('T')[0]}.csv`;
      }

      if (!Array.isArray(dataToExport) || dataToExport.length === 0) {
        toast.error("No data available for export");
        return;
      }

      let csvContent = "data:text/csv;charset=utf-8,";
      csvContent += `Analytics Export - ${new Date().toLocaleDateString()}\n`;
      csvContent += `Time Range: ${timeRange}\n`;
      csvContent += `Data Source: ${dataSource}\n`;
      csvContent += `Semantic Enhanced: ${analyticsData.hasSemanticData ? 'Yes' : 'No'}\n`;
      csvContent += `Total Snapshots: ${filteredSnapshotsLength}\n\n`;
      csvContent += headers;

      if (dataSource === 'weaviate' && semanticInsights?.contentAnomalies) {
        interface ContentAnomaly {
          type: string;
          queryId: string;
          url: string;
          title: string;
          anomalyScore: number;
          timestamp: string;
        }
        interface SemanticInsights {
          contentAnomalies: ContentAnomaly[];
        }

        csvContent += (semanticInsights.contentAnomalies as ContentAnomaly[]).map((row: ContentAnomaly) =>
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
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      const exportType = analyticsData.hasSemanticData ? "semantic analytics" : "analytics";
      toast.success(`${exportType} data exported successfully`);
    } catch {
      toast.error("Failed to export data");
    }
  }, [timeRange, dataSource, filteredSnapshotsLength, analyticsData, semanticInsights]);

  const handleClearFilters = useCallback(() => {
    setQueryTypeFilter("");
    setDomainFilter("");
    setDeduplicationStrategy("latest");
    toast.success("Filters cleared");
  }, []);

  const handleTimeRangeChange = useCallback((value: string) => {
    if (value !== timeRange) {
      setTimeRange(value);
      setDataLoaded(false);
    }
  }, [timeRange]);

  const handleDeduplicationStrategyChange = useCallback((value: DeduplicationStrategy) => {
    if (value !== deduplicationStrategy) setDeduplicationStrategy(value);
  }, [deduplicationStrategy]);

  // ✅ NEW: Render semantic enhancement indicators
  const renderDataSourceIndicator = () => {
    if (!analyticsData.hasSemanticData && dataSource === 'appwrite') {
      return (
        <Badge variant="outline" className="ml-2">
          <BarChart3 className="w-3 h-3 mr-1" />
          Traditional
        </Badge>
      );
    }

    if (analyticsData.hasSemanticData) {
      return (
        <Badge variant="default" className="ml-2 bg-purple-600">
          <Brain className="w-3 h-3 mr-1" />
          Semantic Enhanced
        </Badge>
      );
    }

    if (dataSource === 'weaviate') {
      return (
        <Badge variant="secondary" className="ml-2">
          <Brain className="w-3 h-3 mr-1" />
          AI-Powered
        </Badge>
      );
    }

    return null;
  };

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
            {dataSource === "weaviate" && isConnected && (
              <Badge variant="secondary" className="bg-purple-100 text-purple-700">
                <Brain className="h-3 w-3 mr-1" />
                AI Powered
              </Badge>
            )}
          </h2>
          <p className="text-gray-500 mt-1">
            Track your ranking performance with {dataSource === "weaviate" ? "AI-powered semantic analysis" : "traditional analytics"}
          </p>
          {/* Data Source Selector */}
          <div className="flex items-center gap-4 mt-3">
            <span className="text-sm font-medium">Data Source:</span>
            <div className="flex rounded-lg border border-gray-200 p-1">
              <button
                onClick={() => handleDataSourceChange("appwrite")}
                disabled={isSyncing}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${dataSource === "appwrite" ? "bg-blue-100 text-blue-700 font-medium" : "text-gray-600 hover:text-gray-900"}`}
              >
                Traditional
              </button>
              <button
                onClick={() => handleDataSourceChange("weaviate")}
                disabled={isSyncing}
                className={`px-3 py-1 text-sm rounded-md transition-colors flex items-center gap-1 ${dataSource === "weaviate" ? "bg-purple-100 text-purple-700 font-medium" : "text-gray-600 hover:text-gray-900"}`}
              >
                <Brain className="h-3 w-3" />
                AI Analytics
                {isSyncing && <RefreshCw className="h-3 w-3 animate-spin" />}
              </button>
            </div>
          </div>

          {/* Status indicators */}
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 flex-wrap">
            <span>{stableQueries.length} queries</span>
            <span>{stableSnapshots.length} total snapshots</span>
            <span>{filteredSnapshotsLength} filtered snapshots</span>
            {deduplicationStrategy !== "none" && dataSource === "appwrite" && (
              <span>({deduplicationStrategy} strategy)</span>
            )}
            {dataSource === "weaviate" && (
              <Badge
                variant={connectionStatus === "connected" ? "default" : connectionStatus === "error" ? "destructive" : "secondary"}
                className="text-xs"
              >
                <Target className="h-3 w-3 mr-1" />
                {connectionStatus === "connecting"
                  ? "Connecting..."
                  : connectionStatus === "connected"
                    ? "Vector DB Connected"
                    : connectionStatus === "error"
                      ? "Connection Error"
                      : "Disconnected"}
              </Badge>
            )}
            {dataSource === "weaviate" && connectionHealth && (
              <span className={`text-xs ${connectionHealth.isHealthy ? "text-green-700" : "text-red-600"}`}>
                Health: {connectionHealth.quality} ({connectionHealth.successRate}%)
              </span>
            )}
            {(weaviateError || analyticsError) && (
              <Badge variant="destructive" className="text-xs">
                <AlertCircle className="h-3 w-3 mr-1" />
                {weaviateError || analyticsError}
              </Badge>
            )}
          </div>
        </div>

        {/* Controls */}
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

          {dataSource === "appwrite" && (
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

          {/* Sync button for Weaviate */}
          {dataSource === "weaviate" && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={isSyncing || connectionStatus !== "connected"}
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
              dataSource === "appwrite"
                ? !(Array.isArray(analyticsData.rankingTrendData) && analyticsData.rankingTrendData.length > 0)
                : !(semanticInsights && Array.isArray(semanticInsights.contentAnomalies) && semanticInsights.contentAnomalies.length > 0)
            }
            className="gap-1"
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

      {/* Main Cards */}
      <RevolutionaryStatsCard
        analytics={analytics}
        snapshots={stableSnapshots}
        semanticAnalytics={dataSource === "weaviate" ? semanticInsights : undefined} // Use undefined not null
        weaviateConnected={dataSource === "weaviate" && isConnected}
        enhancedMetrics={dataSource === "weaviate" && enhancedMetrics ? {
          semanticStability: typeof enhancedMetrics.semanticStability === 'number'
            ? enhancedMetrics.semanticStability
            : enhancedMetrics.semanticStability?.stabilityScore,
          contentCoherence: typeof enhancedMetrics.contentCoherence === 'number'
            ? enhancedMetrics.contentCoherence
            : enhancedMetrics.contentCoherence?.score,
          diversityIndex: enhancedMetrics.diversityIndex,
          anomalyCount: enhancedMetrics.anomalyCount,
          clusterQuality: enhancedMetrics.statisticalValidation?.accuracy,
          vectorSpaceUtilization: enhancedMetrics.dataQuality?.completeness
        } : undefined}
      />

      {/* Strategy Info Card */}
      {dataSource === "appwrite" && (
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

      {/* Weaviate Info Card */}
      {dataSource === "weaviate" && (
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
                {connectionStatus === "error" && (
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

      {/* Tabs (Overview, Rankings, Performance, Domains, AI Insights) */}
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

        {/* Tab contents */}
        <TabsContent value="overview" className="space-y-6">
          {isLoading ? <AnalyticsAPIsSkeleton /> : <AnalyticsAPIs analytics={analytics} />}
          <div className="grid gap-6 lg:grid-cols-2">
            {isLoading
              ? (
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
          {isLoading
            ? <TopPerformingQueriesSkeleton />
            : <TopPerformingQueries items={analyticsData.topPerformingQueries} />}
        </TabsContent>

        <TabsContent value="rankings" className="space-y-6">
          <div className="grid gap-6">
            {isLoading
              ? <>
                <RankingBarChartSkeleton />
                <QueryPerformanceStatsTableSkeleton />
              </>
              : <>
                <RankingBarChart data={analyticsData.rankingTrendData || []} />
                <QueryPerformanceStatsTable stats={analyticsData.queryPerformanceStats || []} />
              </>
            }
          </div>
        </TabsContent>

        <TabsContent value="performance" className="space-y-6">
          {isLoading
            ? <PerformanceChartsSkeleton />
            : <PerformanceCharts
              performanceData={analyticsData.performanceData || []}
              successRateByHour={analyticsData.successRateByHour || []}
            />
          }
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Performance Summary</CardTitle>
                <CardDescription>
                  {dataSource === "weaviate"
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
                      {dataSource === "weaviate" ? "Semantic Stability" : "Avg Success Rate"}
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
            {isLoading
              ? <QueryPerformanceStatsTableSkeleton />
              : <QueryPerformanceStatsTable stats={analyticsData.queryPerformanceStats || []} />
            }
          </div>
        </TabsContent>

        <TabsContent value="domains" className="space-y-6">
          {isLoading
            ? <DomainAnalysisSkeleton />
            : <DomainAnalysis snapshots={analyticsData.filteredSnapshots || []} />
          }
        </TabsContent>

        <TabsContent value="ai-insights" className="space-y-6">
          {dataSource === "weaviate" ? (
            <>
              <PredictiveRankingsWidget
                userId={user.$id}
                queries={stableQueries}
                snapshots={analyticsData.filteredSnapshots || []}
                semanticAnalytics={semanticInsights}
                enhancedMetrics={enhancedMetrics}
              />
              <div className="grid gap-6 lg:grid-cols-2">
                <SemanticHeatmap
                  snapshots={analyticsData.filteredSnapshots || []}
                  queries={stableQueries}
                  semanticAnalytics={semanticInsights ?? undefined}
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
                            {(typeof enhancedMetrics.semanticStability === 'number'
                              ? enhancedMetrics.semanticStability
                              : enhancedMetrics.semanticStability?.stabilityScore || 0).toFixed(1)}%
                          </div>
                          <div className="text-sm text-gray-500">Semantic Stability</div>
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-blue-600">
                            {(typeof enhancedMetrics.contentCoherence === 'number'
                              ? enhancedMetrics.contentCoherence
                              : enhancedMetrics.contentCoherence?.score || 0).toFixed(1)}%
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
                {/* Add this section after the existing enhanced metrics card */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="h-5 w-5 text-blue-600" />
                      Statistical Validation Dashboard
                    </CardTitle>
                    <CardDescription>
                      Enterprise-grade statistical analysis with confidence intervals and significance testing
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-6 lg:grid-cols-2">
                      {/* Model Performance Metrics */}
                      <div className="space-y-4">
                        <h4 className="font-semibold">Prediction Model Performance</h4>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="text-center p-3 bg-green-50 rounded-lg">
                            <div className="text-2xl font-bold text-green-600">
                              {enhancedMetrics?.statisticalValidation?.accuracy?.toFixed(1) || "N/A"}%
                            </div>
                            <div className="text-sm text-green-700">Model Accuracy</div>
                          </div>
                          <div className="text-center p-3 bg-blue-50 rounded-lg">
                            <div className="text-2xl font-bold text-blue-600">
                              {enhancedMetrics?.statisticalValidation?.mape?.toFixed(2) || "N/A"}
                            </div>
                            <div className="text-sm text-blue-700">Mean Error Rate</div>
                          </div>
                          <div className="text-center p-3 bg-purple-50 rounded-lg">
                            <div className="text-2xl font-bold text-purple-600">
                              {enhancedMetrics?.statisticalValidation?.f1Score?.toFixed(2) || "N/A"}
                            </div>
                            <div className="text-sm text-purple-700">F1 Score</div>
                          </div>
                          <div className="text-center p-3 bg-indigo-50 rounded-lg">
                            <div className="text-2xl font-bold text-indigo-600">95%</div>
                            <div className="text-sm text-indigo-700">Confidence Level</div>
                          </div>
                        </div>

                        {enhancedMetrics?.statisticalValidation && (
                          <div className="mt-4">
                            <div className="flex justify-between text-sm mb-2">
                              <span>Model Reliability</span>
                              <span>{enhancedMetrics.statisticalValidation.accuracy.toFixed(1)}%</span>
                            </div>
                            <Progress value={enhancedMetrics.statisticalValidation.accuracy} className="h-2" />
                            <div className="text-xs text-gray-500 mt-1">
                              Last validated: {new Date(enhancedMetrics.statisticalValidation.lastValidated).toLocaleDateString()}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Data Quality Metrics */}
                      <div className="space-y-4">
                        <h4 className="font-semibold">Data Quality Assessment</h4>
                        {enhancedMetrics?.dataQuality ? (
                          <div className="space-y-3">
                            {Object.entries(enhancedMetrics.dataQuality).map(([key, value]) => {
                              if (key === 'assessedAt') return null;
                              const label = key.charAt(0).toUpperCase() + key.slice(1);
                              const numValue = typeof value === 'number' ? value : 0;
                              const displayValue = key === 'anomalyCount' ? value : `${numValue.toFixed(1)}%`;

                              return (
                                <div key={key} className="space-y-1">
                                  <div className="flex justify-between text-sm">
                                    <span>{label}</span>
                                    <span className={`font-medium ${key === 'anomalyCount' ?
                                      (numValue > 5 ? 'text-red-600' : 'text-green-600') :
                                      (numValue > 80 ? 'text-green-600' : numValue > 60 ? 'text-yellow-600' : 'text-red-600')
                                      }`}>
                                      {displayValue}
                                    </span>
                                  </div>
                                  {key !== 'anomalyCount' && (
                                    <Progress
                                      value={numValue}
                                      className={`h-2 ${numValue > 80 ? 'text-green-600' :
                                        numValue > 60 ? 'text-yellow-600' : 'text-red-600'
                                        }`}
                                    />
                                  )}
                                </div>
                              );
                            })}
                            <div className="text-xs text-gray-500 pt-2 border-t">
                              Data quality assessed: {new Date(enhancedMetrics.dataQuality.assessedAt).toLocaleDateString()}
                            </div>
                          </div>
                        ) : (
                          <div className="text-center py-8 text-gray-500">
                            <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                            <div className="text-sm">Data quality assessment not available</div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="mt-2"
                              onClick={async () => {
                                try {
                                  await assessDataQuality(user.$id);
                                  toast.success("Data quality assessment completed");
                                } catch (error) {
                                  toast.error("Failed to assess data quality");
                                }
                              }}
                            >
                              Run Assessment
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>


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

                      {semanticInsights.contentAnomalies.slice(0, 5).map((anomaly: any, index: number) => (
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
                <SERPJourneyFlow snapshots={analyticsData.filteredSnapshots || []} />
              )}
            </>
          ) : (
            <Card>
              <CardContent className="text-center py-12">
                <Brain className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                <h3 className="text-lg font-medium mb-2">AI Insights Unavailable</h3>
                <p className="text-gray-500 mb-4">Switch to AI Analytics mode to access semantic insights</p>
                <Button onClick={() => handleDataSourceChange("weaviate")}>
                  <Brain className="h-4 w-4 mr-2" />
                  Enable AI Analytics
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Debug Info */}
      {process.env.NODE_ENV === "development" && (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-sm">Debug Information</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-gray-500 space-y-1">
            <div>Data Source: {dataSource}</div>
            <div>Connection Status: {connectionStatus}</div>
            <div>
              Health: {connectionHealth ? `${connectionHealth.quality}, ${connectionHealth.successRate}%${connectionHealth.isHealthy ? " (healthy)" : " (unhealthy)"}` : "N/A"}
            </div>
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
