"use client";

import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  BarChart3, 
  Brain, 
  Network, 
  Target, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle,
  Zap,
  Database,
  Activity,
  Sparkles,
  Clock
} from "lucide-react";

interface RevolutionaryStatsCardProps {
  analytics: any; // Traditional analytics data
  snapshots: any[]; // Snapshot data
  semanticAnalytics: any; // AI semantic analytics from Weaviate
  weaviateConnected: boolean; // Connection status
  enhancedMetrics?: { // Enhanced metrics from WeaviateAnalyticsService
    semanticStability?: number;
    contentCoherence?: number;
    diversityIndex?: number;
    anomalyCount?: number;
    clusterQuality?: number;
    vectorSpaceUtilization?: number;
  };
}

function normalizePercentage(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const percentage = value >= 0 && value <= 1 ? value * 100 : value;
  return Math.min(100, Math.max(0, percentage));
}

export function RevolutionaryStatsCard({
  analytics,
  snapshots,
  semanticAnalytics,
  weaviateConnected,
  enhancedMetrics,
}: RevolutionaryStatsCardProps) {
  
  // ENHANCED: Comprehensive data extraction
  const statsData = useMemo(() => {
    // Traditional analytics metrics
    const rankingStability = analytics?.rankingStability ?? 0;
    const volatilityIndex = analytics?.volatilityIndex ?? 0;
    const querySuccessRate = analytics?.querySuccessRate ?? 0;
    const avgResponseTime = analytics?.avgResponseTime ?? 0;
    
    // AI semantic metrics with fallbacks
    const semanticStability = normalizePercentage(
      enhancedMetrics?.semanticStability ??
      semanticAnalytics?.enhancedMetrics?.semanticStability ??
      null
    );

    const contentCoherence = normalizePercentage(
      enhancedMetrics?.contentCoherence ??
      semanticAnalytics?.enhancedMetrics?.contentCoherence ??
      null
    );
    const diversityIndex = normalizePercentage(
      enhancedMetrics?.diversityIndex ??
      semanticAnalytics?.enhancedMetrics?.diversityIndex ??
      null
    );
      
    const anomalyCount = 
      enhancedMetrics?.anomalyCount ?? 
      semanticAnalytics?.contentAnomalies?.length ?? 
      semanticAnalytics?.contentAnomalies?.count ?? 
      0;

    // Vector database metrics
    const totalVectors = semanticAnalytics?.weaviateMetrics?.totalVectors ?? 0;
    const avgSimilarity = semanticAnalytics?.weaviateMetrics?.avgSimilarity ?? 0;
    const clusterCount = semanticAnalytics?.weaviateMetrics?.clusterCount ?? 0;
    
    // Derived metrics
    const snapshotCount = snapshots?.length ?? 0;
    const dataFreshness = calculateDataFreshness(snapshots);
    const systemHealth = calculateSystemHealth(
      weaviateConnected, 
      rankingStability, 
      semanticStability, 
      snapshotCount
    );
    
    return {
      // Traditional metrics
      rankingStability,
      volatilityIndex,
      querySuccessRate,
      avgResponseTime,
      
      // AI metrics
      semanticStability,
      contentCoherence,
      diversityIndex,
      anomalyCount,
      
      // Vector DB metrics
      totalVectors,
      avgSimilarity,
      clusterCount,
      
      // System metrics
      snapshotCount,
      dataFreshness,
      systemHealth,
      weaviateConnected,
    };
  }, [analytics, semanticAnalytics, enhancedMetrics, snapshots, weaviateConnected]);

  // Helper functions
  function calculateDataFreshness(snapshots: any[]): number {
    if (!snapshots?.length) return 0;
    
    const now = Date.now();
    const recentSnapshots = snapshots.filter(s => {
      const snapshotTime = new Date(s.timestamp).getTime();
      return now - snapshotTime < 24 * 60 * 60 * 1000; // Last 24 hours
    });
    
    return Math.round((recentSnapshots.length / Math.max(snapshots.length, 1)) * 100);
  }

  function calculateSystemHealth(
    connected: boolean, 
    stability: number, 
    semantic: number | null, 
    snapshots: number
  ): number {
    let health = 0;
    
    // Connection health (30%)
    health += connected ? 30 : 0;
    
    // Data stability health (30%)
    health += Math.min(stability / 100 * 30, 30);
    
    // Semantic health (25%)
    if (semantic !== null) {
      health += Math.min(semantic / 100 * 25, 25);
    } else {
      health += 10; // Partial credit for traditional mode
    }
    
    // Data volume health (15%)
    health += Math.min((snapshots / 100) * 15, 15);
    
    return Math.round(health);
  }

  function getHealthColor(health: number): string {
    if (health >= 80) return "text-green-600";
    if (health >= 60) return "text-yellow-600";
    return "text-red-600";
  }

  function getHealthBadgeColor(health: number): string {
    if (health >= 80) return "bg-green-100 text-green-700 border-green-200";
    if (health >= 60) return "bg-yellow-100 text-yellow-700 border-yellow-200";
    return "bg-red-100 text-red-700 border-red-200";
  }

  return (
    <div className="space-y-6">
      {/* ADDED: System Health Overview */}
      <Card className="relative overflow-hidden border-l-4 border-l-blue-500">
        <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-blue-500/10 to-transparent rounded-bl-full" />
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-lg">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-blue-600" />
              System Health
            </div>
            <Badge className={`border ${getHealthBadgeColor(statsData.systemHealth)}`}>
              {statsData.systemHealth >= 80 ? "Excellent" : 
               statsData.systemHealth >= 60 ? "Good" : "Needs Attention"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Overall Health Score</span>
              <span className={`text-2xl font-bold ${getHealthColor(statsData.systemHealth)}`}>
                {statsData.systemHealth}%
              </span>
            </div>
            <Progress value={statsData.systemHealth} className="h-2" />
            <div className="grid grid-cols-2 gap-4 text-xs text-gray-500">
              <div>Vector DB: {weaviateConnected ? "Connected" : "Disconnected"}</div>
              <div>Data Points: {statsData.snapshotCount}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        
        {/* Ranking Stability - Enhanced */}
        <Card className="relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-blue-500/10 to-transparent rounded-bl-full" />
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <BarChart3 className="h-8 w-8 text-blue-600" />
              <Badge variant="secondary">Stability</Badge>
            </div>
            <div className="space-y-2">
              <div className="text-2xl font-bold text-blue-600">
                {statsData.rankingStability.toFixed(1)}%
              </div>
              <p className="text-xs text-gray-500">Ranking Stability</p>
              {statsData.volatilityIndex > 0 && (
                <div className="flex items-center gap-1">
                  {statsData.volatilityIndex > 50 ? (
                    <TrendingDown className="h-3 w-3 text-red-500" />
                  ) : (
                    <TrendingUp className="h-3 w-3 text-green-500" />
                  )}
                  <span className="text-xs text-gray-400">
                    Volatility: {statsData.volatilityIndex.toFixed(1)}
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* AI Confidence Score - Enhanced */}
        <Card className="relative overflow-hidden border-l-4 border-l-purple-500">
          <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-purple-500/10 to-transparent rounded-bl-full" />
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <Brain className="h-8 w-8 text-purple-600" />
              <Badge variant="secondary" className="bg-purple-100 text-purple-700">
                AI Confidence
              </Badge>
            </div>
            <div className="space-y-2">
              <div className="text-2xl font-bold text-purple-600">
                {statsData.semanticStability !== null
                  ? `${Math.round(statsData.semanticStability)}%`
                  : "N/A"}
              </div>
              <p className="text-xs text-gray-500">
                {statsData.semanticStability !== null ? "Semantic Stability" : "Traditional Mode"}
              </p>
              {statsData.anomalyCount > 0 && (
                <div className="flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 text-orange-500" />
                  <span className="text-xs text-orange-600">
                    {statsData.anomalyCount} anomalies
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Content Coherence - Enhanced */}
        <Card className="relative overflow-hidden border-l-4 border-l-indigo-500">
          <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-indigo-500/10 to-transparent rounded-bl-full" />
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <Network className="h-8 w-8 text-indigo-600" />
              <Badge variant="secondary" className="bg-indigo-100 text-indigo-700">
                Coherence
              </Badge>
            </div>
            <div className="space-y-2">
              <div className="text-2xl font-bold text-indigo-600">
                {statsData.contentCoherence !== null
                  ? `${Math.round(statsData.contentCoherence)}%`
                  : "N/A"}
              </div>
              <p className="text-xs text-gray-500">Content Coherence</p>
              {statsData.diversityIndex !== null && (
                <div className="flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-indigo-400" />
                  <span className="text-xs text-indigo-600">
                    Diversity: {statsData.diversityIndex.toFixed(0)}%
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Vector Database Status - Enhanced */}
        <Card
          className={`relative overflow-hidden border-l-4 ${
            statsData.weaviateConnected ? "border-l-green-500" : "border-l-gray-500"
          }`}
        >
          <div
            className={`absolute top-0 right-0 w-16 h-16 rounded-bl-full bg-gradient-to-br ${
              statsData.weaviateConnected ? "from-green-500/10" : "from-gray-500/10"
            } to-transparent`}
          />
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <Database
                className={`h-8 w-8 ${
                  statsData.weaviateConnected ? "text-green-600" : "text-gray-600"
                }`}
              />
              <Badge
                variant="secondary"
                className={
                  statsData.weaviateConnected
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-700"
                }
              >
                Vector DB
              </Badge>
            </div>
            <div className="space-y-2">
              <div
                className={`text-2xl font-bold ${
                  statsData.weaviateConnected ? "text-green-600" : "text-gray-600"
                }`}
              >
                {statsData.weaviateConnected ? "LIVE" : "OFF"}
              </div>
              <p className="text-xs text-gray-500">Semantic Engine</p>
              {statsData.weaviateConnected && statsData.totalVectors > 0 && (
                <div className="flex items-center gap-1">
                  <Zap className="h-3 w-3 text-green-400" />
                  <span className="text-xs text-green-600">
                    {statsData.totalVectors.toLocaleString()} vectors
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ADDED: Secondary Metrics Row */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
        
        {/* Query Success Rate */}
        <Card className="text-center">
          <CardContent className="pt-4 pb-4">
            <Target className="h-6 w-6 mx-auto mb-2 text-green-600" />
            <div className="text-lg font-bold text-green-600">
              {statsData.querySuccessRate.toFixed(1)}%
            </div>
            <p className="text-xs text-gray-500">Success Rate</p>
          </CardContent>
        </Card>

        {/* Response Time */}
        <Card className="text-center">
          <CardContent className="pt-4 pb-4">
            <Clock className="h-6 w-6 mx-auto mb-2 text-blue-600" />
            <div className="text-lg font-bold text-blue-600">
              {typeof statsData.avgResponseTime === 'number' 
                ? `${statsData.avgResponseTime}ms`
                : statsData.avgResponseTime || "N/A"}
            </div>
            <p className="text-xs text-gray-500">Avg Response</p>
          </CardContent>
        </Card>

        {/* Data Freshness */}
        <Card className="text-center">
          <CardContent className="pt-4 pb-4">
            <Activity className="h-6 w-6 mx-auto mb-2 text-purple-600" />
            <div className="text-lg font-bold text-purple-600">
              {statsData.dataFreshness}%
            </div>
            <p className="text-xs text-gray-500">Data Freshness</p>
          </CardContent>
        </Card>

        {/* Cluster Count (AI Mode) */}
        {statsData.weaviateConnected && (
          <Card className="text-center">
            <CardContent className="pt-4 pb-4">
              <Network className="h-6 w-6 mx-auto mb-2 text-indigo-600" />
              <div className="text-lg font-bold text-indigo-600">
                {statsData.clusterCount}
              </div>
              <p className="text-xs text-gray-500">Semantic Clusters</p>
            </CardContent>
          </Card>
        )}

        {/* Snapshot Count */}
        <Card className="text-center">
          <CardContent className="pt-4 pb-4">
            <BarChart3 className="h-6 w-6 mx-auto mb-2 text-gray-600" />
            <div className="text-lg font-bold text-gray-600">
              {statsData.snapshotCount.toLocaleString()}
            </div>
            <p className="text-xs text-gray-500">Data Points</p>
          </CardContent>
        </Card>
      </div>

      {/* ADDED: Performance Indicators */}
      {(statsData.anomalyCount > 0 || statsData.systemHealth < 70) && (
        <Card className="border border-orange-200 bg-orange-50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
              <span className="font-medium text-orange-800">Performance Alerts</span>
            </div>
            <div className="space-y-1 text-sm text-orange-700">
              {statsData.systemHealth < 70 && (
                <p>• System health is below optimal (70%). Consider refreshing data or checking connections.</p>
              )}
              {statsData.anomalyCount > 0 && (
                <p>• {statsData.anomalyCount} content anomalies detected. Review AI insights for details.</p>
              )}
              {!statsData.weaviateConnected && (
                <p>• Vector database is offline. Switch to AI mode for enhanced analytics.</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
