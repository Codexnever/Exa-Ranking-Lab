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
import {
  Download,
  Filter,
  RefreshCw,
  TrendingUp,
  BarChart3,
  Settings2,
  Target,
  Brain,
  AlertCircle,
  RotateCcw,
  Zap,
  Play,
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

// Dynamic imports with proper skeletons
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
  () =>
    import("@/components/analytics/QueryPerformanceStatsTable").then(
      (mod) => mod.QueryPerformanceStatsTable
    ),
  { loading: () => <QueryPerformanceStatsTableSkeleton />, ssr: false }
);
const DomainAnalysis = dynamic(
  () => import("@/components/analytics/DomainAnalysis").then((mod) => mod.DomainAnalysis),
  { loading: () => <DomainAnalysisSkeleton />, ssr: false }
);

type DeduplicationStrategy = "latest" | "average" | "best" | "worst" | "none";

type SemanticInsights = import("@/types/type").SemanticInsights;
type EnhancedMetrics = import("@/types/type").EnhancedMetrics;
type EnhancedAnalyticsData = import("@/types/type").EnhancedAnalyticsData;

// Type guards
function hasSemanticInsights(obj: any): obj is { semanticInsights: SemanticInsights } {
  return obj && typeof obj === "object" && "semanticInsights" in obj && obj.semanticInsights != null;
}

function hasEnhancedMetrics(obj: any): obj is { enhancedMetrics: EnhancedMetrics } {
  return obj && typeof obj === "object" && "enhancedMetrics" in obj && obj.enhancedMetrics != null;
}

// Debug logger - no-ops in production
const isDev = process.env.NODE_ENV === "development";
const debugLog = (...args: any[]) => {
  if (isDev) console.log(...args);
};

export default function Analytics() {
  const { user } = useAuth();

  debugLog('[Analytics Page] Render - user:', user ? 'exists' : 'null/undefined', 'userId:', user?.$id);

  const userId = user?.$id; // Keep as undefined if user is not loaded

  // Stores
  const {
    analytics,
    isLoading: analyticsLoading,
    dataSource,
    setDataSource,
    fetchAnalytics,
    error: analyticsError,
  } = useAnalyticsStore();

  const {
    queries,
    isLoading: queriesLoading,
    fetchQueries,
    syncWithWeaviate,
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
    initializeWeaviateMode,
    vectorsAvailable,
  } = useWeaviateStore();
console.log('Weaviate store state:', {
  "Semanticinsights": semanticInsights,
  "EnhancedMetrics": enhancedMetrics,
  "IsConnected": isConnected,
  "ConnectionStatus": connectionStatus,
  "VectorsAvailable": vectorsAvailable,
})
  const {
    allSnapshots,
    isLoadingAnalytics: isLoadingSnapshots,
    fetchAllSnapshots,
    checkAndRefreshIfEmpty,
  } = useSnapshotsStore();

  // Refs and state
  const isMountedRef = useRef(true);
  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastFetchTimeRef = useRef(0);

  const [timeRange, setTimeRange] = useState("30d");
  const [deduplicationStrategy, setDeduplicationStrategy] = useState<DeduplicationStrategy>("latest");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isExecutingQueries, setIsExecutingQueries] = useState(false);
  const [queryTypeFilter, setQueryTypeFilter] = useState("all");
  const [domainFilter, setDomainFilter] = useState("all");
  const [dataLoaded, setDataLoaded] = useState(false);
  const [initializationState, setInitializationState] = useState<
    "pending" | "loading" | "success" | "error"
  >("pending");

  // Filters and stable arrays
  const filters = useMemo(
    () => ({
      queryType: queryTypeFilter === "all" ? "" : queryTypeFilter || "",
      domain: domainFilter === "all" ? "" : domainFilter || "",
    }),
    [queryTypeFilter, domainFilter]
  );

  const stableQueries = useMemo(() => {
    const q = Array.isArray(queries) ? queries : [];
    debugLog('[Analytics] Stable queries:', q.length);
    return q;
  }, [queries]);

  const stableSnapshots = useMemo(() => {
    const s = Array.isArray(allSnapshots) ? allSnapshots : [];
    debugLog('[Analytics] Stable snapshots:', s.length, 'from allSnapshots:', allSnapshots?.length);
    return s;
  }, [allSnapshots]);

  // Dynamically derive available domains from snapshots for the domain filter
  //
  //  FIX: domains live on each search RESULT (s.results[i].domain/url),
  //    not on the snapshot itself — RankingSnapshot has no top-level
  //    domain/url field. The old code (`s?.domain || s?.url`) always
  //    evaluated to undefined, so this dropdown always showed
  //    "No domains available" regardless of how much data existed.
  const availableDomains = useMemo(() => {
    const set = new Set<string>();
    stableSnapshots.forEach((s) => {
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
      "7d": 7 * 24 * 60 * 60 * 1000,
      "30d": 30 * 24 * 60 * 60 * 1000,
      "90d": 90 * 24 * 60 * 60 * 1000,
      "1y": 365 * 24 * 60 * 60 * 1000,
    };
    return ranges[timeRange] || ranges["30d"];
  }, [timeRange]);

  // Determine AI capabilities
  const isAIPowered = useMemo(() => {
    const powered = dataSource === "weaviate";
    debugLog('[Analytics] AI powered check:', {
      dataSource,
      isConnected,
      hasSemanticInsights: !!semanticInsights,
      hasEnhancedMetrics: !!enhancedMetrics,
      vectorsAvailable,
      isAIPowered: powered
    });
    return powered;
  }, [dataSource, isConnected, semanticInsights, enhancedMetrics, vectorsAvailable]);
  // Analytics Data Assembly
  //
  // NOTE on filters/dedup consistency across modes:
  // `filters` (queryType/domain) and `deduplicationStrategy` are passed into
  // analyticsCalculations() in EVERY branch below (AI-from-snapshots branch,
  // and the traditional branch). This means switching dataSource does NOT
  // change which underlying snapshots are considered — only whether semantic
  // insights are layered on top. The dedup selector is hidden in AI mode
  // (see JSX) because AI mode's semantic analysis operates on raw Weaviate
  // exports rather than deduplicated daily snapshots, but the rankingTrendData/
  // categoryDistribution/etc shown in Overview/Rankings/Domains tabs come from
  // the SAME analyticsCalculations() computation in both modes when `analytics`
  // (store value) is empty — so those tabs look consistent across the switch.
  const analyticsData = useMemo(() => {
    debugLog('[Analytics] Assembling analytics data:', {
      isAIPowered,
      hasAnalytics: !!analytics,
      analyticsKeys: analytics ? Object.keys(analytics) : [],
      snapshotsCount: stableSnapshots.length,
      queriesCount: stableQueries.length
    });

    if (isAIPowered) {
      if (analytics) {
        const analyticsEnhanced = analytics as EnhancedAnalyticsData;
        debugLog('[Analytics] Using AI-powered analytics from store');
        return {
          ...analytics,
          hasSemanticData: true,
          isVectorEnhanced: true,
          vectorsAvailable: vectorsAvailable ?? false,
          semanticInsights: analyticsEnhanced.semanticInsights || semanticInsights,
          enhancedMetrics: analyticsEnhanced.enhancedMetrics || enhancedMetrics,
          isWeaviateSource: true,
        };
      }

      // If no analytics from store but we have snapshots, calculate traditional analytics
      // and enhance with semantic data if available
      if (stableSnapshots.length > 0) {
        debugLog('[Analytics] No analytics from store, calculating from snapshots');
        const calculated = analyticsCalculations(
          stableQueries,
          stableSnapshots,
          timeRange,
          filters,
          deduplicationStrategy
        );

        return {
          ...calculated,
          hasSemanticData: !!(semanticInsights || enhancedMetrics),
          isVectorEnhanced: vectorsAvailable ?? false,
          vectorsAvailable: vectorsAvailable ?? false,
          semanticInsights: semanticInsights ?? undefined,
          enhancedMetrics: enhancedMetrics ?? undefined,
          isWeaviateSource: true,
        };
      }

      // Only return empty data if we truly have no snapshots
      debugLog('[Analytics] No analytics and no snapshots - returning empty AI data');
      if (semanticInsights || enhancedMetrics) {
        return {
          timeRangeMs,
          filteredSnapshots: [],
          rankingTrendData: [],
          categoryDistribution: [],
          successRateByHour: [],
          performanceData: [],
          topPerformingQueries: [],
          queryPerformanceStats: [],
          hasSemanticData: true,
          isVectorEnhanced: true,
          vectorsAvailable: vectorsAvailable ?? false,
          semanticInsights: semanticInsights ?? undefined,
          enhancedMetrics: enhancedMetrics ?? undefined,
          isWeaviateSource: true,
        };
      }
    }

    if (analytics) {
      return {
        ...analytics,
        hasSemanticData: false,
        isVectorEnhanced: false,
        vectorsAvailable: false,
      };
    }

    const calculated = analyticsCalculations(
      stableQueries,
      stableSnapshots,
      timeRange,
      filters,
      deduplicationStrategy
    );

    return {
      ...calculated,
      hasSemanticData: false,
      isVectorEnhanced: false,
      vectorsAvailable: false,
    };
  }, [
    analytics,
    isAIPowered,
    stableQueries,
    stableSnapshots,
    timeRange,
    filters,
    deduplicationStrategy,
    semanticInsights,
    enhancedMetrics,
    timeRangeMs,
    vectorsAvailable,
  ]);

  const filteredSnapshotsLength = useMemo(
    () => (Array.isArray(analyticsData.filteredSnapshots) ? analyticsData.filteredSnapshots.length : 0),
    [analyticsData.filteredSnapshots]
  );

  const isLoading = useMemo(
    () =>
      queriesLoading ||
      isLoadingSnapshots ||
      analyticsLoading ||
      weaviateLoading ||
      !dataLoaded ||
      initializationState === "loading",
    [
      queriesLoading,
      isLoadingSnapshots,
      analyticsLoading,
      weaviateLoading,
      dataLoaded,
      initializationState,
    ]
  );

  // Performance summary
  const performanceSummary = useMemo(() => {
    try {
      if (isAIPowered && enhancedMetrics) {
        let stabilityValue = 0;
        let coherenceValue = 0;

        if (typeof enhancedMetrics.semanticStability === "number") {
          stabilityValue = enhancedMetrics.semanticStability;
        } else if (
          enhancedMetrics.semanticStability &&
          typeof enhancedMetrics.semanticStability === "object"
        ) {
          stabilityValue = (enhancedMetrics.semanticStability as any).stabilityScore || 0;
        }

        if (typeof enhancedMetrics.contentCoherence === "number") {
          coherenceValue = enhancedMetrics.contentCoherence;
        } else if (
          enhancedMetrics.contentCoherence &&
          typeof enhancedMetrics.contentCoherence === "object"
        ) {
          coherenceValue = (enhancedMetrics.contentCoherence as any).overallCoherence ||
            (enhancedMetrics.contentCoherence as any).score ||
            0;
        }

        return {
          avgSuccessRate: stabilityValue.toFixed(1),
          avgResponseTime: "rs time",
          contentCoherence: coherenceValue.toFixed(1),
          diversityIndex: enhancedMetrics.diversityIndex?.toFixed(1) || "0",
          isSemanticEnhanced: true,
        };
      }

      const sr = analyticsData?.successRateByHour;
      if (!sr || !Array.isArray(sr) || sr.length === 0) {
        return {
          avgSuccessRate: "0",
          avgResponseTime: "0ms",
          isSemanticEnhanced: false,
        };
      }

      const validHours = sr.filter(
        (h: any) =>
          h &&
          typeof h === "object" &&
          typeof h.successRate === "number" &&
          !isNaN(h.successRate)
      );

      if (validHours.length === 0) {
        return {
          avgSuccessRate: "0",
          avgResponseTime: "0ms",
          isSemanticEnhanced: false,
        };
      }

      const avgSuccessRate = (
        validHours.reduce((sum: number, h: any) => sum + h.successRate, 0) / validHours.length
      ).toFixed(1);

      const rawAvgTime = (
        validHours.reduce((sum: number, h: any) => sum + (h.avgTime || 0), 0) / validHours.length
      ).toFixed(0);

      const avgResponseTime = formatResponseTime(Number(rawAvgTime));

      return {
        avgSuccessRate,
        avgResponseTime,
        isSemanticEnhanced: false,
      };
    } catch {
      return {
        avgSuccessRate: "0",
        avgResponseTime: "0ms",
        isSemanticEnhanced: false,
      };
    }
  }, [analyticsData?.successRateByHour, isAIPowered, enhancedMetrics]);

  const connectionHealth = useMemo(() => {
    try {
      return isAIPowered ? getConnectionHealth?.() ?? null : null;
    } catch {
      return null;
    }
  }, [getConnectionHealth, isAIPowered]);

  // Render a human-friendly connection health string regardless of shape
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
      latest: { label: "Latest per Day", description: "Uses the most recent snapshot for each query per day" },
      average: { label: "Daily Average", description: "Creates synthetic snapshots by averaging multiple daily snapshots" },
      best: { label: "Best per Day", description: "Uses the snapshot with the best (lowest) average position per day" },
      worst: { label: "Worst per Day", description: "Uses the snapshot with the worst (highest) average position per day" },
      none: { label: "No Deduplication", description: "Uses all snapshots including duplicates" },
    } as const;

    const info = baseInfo[deduplicationStrategy] || baseInfo.latest;

    if (isAIPowered) {
      return {
        ...info,
        description: "AI-powered semantic analysis with vector-based insights",
      };
    }

    return info;
  }, [deduplicationStrategy, isAIPowered]);

  // Debounced fetch
  const debouncedFetch = useCallback(
    async (force = false) => {
      const now = Date.now();
      const timeSinceLastFetch = now - lastFetchTimeRef.current;

      if (!force && timeSinceLastFetch < 5000) {
        debugLog('[Analytics] Skipping fetch - too soon since last fetch');
        return;
      }

      debugLog('[Analytics] Validating userId:', { userId, type: typeof userId, trimmed: userId?.trim(), isEmpty: userId?.trim() === '' });

      if (!userId || typeof userId !== 'string' || userId.trim() === '' || !isMountedRef.current) {
        debugLog('[Analytics] Skipping fetch - invalid userId or not mounted');
        return;
      }

      try {
        debugLog('[Analytics] debouncedFetch executing with userId:', userId);

        lastFetchTimeRef.current = now;
        const promises: Promise<any>[] = [];

        if (fetchQueries) promises.push(fetchQueries(userId, force));
        if (fetchAllSnapshots) promises.push(fetchAllSnapshots(userId));

        if (dataSource === "weaviate") {
          debugLog('[Analytics] Using Weaviate data source');
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
          debugLog('[Analytics] Using Appwrite data source, calling fetchAnalytics with userId:', userId);
          if (fetchAnalytics) {
            promises.push(fetchAnalytics(userId, timeRangeMs, stableQueries, force));
          }
        }

        if (promises.length > 0) {
          await Promise.allSettled(promises);
        }

        if (isMountedRef.current) {
          setDataLoaded(true);
        }
      } catch {
        if (isMountedRef.current) {
          setDataLoaded(true);
          if (dataSource === "weaviate") {
            setInitializationState("error");
          }
        }
      }
    },
    [
      userId,
      dataSource,
      timeRange,
      timeRangeMs,
      fetchQueries,
      fetchAllSnapshots,
      fetchAnalytics,
      getSemanticAnalytics,
      stableQueries,
      initializeWeaviateMode,
      initializationState,
    ]
  );

  // Initialization
  useEffect(() => {
    if (userId && typeof userId === 'string' && userId.trim() !== '' && !dataLoaded && isMountedRef.current) {
      debugLog('[Analytics] Initialization useEffect - triggering fetch for userId:', userId);

      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);

      checkAndRefreshIfEmpty?.(userId);

      fetchTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          debouncedFetch(true).catch(() => {});
        }
      }, 100);
    } else {
      debugLog('[Analytics] Initialization useEffect - skipping fetch:', {
        userId,
        hasUserId: !!userId,
        isString: typeof userId === 'string',
        dataLoaded,
        isMounted: isMountedRef.current
      });
    }

    return () => {
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
    };
  }, [userId, dataLoaded, dataSource, debouncedFetch, checkAndRefreshIfEmpty]);

  // Cleanup mount flag
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
    };
  }, []);

  // Handlers
 const handleDataSourceChange = useCallback(
    async (newSource: "appwrite" | "weaviate") => {
      // Pull both setDataSource actions from their respective stores
      const setAnalyticsSource = useAnalyticsStore.getState().setDataSource;
      const setWeaviateSource = useWeaviateStore.getState().setDataSource;

      setIsRefreshing(true);
      setDataLoaded(false);
      setInitializationState("pending");

      try {
        // ✅ CRITICAL FIX: Sync both store states simultaneously
        setAnalyticsSource(newSource);
        setWeaviateSource(newSource); 

        if (newSource === "weaviate") {
          setIsSyncing(true);
          setInitializationState("loading");
          
          if (userId) {
            // Now this call won't bail out because useWeaviateStore knows it's in weaviate mode!
            await getSemanticAnalytics(userId, timeRange);
            setInitializationState("success");
            toast.success("AI Analytics enabled!");
          }
        } else {
          await debouncedFetch(true);
        }
      } catch (error) {
        setInitializationState("error");
      } finally {
        setIsSyncing(false);
        setIsRefreshing(false);
        setDataLoaded(true);
      }
    },
    [userId, timeRange, debouncedFetch, getSemanticAnalytics]
  );

  const handleRefresh = useCallback(async () => {
    if (isRefreshing || !isMountedRef.current) return;
    setIsRefreshing(true);
    try {
      await debouncedFetch(true);
      const enhancementNote = isAIPowered ? " with AI enhancements" : "";
      toast.success(`Analytics refreshed successfully${enhancementNote}`);
    } catch (error: any) {
      toast.error("Failed to refresh analytics: " + (error?.message ?? "Unknown error"));
    } finally {
      if (isMountedRef.current) setIsRefreshing(false);
    }
  }, [isRefreshing, debouncedFetch, isAIPowered]);

  const handleSync = useCallback(async () => {
    if (!userId || isSyncing || !isAIPowered) return;
    setIsSyncing(true);
    try {
      const [dataResult, queriesResult] = await Promise.allSettled([
        syncData?.(userId) ?? Promise.resolve(undefined),
        syncQueries?.(userId) ?? Promise.resolve({ synced: 0 }),
      ]);

      let successMessage = "AI data synchronized";
      let hasErrors = false;

      if (dataResult.status === "fulfilled") {
        successMessage += " - Data synced";
      } else {
        hasErrors = true;
      }

      if (queriesResult.status === "fulfilled") {
        const stats: any = queriesResult.value ?? { synced: 0 };
        successMessage += ` - ${stats.synced ?? 0} queries processed`;
      } else {
        hasErrors = true;
      }

      if (hasErrors) {
        toast.warning("Sync completed with some issues");
      } else {
        toast.success(successMessage);
      }

      await debouncedFetch(true);
    } catch (error: any) {
      toast.error("Sync failed: " + (error?.message ?? "Unknown error"));
    } finally {
      setIsSyncing(false);
    }
  }, [userId, isSyncing, isAIPowered, syncData, syncQueries, debouncedFetch]);

  // Execute all queries and get fresh snapshots for analytics
  const handleExecuteQueriesForAnalytics = useCallback(async () => {
    if (!userId || isExecutingQueries || !isMountedRef.current) return;

    setIsExecutingQueries(true);
    toast.loading("Executing queries to collect fresh data...", { id: 'execute-queries' });

    try {
      const response = await fetch('/api/analytics/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          includeInactive: false // Only execute active queries
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `HTTP ${response.status}`);
      }

      toast.dismiss('execute-queries');

      if (result.successful > 0) {
        toast.success(
          `Successfully executed ${result.successful} ${result.successful === 1 ? 'query' : 'queries'} and created fresh snapshots!`,
          { duration: 5000 }
        );

        // Refresh analytics to show the new data
        await debouncedFetch(true);
      } else {
        toast.warning('No queries were executed successfully');
      }

      if (result.failed > 0) {
        toast.error(`${result.failed} ${result.failed === 1 ? 'query' : 'queries'} failed to execute`);
      }

    } catch (error: any) {
      toast.dismiss('execute-queries');
      console.error('[Analytics] Execute queries error:', error);
      toast.error(`Failed to execute queries: ${error?.message || 'Unknown error'}`);
    } finally {
      if (isMountedRef.current) setIsExecutingQueries(false);
    }
  }, [userId, isExecutingQueries, debouncedFetch]);

  // Escape a value for CSV — wraps in quotes and doubles internal quotes
  // if the value contains a comma, quote, or newline. Without this, any
  // anomaly title/description containing a comma silently corrupts the
  // CSV column alignment for that row and everything after it.
  const csvEscape = useCallback((value: unknown): string => {
    const str = value === null || value === undefined ? "" : String(value);
    if (/[",\n\r]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }, []);

  const handleExport = useCallback(() => {
    try {
      let dataToExport: any[] = [];
      let headers = "";
      let filename = "";
      const dateStr = new Date().toISOString().split("T")[0];

      if (isAIPowered && semanticInsights?.contentAnomalies) {
        dataToExport = semanticInsights.contentAnomalies;
        headers = ["Type", "Query ID", "URL", "Title", "Anomaly Score", "Timestamp"].join(",") + "\n";
        filename = `Exa_AI_Analytics_${timeRange}_${dateStr}.csv`;
      } else if (Array.isArray((analyticsData as any).rankingTrendData)) {
        dataToExport = (analyticsData as any).rankingTrendData;
        headers = ["Date", "Avg Position", "Volatility", "Predicted Position", "Is Anomaly", "Count"].join(",") + "\n";
        filename = `Exa_Analytics_${dataSource}_${timeRange}_${dateStr}.csv`;
      }

      if (!Array.isArray(dataToExport) || dataToExport.length === 0) {
        toast.error("No data available for export");
        return;
      }

      // ✅ No "data:text/csv;..." prefix here — Blob handles the MIME type
      let csvContent = "";
      csvContent += `Analytics Export - ${new Date().toLocaleDateString()}\n`;
      csvContent += `Time Range: ${timeRange}\n`;
      csvContent += `Data Source: ${isAIPowered ? "AI Analytics" : "Traditional Analytics"}\n`;
      csvContent += `AI Enhanced: ${isAIPowered ? "Yes" : "No"}\n`;
      csvContent += `Total Snapshots: ${filteredSnapshotsLength}\n\n`;
      csvContent += headers;

      if (isAIPowered && semanticInsights?.contentAnomalies) {
        csvContent += semanticInsights.contentAnomalies
          .map((row: any) =>
            [row.type, row.queryId, row.url, row.title, row.anomalyScore, row.timestamp]
              .map(csvEscape)
              .join(",")
          )
          .join("\n");
      } else {
        csvContent += (Array.isArray((analyticsData as any).rankingTrendData)
          ? (analyticsData as any).rankingTrendData
          : []
        )
          .map((row: any) =>
            [
              row?.date ?? "N/A",
              row?.avgPosition ?? 0,
              row?.volatility ?? 0,
              row?.predictedPosition ?? 0,
              row?.isAnomaly ?? false,
              row?.count ?? 0,
            ].map(csvEscape).join(",")
          )
          .join("\n");
      }

      // ✅ Blob + URL.createObjectURL — no data-URI size limits, no
      //    encoding issues with '#', '%', etc.
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url  = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`${isAIPowered ? "AI analytics" : "analytics"} data exported successfully`);
    } catch (error: any) {
      toast.error("Export failed: " + (error?.message ?? "Unknown error"));
    }
  }, [
    timeRange,
    dataSource,
    filteredSnapshotsLength,
    analyticsData,
    semanticInsights,
    isAIPowered,
    csvEscape,
  ]);

  const handleClearFilters = useCallback(() => {
    setQueryTypeFilter("all");
    setDomainFilter("all");
    setDeduplicationStrategy("latest");
    toast.success("Filters cleared");
  }, []);

  const handleTimeRangeChange = useCallback(
    (value: string) => {
      if (value !== timeRange) {
        setTimeRange(value);
        // For Weaviate mode, time range affects the initialized vector window,
        // so we need to re-fetch/re-initialize. For traditional mode,
        // analyticsCalculations recomputes synchronously via useMemo,
        // so we avoid the full-page skeleton flash.
        if (dataSource === "weaviate") {
          setDataLoaded(false);
          setInitializationState("pending");
        }
      }
    },
    [timeRange, dataSource]
  );

  const handleDeduplicationStrategyChange = useCallback(
    (value: DeduplicationStrategy) => {
      if (value !== deduplicationStrategy) setDeduplicationStrategy(value);
    },
    [deduplicationStrategy]
  );

  const exportDisabled = isAIPowered
    ? !(semanticInsights && Array.isArray(semanticInsights.contentAnomalies) && semanticInsights.contentAnomalies.length > 0)
    : !(Array.isArray((analyticsData as any).rankingTrendData) && (analyticsData as any).rankingTrendData.length > 0);

  const exportTitle = exportDisabled
    ? (isAIPowered
        ? "No anomaly data available to export"
        : "No ranking data available to export")
    : "Export current analytics data as CSV";

  const clearFiltersDisabled =
    (queryTypeFilter === "all" || !queryTypeFilter) &&
    (domainFilter === "all" || !domainFilter) &&
    (isAIPowered || deduplicationStrategy === "latest");

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

  // No data state
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
      {/* Header */}
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
                <Badge
                  variant="secondary"
                  className="bg-gradient-to-r from-purple-100 to-blue-100 text-purple-700 border-purple-200"
                >
                  <Zap className="h-3 w-3 mr-1" />
                  AI Powered
                </Badge>
              </>
            ) : (
              <>
                <BarChart3 className="h-8 w-8 text-blue-600" />
                Analytics Dashboard
                {(isRefreshing || isSyncing) && (
                  <RefreshCw className="h-5 w-5 animate-spin text-gray-400" />
                )}
              </>
            )}
          </h2>
          <p className="text-gray-500 mt-1">
            {isAIPowered
              ? "Advanced AI-powered semantic analysis with vector embeddings and predictive insights"
              : "Traditional ranking performance analytics with statistical insights"}
          </p>

          {/* Data Source Selector */}
          <div className="flex items-center gap-4 mt-3">
            <span className="text-sm font-medium">Analytics Mode:</span>
            <div className="flex rounded-lg border border-gray-200 p-1 bg-gray-50" role="tablist" aria-label="Analytics mode">
              <button
                onClick={() => handleDataSourceChange("appwrite")}
                disabled={isSyncing || initializationState === "loading"}
                role="tab"
                aria-selected={dataSource === "appwrite"}
                aria-pressed={dataSource === "appwrite"}
                className={`px-4 py-2 text-sm rounded-md transition-all duration-200 flex items-center gap-2 ${
                  dataSource === "appwrite"
                    ? "bg-white text-blue-700 font-medium shadow-sm border border-blue-200"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                }`}
              >
                <BarChart3 className="h-3 w-3" />
                Traditional
              </button>
              <button
                onClick={() => handleDataSourceChange("weaviate")}
                disabled={isSyncing || initializationState === "loading"}
                role="tab"
                aria-selected={dataSource === "weaviate"}
                aria-pressed={dataSource === "weaviate"}
                className={`px-4 py-2 text-sm rounded-md transition-all duration-200 flex items-center gap-2 ${
                  dataSource === "weaviate"
                    ? "bg-gradient-to-r from-purple-600 to-blue-600 text-white font-medium shadow-sm"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                }`}
              >
                <Brain className="h-3 w-3" />
                AI Analytics
                {(isSyncing || initializationState === "loading") && (
                  <RefreshCw className="h-3 w-3 animate-spin" />
                )}
              </button>
            </div>
          </div>

          {/* Status Indicators */}
          <div className="flex items-center gap-4 mt-3 text-xs flex-wrap">
            <div className="flex items-center gap-4 text-gray-600">
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 bg-blue-500 rounded-full" />
                {stableQueries.length} queries
              </span>
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-500 rounded-full" />
                {filteredSnapshotsLength} active snapshots
              </span>
              {!isAIPowered && deduplicationStrategy !== "none" && (
                <span className="text-gray-500">({deduplicationStrategy} strategy)</span>
              )}
            </div>

            {isAIPowered && (
              <div className="flex items-center gap-2 ml-2 pl-2 border-l border-gray-300">
                <Badge
                  variant={
                    connectionStatus === "connected"
                      ? "default"
                      : connectionStatus === "error"
                      ? "destructive"
                      : "secondary"
                  }
                  className="text-xs"
                >
                  {connectionStatus === "connected"
                    ? "Connected"
                    : connectionStatus === "error"
                    ? "Error"
                    : "Connecting"}
                </Badge>
                {connectionHealthLabel && (
                  <span className="text-gray-500">
                    Health: {connectionHealthLabel}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Time range — applies in BOTH modes; both branches of analyticsData
              pass `timeRange`/`timeRangeMs` into analyticsCalculations or the
              Weaviate fetch, so switching this selector affects whichever
              mode is currently active without needing separate state. */}
          <Select value={timeRange} onValueChange={handleTimeRangeChange}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7d</SelectItem>
              <SelectItem value="30d">Last 30d</SelectItem>
              <SelectItem value="90d">Last 90d</SelectItem>
              <SelectItem value="1y">Last 1y</SelectItem>
            </SelectContent>
          </Select>

          {/* Deduplication, only for traditional — AI mode's semantic
              analysis operates on raw Weaviate exports rather than
              deduplicated daily snapshots, so this control is not
              meaningful in AI mode. The selected strategy is preserved
              in state, so switching back to Traditional restores it. */}
          {!isAIPowered && (
            <Select
              value={deduplicationStrategy}
              onValueChange={(v) => handleDeduplicationStrategyChange(v as DeduplicationStrategy)}
            >
              <SelectTrigger className="w-[170px]">
                <SelectValue placeholder="Dedup Strategy" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="latest">Latest per day</SelectItem>
                <SelectItem value="average">Daily average</SelectItem>
                <SelectItem value="best">Best per day</SelectItem>
                <SelectItem value="worst">Worst per day</SelectItem>
                <SelectItem value="none">No deduplication</SelectItem>
              </SelectContent>
            </Select>
          )}

          {/* Filters — apply in BOTH modes via the `filters` object passed
              into analyticsCalculations(). Switching dataSource does not
              reset these. */}
          <Select value={queryTypeFilter} onValueChange={setQueryTypeFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Query type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="informational">Informational</SelectItem>
              <SelectItem value="navigational">Navigational</SelectItem>
              <SelectItem value="transactional">Transactional</SelectItem>
            </SelectContent>
          </Select>

          <Select value={domainFilter} onValueChange={setDomainFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Domain" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All domains</SelectItem>
              {availableDomains.length > 0 ? (
                availableDomains.map((domain) => (
                  <SelectItem key={domain} value={domain}>
                    {domain}
                  </SelectItem>
                ))
              ) : (
                <SelectItem value="all" disabled>
                  No domains available
                </SelectItem>
              )}
            </SelectContent>
          </Select>

          {/* AI Sync Button */}
          {isAIPowered && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={isSyncing || connectionStatus !== "connected" || initializationState !== "success"}
              className="gap-2 border-purple-200 hover:bg-purple-50"
              title="Sync semantic insights and vector data"
            >
              <RotateCcw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
              Sync AI Data
            </Button>
          )}

          <Button
            variant="default"
            size="sm"
            onClick={handleExecuteQueriesForAnalytics}
            disabled={isExecutingQueries || isRefreshing || isSyncing || stableQueries.length === 0}
            className="gap-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
            title={stableQueries.length === 0 ? "Add queries before running" : "Execute all active queries now"}
          >
            <Play className={`h-4 w-4 ${isExecutingQueries ? "animate-pulse" : ""}`} />
            {isExecutingQueries ? "Executing..." : "Run Queries"}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing || isSyncing || initializationState === "loading"}
            className="gap-2"
            title="Reload analytics data"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exportDisabled}
            className="gap-2"
            title={exportTitle}
          >
            <Download className="h-4 w-4" />
            Export
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearFilters}
            disabled={clearFiltersDisabled}
            className="gap-2"
            title="Reset filters and deduplication strategy"
          >
            <Filter className="h-4 w-4" />
            Clear
          </Button>
        </div>
      </div>

      {/* ── Stats: base layer ALWAYS visible, AI layer ADDITIVE ──────────────
          Previously: isAIPowered fully replaced this 4-card grid with
          RevolutionaryStatsCard, so switching to AI mode hid Success
          Rate / Total Queries / Active Snapshots entirely — those numbers
          don't become less relevant just because Weaviate is connected.
          Now: the base grid always renders. RevolutionaryStatsCard renders
          as an ADDITIONAL row below it only when isAIPowered, so the AI
          layer is purely additive — switching modes never removes
          information, only adds to it. */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{performanceSummary.avgSuccessRate}%</div>
            <p className="text-xs text-muted-foreground">Average across all queries</p>
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
            <CardTitle className="text-sm font-medium">Active Snapshots</CardTitle>
            <Settings2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{filteredSnapshotsLength}</div>
            <p className="text-xs text-muted-foreground">
              Using {strategyInfo.label.toLowerCase()}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* AI stats — additive row, only when AI mode is active and connected */}
      {isAIPowered && (
        <RevolutionaryStatsCard
          //  Pass analyticsData (the merged/computed value used everywhere
          //    else on this page) instead of raw `analytics` from the store.
          //    `analytics` can be null while analyticsData already has real
          //    calculated values (the "calculated from snapshots" branch),
          //    which previously caused this card to show empty/zero while
          //    the rest of the dashboard showed real numbers.
          analytics={analyticsData}
          snapshots={stableSnapshots}
          semanticAnalytics={
            hasSemanticInsights(analyticsData)
              ? {
                  contentAnomalies: analyticsData.semanticInsights.contentAnomalies || [],
                  weaviateMetrics: analyticsData.semanticInsights.weaviateMetrics || {},
                  semanticClusters: analyticsData.semanticInsights.semanticClusters || [],
                  trendAnalysis:
                    analyticsData.semanticInsights.trendAnalysis || {
                      growingTopics: [],
                      decliningTopics: [],
                      emergingPatterns: [],
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
                        (analyticsData.enhancedMetrics.contentCoherence as any)?.overallCoherence ||
                        0,
                  diversityIndex: analyticsData.enhancedMetrics.diversityIndex || 0,
                  anomalyCount: analyticsData.enhancedMetrics.anomalyCount || 0,
                  clusterQuality: analyticsData.enhancedMetrics.statisticalValidation?.accuracy || 0,
                  vectorSpaceUtilization: analyticsData.enhancedMetrics.dataQuality?.completeness || 0,
                }
              : undefined
          }
        />
      )}

      {/* Strategy/Mode Information Card */}
      <Card className={`border-l-4 ${isAIPowered ? "border-l-purple-500" : "border-l-blue-500"}`}>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <Badge
                variant="secondary"
                className={`mb-2 ${
                  isAIPowered
                    ? "bg-gradient-to-r from-purple-100 to-blue-100 text-purple-700"
                    : "bg-blue-100 text-blue-700"
                }`}
              >
                {isAIPowered ? (
                  <>
                    <Brain className="h-3 w-3 mr-1" />
                    AI-Powered Semantic Analysis
                  </>
                ) : (
                  <>Current Strategy: {strategyInfo.label}</>
                )}
              </Badge>
              <p className="text-sm text-gray-600">{strategyInfo.description}</p>
              {isAIPowered && connectionStatus === "error" && (
                <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Connection issue detected. Try refreshing or syncing data.
                </p>
              )}
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-500">
                {isAIPowered ? "Vector Embeddings" : "Filtered Snapshots"}
              </div>
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

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className={`grid w-full ${isAIPowered ? "grid-cols-5" : "grid-cols-4"}`}>
          <TabsTrigger value="overview" className="gap-2">
            <TrendingUp className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="rankings">Rankings</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="domains">Domains</TabsTrigger>
          {isAIPowered && (
            <TabsTrigger value="ai-insights" className="gap-2">
              <Brain className="h-4 w-4" />
              AI Insights
            </TabsTrigger>
          )}
        </TabsList>

        {/* Overview Tab — same analyticsData in both modes (see note above
            the analyticsData useMemo), so this tab's charts stay visually
            consistent across the mode switch. */}
        <TabsContent value="overview" className="space-y-6">
          {isLoading ? <AnalyticsAPIsSkeleton /> : <AnalyticsAPIs analytics={analytics} />}
          <div className="grid gap-6 lg:grid-cols-2">
            {isLoading ? (
              <>
                <RankingTrendChartSkeleton />
                <CategoryPieChartSkeleton />
              </>
            ) : (
              <>
                <RankingTrendChart data={(analyticsData as any).rankingTrendData} />
                <CategoryPieChart data={(analyticsData as any).categoryDistribution} />
              </>
            )}
          </div>
          {isLoading ? (
            <TopPerformingQueriesSkeleton />
          ) : (
            <TopPerformingQueries items={(analyticsData as any).topPerformingQueries} />
          )}
        </TabsContent>

        {/* Rankings Tab */}
        <TabsContent value="rankings" className="space-y-6">
          <div className="grid gap-6">
            {isLoading ? (
              <>
                <RankingBarChartSkeleton />
                <QueryPerformanceStatsTableSkeleton />
              </>
            ) : (
              <>
                <RankingBarChart data={(analyticsData as any).rankingTrendData || []} />
                <QueryPerformanceStatsTable stats={(analyticsData as any).queryPerformanceStats || []} />
              </>
            )}
          </div>
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance" className="space-y-6">
          {isLoading ? (
            <PerformanceChartsSkeleton />
          ) : (
            <PerformanceCharts
              performanceData={(analyticsData as any).performanceData || []}
              successRateByHour={(analyticsData as any).successRateByHour || []}
            />
          )}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Performance Summary</CardTitle>
                <CardDescription>
                  {isAIPowered
                    ? "AI-powered semantic analysis metrics"
                    : `Based on ${filteredSnapshotsLength} deduplicated snapshots using ${strategyInfo.label.toLowerCase()} strategy`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <div className="text-2xl font-bold text-green-600">{performanceSummary.avgSuccessRate}%</div>
                    <div className="text-sm text-gray-500">
                      {isAIPowered ? "Semantic Stability" : "Avg Success Rate"}
                    </div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-blue-600">{performanceSummary.avgResponseTime}</div>
                    <div className="text-sm text-gray-500">Processing Method</div>
                  </div>
                  {isAIPowered && (performanceSummary as any).contentCoherence && (
                    <>
                      <div>
                        <div className="text-2xl font-bold text-purple-600">
                          {(performanceSummary as any).contentCoherence}%
                        </div>
                        <div className="text-sm text-gray-500">Content Coherence</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-orange-600">
                          {(performanceSummary as any).diversityIndex}
                        </div>
                        <div className="text-sm text-gray-500">Diversity Index</div>
                      </div>
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

        {/* Domains Tab */}
        <TabsContent value="domains" className="space-y-6">
          {isLoading ? (
            <DomainAnalysisSkeleton />
          ) : (
            <DomainAnalysis snapshots={(analyticsData as any).filteredSnapshots || []} />
          )}
        </TabsContent>

        {/* AI Insights Tab */}
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
                    <Brain className="h-4 w-4 mr-2" />
                    Retry AI Setup
                  </Button>
                </CardContent>
              </Card>
            ) : !enhancedMetrics && !semanticInsights ? (
              <Card>
                <CardContent className="text-center py-12">
                  <Brain className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <h3 className="text-lg font-medium mb-2">No AI Insights Yet</h3>
                  <p className="text-gray-500 mb-4">
                    Sync your data to generate semantic insights, content anomaly
                    detection, and predictive rankings.
                  </p>
                  <Button
                    onClick={handleSync}
                    disabled={isSyncing || connectionStatus !== "connected"}
                    className="gap-2"
                  >
                    <RotateCcw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
                    {isSyncing ? "Syncing..." : "Sync AI Data"}
                  </Button>
                </CardContent>
              </Card>
            ) : (  // enhancedMetrics or semanticInsights exist, show the insights dashboard
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
                        <Brain className="h-5 w-5 text-purple-600" />
                        AI Semantic Metrics
                      </CardTitle>
                      <CardDescription>Advanced AI-powered content analysis</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="text-center p-3 bg-purple-50 rounded-lg">
                          <div className="text-2xl font-bold text-purple-600">
                            {(
                              typeof enhancedMetrics.semanticStability === "number"
                                ? enhancedMetrics.semanticStability
                                : (enhancedMetrics.semanticStability as any)?.stabilityScore || 0
                            ).toFixed(1)}
                            %
                          </div>
                          <div className="text-sm text-purple-700">Semantic Stability</div>
                        </div>
                        <div className="text-center p-3 bg-blue-50 rounded-lg">
                          <div className="text-2xl font-bold text-blue-600">
                            {(
                              typeof enhancedMetrics.contentCoherence === "number"
                                ? enhancedMetrics.contentCoherence
                                : (enhancedMetrics.contentCoherence as any)?.score ||
                                  (enhancedMetrics.contentCoherence as any)?.overallCoherence ||
                                  0
                            ).toFixed(1)}
                            %
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

                {/* Statistical Validation Dashboard */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="h-5 w-5 text-blue-600" />
                      Statistical Validation Dashboard
                    </CardTitle>
                    <CardDescription>Enterprise-grade statistical analysis with confidence intervals</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-6 lg:grid-cols-2">
                      {/* Model Performance */}
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

                      {/* Data Quality */}
                      <div className="space-y-4">
                        <h4 className="font-semibold">Data Quality Assessment</h4>
                        {enhancedMetrics?.dataQuality ? (
                          <div className="space-y-3">
                            {Object.entries(enhancedMetrics.dataQuality)
                              .filter(([key]) => key !== "assessedAt")
                              .map(([key, value]) => {
                                const label = key.charAt(0).toUpperCase() + key.slice(1);
                                const numValue = typeof value === "number" ? value : 0;
                                const displayValue =
                                  key === "anomalyCount" ? value : `${numValue.toFixed(1)}%`;

                                return (
                                  <div key={key} className="space-y-1">
                                    <div className="flex justify-between text-sm">
                                      <span>{label}</span>
                                      <span
                                        className={`font-medium ${
                                          key === "anomalyCount"
                                            ? numValue > 5
                                              ? "text-red-600"
                                              : "text-green-600"
                                            : numValue > 80
                                            ? "text-green-600"
                                            : numValue > 60
                                            ? "text-yellow-600"
                                            : "text-red-600"
                                        }`}
                                      >
                                        {displayValue as any}
                                      </span>
                                    </div>
                                    {key !== "anomalyCount" && (
                                      <Progress value={numValue} className="h-2" />
                                    )}
                                  </div>
                                );
                              })}
                          </div>
                        ) : (
                          <div className="text-center py-8 text-gray-500">
                            <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                            <div className="text-sm">Data quality assessment not available</div>
                            {userId && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="mt-2"
                                onClick={async () => {
                                  try {
                                    await assessDataQuality?.(userId);
                                    toast.success("Data quality assessment completed");
                                  } catch {
                                    toast.error("Failed to assess data quality");
                                  }
                                }}
                              >
                                Run Assessment
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {semanticInsights?.contentAnomalies &&
                  semanticInsights.contentAnomalies.length > 0 && (
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
                                  Score: {Number(anomaly.anomalyScore).toFixed(2)}
                                </span>
                              </div>
                              <h4 className="font-medium text-sm mb-1">{anomaly.title}</h4>
                              <p className="text-xs text-gray-600 mb-1">{anomaly.description}</p>
                              <a
                                href={anomaly.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-500 hover:underline"
                              >
                                {anomaly.url}
                              </a>
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

      {/* Debug Info */}
      {isDev && (
        <Card className="border-dashed">
          <CardHeader>
           <CardTitle className="text-sm">Debug Information</CardTitle>
           </CardHeader>
           <CardContent className="text-xs text-gray-500 space-y-1">
            <div>Data Source: {dataSource}</div>
            <div>User ID: {userId}</div>
            <div>Data Loaded: {dataLoaded ? "Yes" : "No"}</div>
            <div>Connection Status: {connectionStatus}</div>
            <div>Is Connected: {isConnected ? "Yes" : "No"}</div>
            <div>Analytics Available: {analytics ? "Yes" : "No"}</div>
            <div>Semantic Insights: {semanticInsights ? "Yes" : "No"}</div>
            <div>Enhanced Metrics: {enhancedMetrics ? "Yes" : "No"}</div>
            <div>Vectors Available: {(analyticsData as any).vectorsAvailable ? "Yes" : "No"}</div>
            <div>Has Semantic Data: {(analyticsData as any).hasSemanticData ? "Yes" : "No"}</div>
            <div>Is Vector Enhanced: {(analyticsData as any).isVectorEnhanced ? "Yes" : "No"}</div>
            <div>Time Range: {timeRange} ({timeRangeMs}ms)</div>
            <div>Complete Dataset: {stableSnapshots.length} snapshots</div>
            <div>Filtered Dataset: {filteredSnapshotsLength} snapshots</div>
            <div>Queries: {stableQueries.length}</div>
            <div>Available Domains: {availableDomains.join(", ") || "none"}</div>
            <div>
              Loading States: Analytics={String(analyticsLoading)}, Queries={String(
                queriesLoading
              )}, Weaviate={String(weaviateLoading)}, Snapshots={String(isLoadingSnapshots)}
            </div>
            <div>Refreshing: {isRefreshing ? "Yes" : "No"}</div>
            <div>Syncing: {isSyncing ? "Yes" : "No"}</div>
            {(weaviateError || analyticsError) && (
              <div className="text-red-600">Errors: {weaviateError || analyticsError}</div>
            )}
            {semanticInsights?.weaviateMetrics && (
              <div>Weaviate Metrics: {JSON.stringify(semanticInsights.weaviateMetrics, null, 2)}</div>
            )}
            {enhancedMetrics && (
              <div>Enhanced Metrics Keys: {Object.keys(enhancedMetrics ?? {}).join(", ")}</div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Helper: extract a hostname/domain from a raw domain string or full URL
function extractDomain(value: string): string | null {
  if (!value) return null;
  try {
    // If it already looks like a bare domain (no protocol), use it directly
    if (!/^https?:\/\//i.test(value)) {
      return value.replace(/^www\./, "").toLowerCase();
    }
    const url = new URL(value);
    return url.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}