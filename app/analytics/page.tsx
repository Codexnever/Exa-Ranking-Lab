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
import { AlgorithmUpdatePanel } from "@/components/analytics/AlgorithmUpdatePanel"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from "@/components/ui/card";
import {
  Download, Filter, RefreshCw, TrendingUp, BarChart3,
  Settings2, Target, Brain, AlertCircle, RotateCcw, Zap, Play,
} from "lucide-react";

import { useAnalyticsStore } from "@/app/store";
import { useQueriesStore } from "@/app/store/use-queries-store";
import { useSnapshotsStore } from "@/app/store/use-snapshots-store";
import { useWeaviateStore } from "@/app/store/weaviate-store";

import { formatResponseTime } from "@/hooks/format-response-time";
import { analyticsCalculations } from "@/app/logic/analyticsLogic";
import { useAuth } from "@/lib/middleware/authentication/auth-context";
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

const AnalyticsAPIs = dynamic(
  () => import("@/components/analytics/AnalyticsAPIs").then((mod) => mod.AnalyticsAPIs),
  { loading: () => <AnalyticsAPIsSkeleton />, ssr: false }
);
const RankingTrendChart = dynamic(
  () => import("@/components/analytics/RankingTrendChart").then((mod) => mod.RankingTrendChart),
  { loading: () => <RankingTrendChartSkeleton />, ssr: false }
);
const CategoryPieChart = dynamic(
  () => import("@/components/analytics/CategoryPieChart").then((mod) => mod.CategoryPieChart),
  { loading: () => <CategoryPieChartSkeleton />, ssr: false }
);
const TopPerformingQueries = dynamic(
  () => import("@/components/analytics/TopPerformingQueries").then((mod) => mod.TopPerformingQueries),
  { loading: () => <TopPerformingQueriesSkeleton />, ssr: false }
);
const RankingBarChart = dynamic(
  () => import("@/components/analytics/RankingBarChart").then((mod) => mod.RankingBarChart),
  { loading: () => <RankingBarChartSkeleton />, ssr: false }
);
const PerformanceCharts = dynamic(
  () => import("@/components/analytics/PerformanceCharts").then((mod) => mod.PerformanceCharts),
  { loading: () => <PerformanceChartsSkeleton />, ssr: false }
);
const QueryPerformanceStatsTable = dynamic(
  () => import("@/components/analytics/QueryPerformanceStatsTable").then((mod) => mod.QueryPerformanceStatsTable),
  { loading: () => <QueryPerformanceStatsTableSkeleton />, ssr: false }
);
const DomainAnalysis = dynamic(
  () => import("@/components/analytics/DomainAnalysis").then((mod) => mod.DomainAnalysis),
  { loading: () => <DomainAnalysisSkeleton />, ssr: false }
);

type DeduplicationStrategy = "latest" | "average" | "best" | "worst" | "none";
type SemanticInsights  = import("@/types/type").SemanticInsights;
type EnhancedMetrics   = import("@/types/type").EnhancedMetrics;
type EnhancedAnalyticsData = import("@/types/type").EnhancedAnalyticsData;

function hasSemanticInsights(obj: any): obj is { semanticInsights: SemanticInsights } {
  return obj && typeof obj === "object" && "semanticInsights" in obj && obj.semanticInsights != null;
}
function hasEnhancedMetrics(obj: any): obj is { enhancedMetrics: EnhancedMetrics } {
  return obj && typeof obj === "object" && "enhancedMetrics" in obj && obj.enhancedMetrics != null;
}

const isDev = process.env.NODE_ENV === "development";
const debugLog = (...args: any[]) => { if (isDev) console.log(...args); };

// Helper: extract hostname from a raw domain string or full URL
function extractDomain(value: string): string | null {
  if (!value) return null;
  try {
    if (!/^https?:\/\//i.test(value)) {
      return value.replace(/^www\./, "").toLowerCase();
    }
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

export default function Analytics() {
  const { user } = useAuth();
  const userId = user?.$id;

  debugLog('[Analytics Page] Render - userId:', userId);

  const {
    analytics, isLoading: analyticsLoading, dataSource,
    setDataSource, fetchAnalytics, error: analyticsError,
  } = useAnalyticsStore();

  const {
    queries, isLoading: queriesLoading,
    fetchQueries, syncWithWeaviate,
  } = useQueriesStore();

  const {
    isConnected, connectionStatus, semanticInsights, enhancedMetrics,
    isLoading: weaviateLoading, error: weaviateError,
    getSemanticAnalytics, syncData, assessDataQuality, syncQueries,
    getConnectionHealth, initializeWeaviateMode, vectorsAvailable,
  } = useWeaviateStore();

  // ✅ FIX 1: console.log → debugLog — was logging on every render in production
  debugLog('Weaviate store state:', {
    semanticInsights, enhancedMetrics, isConnected,
    connectionStatus, vectorsAvailable,
  });

  const {
    allSnapshots, isLoadingAnalytics: isLoadingSnapshots,
    fetchAllSnapshots, checkAndRefreshIfEmpty,
  } = useSnapshotsStore();

  const isMountedRef    = useRef(true);
  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastFetchTimeRef = useRef(0);

  const [timeRange,               setTimeRange]               = useState("30d");
  const [deduplicationStrategy,   setDeduplicationStrategy]   = useState<DeduplicationStrategy>("latest");
  const [isRefreshing,            setIsRefreshing]            = useState(false);
  const [isSyncing,               setIsSyncing]               = useState(false);
  const [isExecutingQueries,      setIsExecutingQueries]      = useState(false);
  const [queryTypeFilter,         setQueryTypeFilter]         = useState("all");
  const [domainFilter,            setDomainFilter]            = useState("all");
  const [dataLoaded,              setDataLoaded]              = useState(false);
  const [initializationState,     setInitializationState]     = useState<
    "pending" | "loading" | "success" | "error"
  >("pending");

  const filters = useMemo(() => ({
    queryType: queryTypeFilter === "all" ? "" : queryTypeFilter || "",
    domain:    domainFilter    === "all" ? "" : domainFilter    || "",
  }), [queryTypeFilter, domainFilter]);

  const stableQueries = useMemo(() => {
    const q = Array.isArray(queries) ? queries : [];
    debugLog('[Analytics] Stable queries:', q.length);
    return q;
  }, [queries]);

  const stableSnapshots = useMemo(() => {
    const s = Array.isArray(allSnapshots) ? allSnapshots : [];
    debugLog('[Analytics] Stable snapshots:', s.length);
    return s;
  }, [allSnapshots]);

  const availableDomains = useMemo(() => {
    const set = new Set<string>();
    stableSnapshots.forEach(s => {
      (s?.results ?? []).forEach((r: any) => {
        const raw = r?.domain || r?.url;
        if (!raw) return;
        const domain = extractDomain(raw);
        if (domain) set.add(domain);
      });
    });
    return Array.from(set).sort();
  }, [stableSnapshots]);

  const timeRangeMs = useMemo(() => {
    const ranges: Record<string, number> = {
      "7d":  7   * 24 * 60 * 60 * 1000,
      "30d": 30  * 24 * 60 * 60 * 1000,
      "90d": 90  * 24 * 60 * 60 * 1000,
      "1y":  365 * 24 * 60 * 60 * 1000,
    };
    return ranges[timeRange] || ranges["30d"];
  }, [timeRange]);

  const isAIPowered = useMemo(() => dataSource === "weaviate", [dataSource]);

  const analyticsData = useMemo(() => {
    debugLog('[Analytics] Assembling analyticsData:', {
      isAIPowered, hasAnalytics: !!analytics,
      snapshots: stableSnapshots.length, queries: stableQueries.length,
    });

    if (isAIPowered) {
      if (analytics) {
        const ae = analytics as EnhancedAnalyticsData;
        return {
          ...analytics,
          hasSemanticData:    true,
          isVectorEnhanced:   true,
          vectorsAvailable:   vectorsAvailable ?? false,
          semanticInsights:   ae.semanticInsights   || semanticInsights,
          enhancedMetrics:    ae.enhancedMetrics    || enhancedMetrics,
          isWeaviateSource:   true,
        };
      }
      if (stableSnapshots.length > 0) {
        const calculated = analyticsCalculations(
          stableQueries, stableSnapshots, timeRange, filters, deduplicationStrategy
        );
        return {
          ...calculated,
          hasSemanticData:  !!(semanticInsights || enhancedMetrics),
          isVectorEnhanced: vectorsAvailable ?? false,
          vectorsAvailable: vectorsAvailable ?? false,
          semanticInsights: semanticInsights ?? undefined,
          enhancedMetrics:  enhancedMetrics  ?? undefined,
          isWeaviateSource: true,
        };
      }
      if (semanticInsights || enhancedMetrics) {
        return {
          timeRangeMs, filteredSnapshots: [], rankingTrendData: [],
          categoryDistribution: [], successRateByHour: [],
          performanceData: [], topPerformingQueries: [],
          queryPerformanceStats: [],
          hasSemanticData: true, isVectorEnhanced: true,
          vectorsAvailable: vectorsAvailable ?? false,
          semanticInsights: semanticInsights ?? undefined,
          enhancedMetrics:  enhancedMetrics  ?? undefined,
          isWeaviateSource: true,
        };
      }
    }

    if (analytics) {
      return { ...analytics, hasSemanticData: false, isVectorEnhanced: false, vectorsAvailable: false };
    }

    const calculated = analyticsCalculations(
      stableQueries, stableSnapshots, timeRange, filters, deduplicationStrategy
    );
    return { ...calculated, hasSemanticData: false, isVectorEnhanced: false, vectorsAvailable: false };
  }, [
    analytics, isAIPowered, stableQueries, stableSnapshots,
    timeRange, filters, deduplicationStrategy,
    semanticInsights, enhancedMetrics, timeRangeMs, vectorsAvailable,
  ]);

  const analyzedSnapshotGroupCount = useMemo(
    () => Array.isArray(analyticsData.filteredSnapshots) ? analyticsData.filteredSnapshots.length : 0,
    [analyticsData.filteredSnapshots]
  );

  const storedSnapshotCount = stableSnapshots.length;
  const filteredSnapshotsLength = isAIPowered
    ? storedSnapshotCount
    : analyzedSnapshotGroupCount;

  const isLoading = useMemo(
    () => queriesLoading || isLoadingSnapshots || analyticsLoading ||
          weaviateLoading || !dataLoaded || initializationState === "loading",
    [queriesLoading, isLoadingSnapshots, analyticsLoading, weaviateLoading, dataLoaded, initializationState]
  );

  const performanceSummary = useMemo(() => {
    try {
      if (isAIPowered && enhancedMetrics) {
        let stabilityValue = 0;
        let coherenceValue = 0;

        if (typeof enhancedMetrics.semanticStability === "number") {
          stabilityValue = enhancedMetrics.semanticStability;
        } else if (enhancedMetrics.semanticStability && typeof enhancedMetrics.semanticStability === "object") {
          stabilityValue = (enhancedMetrics.semanticStability as any).stabilityScore || 0;
        }

        if (typeof enhancedMetrics.contentCoherence === "number") {
          coherenceValue = enhancedMetrics.contentCoherence;
        } else if (enhancedMetrics.contentCoherence && typeof enhancedMetrics.contentCoherence === "object") {
          coherenceValue =
            (enhancedMetrics.contentCoherence as any).overallCoherence ||
            (enhancedMetrics.contentCoherence as any).score || 0;
        }

        // ✅ FIX 2: was returning literal string "rs time" as avgResponseTime.
        // Now derives from successRateByHour same as the traditional branch,
        // so the Response Time card shows a real value in AI mode too.
        const sr = analyticsData?.successRateByHour;
        const validHours = Array.isArray(sr)
          ? sr.filter((h: any) =>
              h && typeof h === "object" &&
              typeof h.avgTime === "number" && h.avgTime > 0
            )
          : [];
        const rawAvgTime = validHours.length > 0
          ? validHours.reduce((sum: number, h: any) => sum + h.avgTime, 0) / validHours.length
          : 0;

        return {
          avgSuccessRate:    stabilityValue.toFixed(1),
          avgResponseTime:   rawAvgTime > 0 ? formatResponseTime(Math.round(rawAvgTime)) : "N/A",
          contentCoherence:  coherenceValue.toFixed(1),
          diversityIndex:    enhancedMetrics.diversityIndex?.toFixed(1) || "0",
          isSemanticEnhanced: true,
        };
      }

      const sr = analyticsData?.successRateByHour;
      if (!sr || !Array.isArray(sr) || sr.length === 0) {
        return { avgSuccessRate: "0", avgResponseTime: "0ms", isSemanticEnhanced: false };
      }

      const validHours = sr.filter(
        (h: any) => h && typeof h === "object" &&
          typeof h.successRate === "number" && !isNaN(h.successRate)
      );

      if (validHours.length === 0) {
        return { avgSuccessRate: "0", avgResponseTime: "0ms", isSemanticEnhanced: false };
      }

      const avgSuccessRate = (
        validHours.reduce((sum: number, h: any) => sum + h.successRate, 0) / validHours.length
      ).toFixed(1);

      const rawAvgTime = (
        validHours.reduce((sum: number, h: any) => sum + (h.avgTime || 0), 0) / validHours.length
      ).toFixed(0);

      return {
        avgSuccessRate,
        avgResponseTime: formatResponseTime(Number(rawAvgTime)),
        isSemanticEnhanced: false,
      };
    } catch {
      return { avgSuccessRate: "0", avgResponseTime: "0ms", isSemanticEnhanced: false };
    }
  }, [analyticsData?.successRateByHour, isAIPowered, enhancedMetrics, analyticsData]);

  const connectionHealth = useMemo(() => {
    try { return isAIPowered ? getConnectionHealth?.() ?? null : null; }
    catch { return null; }
  }, [getConnectionHealth, isAIPowered]);

  const connectionHealthLabel = useMemo(() => {
    if (!connectionHealth) return null;
    if (typeof connectionHealth === "string") return connectionHealth;
    if (typeof connectionHealth === "object") {
      const ch: any = connectionHealth;
      if (typeof ch.status === "string") return ch.status;
      if (typeof ch.latencyMs === "number") return `${ch.latencyMs}ms latency`;
      if (typeof ch.healthy === "boolean") return ch.healthy ? "OK" : "Degraded";
    }
    return "OK";
  }, [connectionHealth]);

  const strategyInfo = useMemo(() => {
    const baseInfo = {
      latest:  { label: "Latest per Day",    description: "Uses the most recent snapshot for each query per day" },
      average: { label: "Daily Average",     description: "Creates synthetic snapshots by averaging multiple daily snapshots" },
      best:    { label: "Best per Day",      description: "Uses the snapshot with the best (lowest) average position per day" },
      worst:   { label: "Worst per Day",     description: "Uses the snapshot with the worst (highest) average position per day" },
      none:    { label: "No Deduplication",  description: "Uses all snapshots including duplicates" },
    } as const;
    const info = baseInfo[deduplicationStrategy] || baseInfo.latest;
    return isAIPowered
      ? { ...info, description: "AI-powered semantic analysis with vector-based insights" }
      : info;
  }, [deduplicationStrategy, isAIPowered]);

  const debouncedFetch = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastFetchTimeRef.current < 5000) return;
    if (!userId || typeof userId !== "string" || userId.trim() === "" || !isMountedRef.current) return;

    try {
      lastFetchTimeRef.current = now;
      const promises: Promise<any>[] = [];

      if (fetchQueries)      promises.push(fetchQueries(userId, force));
      if (fetchAllSnapshots) promises.push(fetchAllSnapshots(userId));

      if (dataSource === "weaviate") {
        if (initializeWeaviateMode && initializationState !== "success") {
          setInitializationState("loading");
          try {
            await initializeWeaviateMode(userId, timeRange);
            setInitializationState("success");
          } catch {
            setInitializationState("error");
          }
        } else if (getSemanticAnalytics) {
          promises.push(getSemanticAnalytics(userId, timeRange));
        }
      } else {
        if (fetchAnalytics) promises.push(fetchAnalytics(userId, timeRangeMs, stableQueries, force));
      }

      if (promises.length > 0) await Promise.allSettled(promises);
      if (isMountedRef.current) setDataLoaded(true);
    } catch {
      if (isMountedRef.current) {
        setDataLoaded(true);
        if (dataSource === "weaviate") setInitializationState("error");
      }
    }
  }, [
    userId, dataSource, timeRange, timeRangeMs,
    fetchQueries, fetchAllSnapshots, fetchAnalytics,
    getSemanticAnalytics, stableQueries,
    initializeWeaviateMode, initializationState,
  ]);

  useEffect(() => {
    if (userId && typeof userId === "string" && userId.trim() !== "" && !dataLoaded && isMountedRef.current) {
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
      checkAndRefreshIfEmpty?.(userId);
      fetchTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current) debouncedFetch(true).catch(() => {});
      }, 100);
    }
    return () => { if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current); };
  }, [userId, dataLoaded, dataSource, debouncedFetch, checkAndRefreshIfEmpty]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
    };
  }, []);

  const handleDataSourceChange = useCallback(async (newSource: "appwrite" | "weaviate") => {
    const setAnalyticsSource = useAnalyticsStore.getState().setDataSource;
    const setWeaviateSource  = useWeaviateStore.getState().setDataSource;

    setIsRefreshing(true);
    setDataLoaded(false);
    setInitializationState("pending");

    try {
      setAnalyticsSource(newSource);
      setWeaviateSource(newSource);

      if (newSource === "weaviate") {
        setIsSyncing(true);
        setInitializationState("loading");
        if (userId) {
          await getSemanticAnalytics(userId, timeRange);
          setInitializationState("success");
          toast.success("AI Analytics enabled!");
        }
      } else {
        await debouncedFetch(true);
      }
    } catch {
      setInitializationState("error");
    } finally {
      setIsSyncing(false);
      setIsRefreshing(false);
      setDataLoaded(true);
    }
  }, [userId, timeRange, debouncedFetch, getSemanticAnalytics]);

  const handleRefresh = useCallback(async () => {
    if (isRefreshing || !isMountedRef.current) return;
    setIsRefreshing(true);
    try {
      await debouncedFetch(true);
      toast.success(`Analytics refreshed${isAIPowered ? " with AI enhancements" : ""}`);
    } catch (error: any) {
      toast.error("Failed to refresh: " + (error?.message ?? "Unknown error"));
    } finally {
      if (isMountedRef.current) setIsRefreshing(false);
    }
  }, [isRefreshing, debouncedFetch, isAIPowered]);

  const handleSync = useCallback(async () => {
    if (!userId || isSyncing || !isAIPowered) return;
    setIsSyncing(true);
    try {
      const [dataResult, queriesResult] = await Promise.allSettled([
        syncData?.(userId)    ?? Promise.resolve(undefined),
        syncQueries?.(userId) ?? Promise.resolve({ synced: 0 }),
      ]);
      const stats: any = queriesResult.status === "fulfilled" ? queriesResult.value ?? { synced: 0 } : { synced: 0 };
      const hasErrors  = dataResult.status === "rejected" || queriesResult.status === "rejected";
      hasErrors
        ? toast.warning("Sync completed with some issues")
        : toast.success(`AI data synchronized — ${stats.synced ?? 0} queries processed`);
      await debouncedFetch(true);
    } catch (error: any) {
      toast.error("Sync failed: " + (error?.message ?? "Unknown error"));
    } finally {
      setIsSyncing(false);
    }
  }, [userId, isSyncing, isAIPowered, syncData, syncQueries, debouncedFetch]);

  const handleExecuteQueriesForAnalytics = useCallback(async () => {
    if (!userId || isExecutingQueries || !isMountedRef.current) return;
    setIsExecutingQueries(true);
    toast.loading("Executing queries...", { id: "execute-queries" });
    try {
      const response = await fetch("/api/analytics/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ includeInactive: false }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      toast.dismiss("execute-queries");
      if (result.successful > 0) {
        toast.success(`Executed ${result.successful} quer${result.successful === 1 ? "y" : "ies"} successfully!`, { duration: 5000 });
        await debouncedFetch(true);
      } else {
        toast.warning("No queries were executed successfully");
      }
      if (result.failed > 0) toast.error(`${result.failed} quer${result.failed === 1 ? "y" : "ies"} failed`);
    } catch (error: any) {
      toast.dismiss("execute-queries");
      toast.error(`Failed to execute queries: ${error?.message || "Unknown error"}`);
    } finally {
      if (isMountedRef.current) setIsExecutingQueries(false);
    }
  }, [userId, isExecutingQueries, debouncedFetch]);

  const csvEscape = useCallback((value: unknown): string => {
    const str = value === null || value === undefined ? "" : String(value);
    return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  }, []);

  const handleExport = useCallback(() => {
    try {
      let dataToExport: any[] = [];
      let headers  = "";
      let filename = "";
      const dateStr = new Date().toISOString().split("T")[0];

      if (isAIPowered && semanticInsights?.contentAnomalies) {
        dataToExport = semanticInsights.contentAnomalies;
        headers  = ["Type","Query ID","URL","Title","Anomaly Score","Timestamp"].join(",") + "\n";
        filename = `Exa_AI_Analytics_${timeRange}_${dateStr}.csv`;
      } else if (Array.isArray((analyticsData as any).rankingTrendData)) {
        dataToExport = (analyticsData as any).rankingTrendData;
        headers  = ["Date","Avg Position","Volatility","Predicted Position","Is Anomaly","Count"].join(",") + "\n";
        filename = `Exa_Analytics_${dataSource}_${timeRange}_${dateStr}.csv`;
      }

      if (!Array.isArray(dataToExport) || dataToExport.length === 0) {
        toast.error("No data available for export"); return;
      }

      let csv = `Analytics Export - ${new Date().toLocaleDateString()}\n`;
      csv += `Time Range: ${timeRange}\nData Source: ${isAIPowered ? "AI" : "Traditional"}\n`;
      csv += `Total Snapshots: ${filteredSnapshotsLength}\n\n`;
      csv += headers;

      if (isAIPowered && semanticInsights?.contentAnomalies) {
        csv += semanticInsights.contentAnomalies
          .map((r: any) => [r.type,r.queryId,r.url,r.title,r.anomalyScore,r.timestamp].map(csvEscape).join(","))
          .join("\n");
      } else {
        csv += ((analyticsData as any).rankingTrendData ?? [])
          .map((r: any) =>
            [r?.date??"N/A",r?.avgPosition??0,r?.volatility??0,r?.predictedPosition??0,r?.isAnomaly??false,r?.count??0]
              .map(csvEscape).join(",")
          ).join("\n");
      }

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url  = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = filename;
      document.body.appendChild(link); link.click();
      document.body.removeChild(link); URL.revokeObjectURL(url);
      toast.success("Exported successfully");
    } catch (error: any) {
      toast.error("Export failed: " + (error?.message ?? "Unknown error"));
    }
  }, [timeRange, dataSource, filteredSnapshotsLength, analyticsData, semanticInsights, isAIPowered, csvEscape]);

  const handleClearFilters = useCallback(() => {
    setQueryTypeFilter("all"); setDomainFilter("all"); setDeduplicationStrategy("latest");
    toast.success("Filters cleared");
  }, []);

  const handleTimeRangeChange = useCallback((value: string) => {
    if (value !== timeRange) {
      setTimeRange(value);
      if (dataSource === "weaviate") { setDataLoaded(false); setInitializationState("pending"); }
    }
  }, [timeRange, dataSource]);

  const handleDeduplicationStrategyChange = useCallback(
    (value: DeduplicationStrategy) => { if (value !== deduplicationStrategy) setDeduplicationStrategy(value); },
    [deduplicationStrategy]
  );

  const exportDisabled = isAIPowered
    ? !(semanticInsights && Array.isArray(semanticInsights.contentAnomalies) && semanticInsights.contentAnomalies.length > 0)
    : !(Array.isArray((analyticsData as any).rankingTrendData) && (analyticsData as any).rankingTrendData.length > 0);

  const clearFiltersDisabled =
    (queryTypeFilter === "all" || !queryTypeFilter) &&
    (domainFilter    === "all" || !domainFilter)    &&
    (isAIPowered || deduplicationStrategy === "latest");

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
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh Data
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            {isAIPowered ? (
              <>
                <Brain className="h-8 w-8 text-purple-600" />
                AI Analytics Dashboard
                {(isRefreshing || isSyncing || initializationState === "loading") && (
                  <RefreshCw className="h-5 w-5 animate-spin text-gray-400" />
                )}
                <Badge variant="secondary" className="bg-gradient-to-r from-purple-100 to-blue-100 text-purple-700 border-purple-200">
                  <Zap className="h-3 w-3 mr-1" />AI Powered
                </Badge>
              </>
            ) : (
              <>
                <BarChart3 className="h-8 w-8 text-blue-600" />
                Analytics Dashboard
                {(isRefreshing || isSyncing) && <RefreshCw className="h-5 w-5 animate-spin text-gray-400" />}
              </>
            )}
          </h2>
          <p className="text-gray-500 mt-1">
            {isAIPowered
              ? "Advanced AI-powered semantic analysis with vector embeddings and predictive insights"
              : "Traditional ranking performance analytics with statistical insights"}
          </p>

          {/* Mode selector */}
          <div className="flex items-center gap-4 mt-3">
            <span className="text-sm font-medium">Analytics Mode:</span>
            <div className="flex rounded-lg border border-gray-200 p-1 bg-gray-50" role="tablist">
              <button
                onClick={() => handleDataSourceChange("appwrite")}
                disabled={isSyncing || initializationState === "loading"}
                role="tab" aria-selected={dataSource === "appwrite"}
                className={`px-4 py-2 text-sm rounded-md transition-all flex items-center gap-2 ${
                  dataSource === "appwrite"
                    ? "bg-white text-blue-700 font-medium shadow-sm border border-blue-200"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                }`}
              >
                <BarChart3 className="h-3 w-3" />Traditional
              </button>
              <button
                onClick={() => handleDataSourceChange("weaviate")}
                disabled={isSyncing || initializationState === "loading"}
                role="tab" aria-selected={dataSource === "weaviate"}
                className={`px-4 py-2 text-sm rounded-md transition-all flex items-center gap-2 ${
                  dataSource === "weaviate"
                    ? "bg-gradient-to-r from-purple-600 to-blue-600 text-white font-medium shadow-sm"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                }`}
              >
                <Brain className="h-3 w-3" />AI Analytics
                {(isSyncing || initializationState === "loading") && <RefreshCw className="h-3 w-3 animate-spin" />}
              </button>
            </div>
          </div>

          {/* Status indicators */}
          <div className="flex items-center gap-4 mt-3 text-xs flex-wrap">
            <div className="flex items-center gap-4 text-gray-600">
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 bg-blue-500 rounded-full" />{stableQueries.length} queries
              </span>
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-500 rounded-full" />{storedSnapshotCount} stored snapshots
              </span>
              {!isAIPowered && deduplicationStrategy !== "none" && (
                <span className="text-gray-500">({deduplicationStrategy} strategy)</span>
              )}
            </div>
            {isAIPowered && (
              <div className="flex items-center gap-2 ml-2 pl-2 border-l border-gray-300">
                <Badge
                  variant={connectionStatus === "connected" ? "default" : connectionStatus === "error" ? "destructive" : "secondary"}
                  className="text-xs"
                >
                  {connectionStatus === "connected" ? "Connected" : connectionStatus === "error" ? "Error" : "Connecting"}
                </Badge>
                {connectionHealthLabel && (
                  <span className="text-gray-500">Health: {connectionHealthLabel}</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={timeRange} onValueChange={handleTimeRangeChange}>
            <SelectTrigger className="w-[120px]"><SelectValue placeholder="Range" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7d</SelectItem>
              <SelectItem value="30d">Last 30d</SelectItem>
              <SelectItem value="90d">Last 90d</SelectItem>
              <SelectItem value="1y">Last 1y</SelectItem>
            </SelectContent>
          </Select>

          {!isAIPowered && (
            <Select value={deduplicationStrategy} onValueChange={v => handleDeduplicationStrategyChange(v as DeduplicationStrategy)}>
              <SelectTrigger className="w-[170px]"><SelectValue placeholder="Dedup Strategy" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="latest">Latest per day</SelectItem>
                <SelectItem value="average">Daily average</SelectItem>
                <SelectItem value="best">Best per day</SelectItem>
                <SelectItem value="worst">Worst per day</SelectItem>
                <SelectItem value="none">No deduplication</SelectItem>
              </SelectContent>
            </Select>
          )}

          <Select value={queryTypeFilter} onValueChange={setQueryTypeFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Query type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="informational">Informational</SelectItem>
              <SelectItem value="navigational">Navigational</SelectItem>
              <SelectItem value="transactional">Transactional</SelectItem>
            </SelectContent>
          </Select>

          <Select value={domainFilter} onValueChange={setDomainFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Domain" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All domains</SelectItem>
              {availableDomains.length > 0
                ? availableDomains.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)
                : <SelectItem value="all" disabled>No domains available</SelectItem>
              }
            </SelectContent>
          </Select>

          {isAIPowered && (
            <Button variant="outline" size="sm" onClick={handleSync}
              disabled={isSyncing || connectionStatus !== "connected" || initializationState !== "success"}
              className="gap-2 border-purple-200 hover:bg-purple-50">
              <RotateCcw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />Sync AI Data
            </Button>
          )}

          <Button variant="default" size="sm" onClick={handleExecuteQueriesForAnalytics}
            disabled={isExecutingQueries || isRefreshing || isSyncing || stableQueries.length === 0}
            className="gap-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700">
            <Play className={`h-4 w-4 ${isExecutingQueries ? "animate-pulse" : ""}`} />
            {isExecutingQueries ? "Executing..." : "Run Queries"}
          </Button>

          <Button variant="outline" size="sm" onClick={handleRefresh}
            disabled={isRefreshing || isSyncing || initializationState === "loading"}
            className="gap-2">
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />Refresh
          </Button>

          <Button variant="outline" size="sm" onClick={handleExport}
            disabled={exportDisabled} className="gap-2">
            <Download className="h-4 w-4" />Export
          </Button>

          <Button variant="ghost" size="sm" onClick={handleClearFilters}
            disabled={clearFiltersDisabled} className="gap-2">
            <Filter className="h-4 w-4" />Clear
          </Button>
        </div>
      </div>

      {/* ── Base stats grid — always visible ─────────────────────────────── */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{isAIPowered ? "Semantic Stability" : "Success Rate"}</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{performanceSummary.avgSuccessRate}%</div>
            <p className="text-xs text-muted-foreground">
              {isAIPowered ? "Weaviate semantic-cluster consistency" : "Successful snapshot executions"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Response Time</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{performanceSummary.avgResponseTime}</div>
            <p className="text-xs text-muted-foreground">Average processing time</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Queries</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stableQueries.length}</div>
            <p className="text-xs text-muted-foreground">Queries tracked</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Stored Snapshots</CardTitle>
            <Settings2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{filteredSnapshotsLength}</div>
            <p className="text-xs text-muted-foreground">
              {isAIPowered
                ? `${analyzedSnapshotGroupCount} Weaviate historical group${analyzedSnapshotGroupCount === 1 ? "" : "s"} analyzed`
                : `Using ${strategyInfo.label.toLowerCase()}`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* AI stats — additive, only in AI mode */}
      {isAIPowered && (
        <RevolutionaryStatsCard
          analytics={analyticsData}
          snapshots={stableSnapshots}
          semanticAnalytics={
            hasSemanticInsights(analyticsData)
              ? {
                  contentAnomalies: analyticsData.semanticInsights.contentAnomalies || [],
                  weaviateMetrics:  analyticsData.semanticInsights.weaviateMetrics  || {},
                  semanticClusters: analyticsData.semanticInsights.semanticClusters || [],
                  trendAnalysis:    analyticsData.semanticInsights.trendAnalysis    || {
                    growingTopics: [], decliningTopics: [], emergingPatterns: [],
                  },
                }
              : undefined
          }
          weaviateConnected={isConnected || !!semanticInsights}
          enhancedMetrics={
            hasEnhancedMetrics(analyticsData)
              ? {
                  semanticStability:
                    typeof analyticsData.enhancedMetrics.semanticStability === "number"
                      ? analyticsData.enhancedMetrics.semanticStability
                      : (analyticsData.enhancedMetrics.semanticStability as any)?.stabilityScore || 0,
                  contentCoherence:
                    typeof analyticsData.enhancedMetrics.contentCoherence === "number"
                      ? analyticsData.enhancedMetrics.contentCoherence
                      : (analyticsData.enhancedMetrics.contentCoherence as any)?.score ||
                        (analyticsData.enhancedMetrics.contentCoherence as any)?.overallCoherence || 0,
                  diversityIndex:           analyticsData.enhancedMetrics.diversityIndex || 0,
                  anomalyCount:             analyticsData.enhancedMetrics.anomalyCount   || 0,
                  clusterQuality:           analyticsData.enhancedMetrics.statisticalValidation?.accuracy || 0,
                  vectorSpaceUtilization:   analyticsData.enhancedMetrics.dataQuality?.completeness       || 0,
                }
              : undefined
          }
        />
      )}

      {/* Strategy info card */}
      <Card className={`border-l-4 ${isAIPowered ? "border-l-purple-500" : "border-l-blue-500"}`}>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <Badge variant="secondary" className={`mb-2 ${
                isAIPowered
                  ? "bg-gradient-to-r from-purple-100 to-blue-100 text-purple-700"
                  : "bg-blue-100 text-blue-700"
              }`}>
                {isAIPowered ? <><Brain className="h-3 w-3 mr-1" />AI-Powered Semantic Analysis</> : <>Current Strategy: {strategyInfo.label}</>}
              </Badge>
              <p className="text-sm text-gray-600">{strategyInfo.description}</p>
              {isAIPowered && connectionStatus === "error" && (
                <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />Connection issue detected. Try refreshing or syncing.
                </p>
              )}
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-500">{isAIPowered ? "Vector Embeddings" : "Filtered Snapshots"}</div>
              <div className={`text-2xl font-bold ${isAIPowered ? "text-purple-600" : "text-blue-600"}`}>
                {isAIPowered ? semanticInsights?.weaviateMetrics?.totalVectors || 0 : filteredSnapshotsLength}
              </div>
              <div className="text-xs text-gray-400">
                {isAIPowered ? "processed vectors" : `from ${stableSnapshots.length} total`}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className={`grid w-full ${isAIPowered ? "grid-cols-5" : "grid-cols-4"}`}>
          <TabsTrigger value="overview"    className="gap-2"><TrendingUp className="h-4 w-4" />Overview</TabsTrigger>
          <TabsTrigger value="rankings">Rankings</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="domains">Domains</TabsTrigger>
          {isAIPowered && (
            <TabsTrigger value="ai-insights" className="gap-2">
              <Brain className="h-4 w-4" />AI Insights
            </TabsTrigger>
          )}
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="space-y-6">
          {/* ✅ FIX 3: analyticsData instead of analytics — analytics can be
              null during initial load while analyticsData already has values */}
          {isLoading ? <AnalyticsAPIsSkeleton /> : <AnalyticsAPIs analytics={analyticsData} />}
          <div className="grid gap-6 lg:grid-cols-2">
            {isLoading ? (
              <><RankingTrendChartSkeleton /><CategoryPieChartSkeleton /></>
            ) : (
              <>
                <RankingTrendChart data={(analyticsData as any).rankingTrendData} />
                <CategoryPieChart  data={(analyticsData as any).categoryDistribution} />
              </>
            )}
          </div>
          {isLoading
            ? <TopPerformingQueriesSkeleton />
            : <TopPerformingQueries items={(analyticsData as any).topPerformingQueries} />
          }
        </TabsContent>

        {/* Rankings */}
        <TabsContent value="rankings" className="space-y-6">
          <div className="grid gap-6">
            {isLoading ? (
              <><RankingBarChartSkeleton /><QueryPerformanceStatsTableSkeleton /></>
            ) : (
              <>
                <RankingBarChart data={(analyticsData as any).rankingTrendData || []} />
                <QueryPerformanceStatsTable stats={(analyticsData as any).queryPerformanceStats || []} />
              </>
            )}
          </div>
        </TabsContent>

        {/* Performance */}
        <TabsContent value="performance" className="space-y-6">
          {isLoading
            ? <PerformanceChartsSkeleton />
            : <PerformanceCharts
                performanceData={(analyticsData as any).performanceData || []}
                successRateByHour={(analyticsData as any).successRateByHour || []}
              />
          }
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Performance Summary</CardTitle>
                <CardDescription>
                  {isAIPowered
                    ? "AI-powered semantic analysis metrics"
                    : `Based on ${filteredSnapshotsLength} deduplicated snapshots`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <div className="text-2xl font-bold text-green-600">{performanceSummary.avgSuccessRate}%</div>
                    <div className="text-sm text-gray-500">{isAIPowered ? "Semantic Stability" : "Avg Success Rate"}</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-blue-600">{performanceSummary.avgResponseTime}</div>
                    <div className="text-sm text-gray-500">Avg Response Time</div>
                  </div>
                  {isAIPowered && (performanceSummary as any).contentCoherence && (
                    <>
                      <div>
                        <div className="text-2xl font-bold text-purple-600">{(performanceSummary as any).contentCoherence}%</div>
                        <div className="text-sm text-gray-500">Content Coherence</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-orange-600">{(performanceSummary as any).diversityIndex}</div>
                        <div className="text-sm text-gray-500">Diversity Index</div>
                      </div>
                      {/* ✅ FIX 4: AlgorithmUpdatePanel REMOVED from here —
                          it's a full standalone Card, not a grid cell.
                          Moved to the AI Insights tab where it belongs. */}
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
            {!isLoading && (
              <QueryPerformanceStatsTable stats={(analyticsData as any).queryPerformanceStats || []} />
            )}
          </div>
        </TabsContent>

        {/* Domains */}
        <TabsContent value="domains" className="space-y-6">
          {isLoading
            ? <DomainAnalysisSkeleton />
            : <DomainAnalysis snapshots={(analyticsData as any).filteredSnapshots || []} />
          }
        </TabsContent>

        {/* AI Insights */}
        {isAIPowered && (
          <TabsContent value="ai-insights" className="space-y-6">
            {initializationState === "loading" ? (
              <Card>
                <CardContent className="text-center py-12">
                  <RefreshCw className="h-12 w-12 mx-auto mb-4 text-purple-600 animate-spin" />
                  <h3 className="text-lg font-medium mb-2">Initializing AI Analytics</h3>
                  <p className="text-gray-500 mb-4">Setting up vector embeddings and semantic analysis...</p>
                  <Progress value={66} className="w-64 mx-auto" />
                </CardContent>
              </Card>
            ) : initializationState === "error" ? (
              <Card>
                <CardContent className="text-center py-12">
                  <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-600" />
                  <h3 className="text-lg font-medium mb-2">AI Initialization Failed</h3>
                  <p className="text-gray-500 mb-4">Unable to initialize AI analytics. Please try again.</p>
                  <Button onClick={() => handleDataSourceChange("weaviate")} variant="outline">
                    <Brain className="h-4 w-4 mr-2" />Retry AI Setup
                  </Button>
                </CardContent>
              </Card>
            ) : !enhancedMetrics && !semanticInsights ? (
              <Card>
                <CardContent className="text-center py-12">
                  <Brain className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <h3 className="text-lg font-medium mb-2">No AI Insights Yet</h3>
                  <p className="text-gray-500 mb-4">Sync your data to generate semantic insights.</p>
                  <Button onClick={handleSync} disabled={isSyncing || connectionStatus !== "connected"} className="gap-2">
                    <RotateCcw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
                    {isSyncing ? "Syncing..." : "Sync AI Data"}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                {userId && (
                  <PredictiveRankingsWidget
                    userId={userId}
                    queries={stableQueries}
                    snapshots={(analyticsData as any).filteredSnapshots || []}
                    semanticAnalytics={semanticInsights}
                    enhancedMetrics={enhancedMetrics}
                  />
                )}

                {/* ✅ FIX 4: AlgorithmUpdatePanel now lives here as a
                    standalone sibling Card in the AI Insights tab.
                    Previously nested inside a Performance tab Card grid
                    cell which broke its layout and double-gated it. */}
                <AlgorithmUpdatePanel />

                <div className="grid gap-6 lg:grid-cols-2">
                  <SemanticHeatmap
                    snapshots={(analyticsData as any).filteredSnapshots || []}
                    queries={stableQueries}
                    semanticAnalytics={semanticInsights ?? undefined}
                  />
                </div>

                {enhancedMetrics && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Brain className="h-5 w-5 text-purple-600" />AI Semantic Metrics
                      </CardTitle>
                      <CardDescription>Advanced AI-powered content analysis</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="text-center p-3 bg-purple-50 rounded-lg">
                          <div className="text-2xl font-bold text-purple-600">
                            {(typeof enhancedMetrics.semanticStability === "number"
                              ? enhancedMetrics.semanticStability
                              : (enhancedMetrics.semanticStability as any)?.stabilityScore || 0
                            ).toFixed(1)}%
                          </div>
                          <div className="text-sm text-purple-700">Semantic Stability</div>
                        </div>
                        <div className="text-center p-3 bg-blue-50 rounded-lg">
                          <div className="text-2xl font-bold text-blue-600">
                            {(typeof enhancedMetrics.contentCoherence === "number"
                              ? enhancedMetrics.contentCoherence
                              : (enhancedMetrics.contentCoherence as any)?.score ||
                                (enhancedMetrics.contentCoherence as any)?.overallCoherence || 0
                            ).toFixed(1)}%
                          </div>
                          <div className="text-sm text-blue-700">Content Coherence</div>
                        </div>
                        <div className="text-center p-3 bg-green-50 rounded-lg">
                          <div className="text-2xl font-bold text-green-600">
                            {enhancedMetrics.diversityIndex?.toFixed(1) || "0.0"}
                          </div>
                          <div className="text-sm text-green-700">Diversity Index</div>
                        </div>
                        <div className="text-center p-3 bg-orange-50 rounded-lg">
                          <div className="text-2xl font-bold text-orange-600">
                            {enhancedMetrics.anomalyCount || 0}
                          </div>
                          <div className="text-sm text-orange-700">Anomalies Detected</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="h-5 w-5 text-blue-600" />Statistical Validation Dashboard
                    </CardTitle>
                    <CardDescription>Statistical analysis with confidence intervals</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-6 lg:grid-cols-2">
                      <div className="space-y-4">
                        <h4 className="font-semibold">AI Model Performance</h4>
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
                      </div>
                      <div className="space-y-4">
                        <h4 className="font-semibold">Data Quality Assessment</h4>
                        {enhancedMetrics?.dataQuality ? (
                          <div className="space-y-3">
                            {Object.entries(enhancedMetrics.dataQuality)
                              .filter(([key]) => key !== "assessedAt")
                              .map(([key, value]) => {
                                const label    = key.charAt(0).toUpperCase() + key.slice(1);
                                const numValue = typeof value === "number" ? value : 0;
                                const displayValue = key === "anomalyCount" ? value : `${numValue.toFixed(1)}%`;
                                return (
                                  <div key={key} className="space-y-1">
                                    <div className="flex justify-between text-sm">
                                      <span>{label}</span>
                                      <span className={`font-medium ${
                                        key === "anomalyCount"
                                          ? numValue > 5  ? "text-red-600"    : "text-green-600"
                                          : numValue > 80 ? "text-green-600"
                                          : numValue > 60 ? "text-yellow-600" : "text-red-600"
                                      }`}>{displayValue as any}</span>
                                    </div>
                                    {key !== "anomalyCount" && <Progress value={numValue} className="h-2" />}
                                  </div>
                                );
                              })}
                          </div>
                        ) : (
                          <div className="text-center py-8 text-gray-500">
                            <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                            <div className="text-sm">Data quality assessment not available</div>
                            {userId && (
                              <Button variant="outline" size="sm" className="mt-2"
                                onClick={async () => {
                                  try {
                                    await assessDataQuality?.(userId);
                                    toast.success("Data quality assessment completed");
                                  } catch {
                                    toast.error("Failed to assess data quality");
                                  }
                                }}>
                                Run Assessment
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {semanticInsights?.contentAnomalies && semanticInsights.contentAnomalies.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Content Anomalies Detected</CardTitle>
                      <CardDescription>AI-identified content deviating from expected patterns</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {semanticInsights.contentAnomalies.slice(0, 5).map((anomaly: any, index: number) => (
                          <div key={index} className="border rounded-lg p-3">
                            <div className="flex items-center justify-between mb-2">
                              <Badge variant="destructive" className="text-xs">{anomaly.type}</Badge>
                              <span className="text-xs text-gray-500">Score: {Number(anomaly.anomalyScore).toFixed(2)}</span>
                            </div>
                            <h4 className="font-medium text-sm mb-1">{anomaly.title}</h4>
                            <p className="text-xs text-gray-600 mb-1">{anomaly.description}</p>
                            <a href={anomaly.url} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-blue-500 hover:underline">{anomaly.url}</a>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {stableQueries.length > 0 && (
                  <SERPJourneyFlow snapshots={(analyticsData as any).filteredSnapshots || []} />
                )}
              </>
            )}
          </TabsContent>
        )}
      </Tabs>

      {/* Dev debug panel */}
      {isDev && (
        <Card className="border-dashed">
          <CardHeader><CardTitle className="text-sm">Debug Information</CardTitle></CardHeader>
          <CardContent className="text-xs text-gray-500 space-y-1">
            <div>Data Source: {dataSource}</div>
            <div>User ID: {userId}</div>
            <div>Data Loaded: {dataLoaded ? "Yes" : "No"}</div>
            <div>Connection Status: {connectionStatus}</div>
            <div>Analytics Available: {analytics ? "Yes" : "No"}</div>
            <div>Semantic Insights: {semanticInsights ? "Yes" : "No"}</div>
            <div>Enhanced Metrics: {enhancedMetrics ? "Yes" : "No"}</div>
            <div>Time Range: {timeRange} ({timeRangeMs}ms)</div>
            <div>Complete Dataset: {stableSnapshots.length} snapshots</div>
            <div>Filtered Dataset: {filteredSnapshotsLength} snapshots</div>
            <div>Queries: {stableQueries.length}</div>
            <div>Available Domains: {availableDomains.join(", ") || "none"}</div>
            <div>Loading: Analytics={String(analyticsLoading)}, Queries={String(queriesLoading)}, Weaviate={String(weaviateLoading)}, Snapshots={String(isLoadingSnapshots)}</div>
            {(weaviateError || analyticsError) && (
              <div className="text-red-600">Errors: {weaviateError || analyticsError}</div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
