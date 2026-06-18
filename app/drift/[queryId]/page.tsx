// app/drift/[queryId]/page.tsx
"use client";

import { useRouter } from "next/navigation";
import React, { use, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DriftTimeline } from "@/components/driftAnalyzer/drift-timeline";
import { DriftBadge } from "@/components/driftAnalyzer/drift-badge";
import { 
  Loader2, 
  AlertTriangle, 
  ArrowLeft, 
  Calendar, 
  Activity, 
  Clock, 
  Zap, 
  Hash,
  BarChart3,
  Gauge
} from "lucide-react";
import { useAuth } from "@/lib/middleware/authentication/auth-context";
import { useSecureApi } from '@/lib/api/use-secureApi'
import type { DriftAnalysisResult } from "@/types/type";

// ✅ Enhanced interface for drift result with performance metrics
interface EnhancedDriftResult extends DriftAnalysisResult {
  totalContentChanges: number;
  averageCacheHitRate: number;  
  totalProcessingTime: number;
}

export default function QueryDriftPage({ params }: { params: Promise<{ queryid: string }> }) {
  const { queryid } = use(params);

  const router = useRouter();
  const { userId } = useAuth();
  const [driftResult, setDriftResult] = useState<EnhancedDriftResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleBack = () => router.push("/drift");

  const { call: secureCall } = useSecureApi({ showErrorToast: true });
console.log("secureCall changed");
  useEffect(() => {
    if (!userId || !queryid) return;
  console.log("Fetching drift data");

    const fetchDriftData = async () => {

      try {
        setLoading(true);
        setError(null);

        console.log("Fetching enhanced drift data for queryId:", queryid);
        const data = await secureCall<EnhancedDriftResult>("GET", `/drift/${queryid}`);

        if (data && typeof data === "object") {
          setDriftResult(data);
        } else {
          throw new Error("Invalid response format");
        }
      } catch (err) {
        console.error("Failed to fetch drift data:", err);
        setError(err instanceof Error ? err.message : "Failed to load drift data");
      } finally {
        setLoading(false);
      }
    };

    fetchDriftData();
  }, [userId, queryid]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        <span className="ml-2">Loading enhanced drift analysis...</span>
      </div>
    );
  }

  if (error || !driftResult) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={handleBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back to Drift Radar
        </Button>

        <Card>
          <CardContent className="p-12 flex flex-col items-center justify-center">
            <AlertTriangle className="h-12 w-12 text-red-500 mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Error</h2>
            <p className="text-gray-600">{error || "Failed to load drift data"}</p>
            <Button 
              onClick={() => window.location.reload()} 
              variant="outline" 
              className="mt-4"
            >
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={handleBack} size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">{driftResult.queryName}</h1>
            <p className="text-gray-600 mt-1">
              Enhanced drift analysis with content hash fingerprinting and performance optimization
            </p>
          </div>
        </div>

        <DriftBadge 
          driftScore={driftResult.latestDrift || 0} 
          trend={driftResult.driftTrend || 'stable'} 
          size="lg" 
        />
      </div>

      {/* ✅ Enhanced Summary Cards with performance metrics */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Latest Drift Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(driftResult.latestDrift || 0).toFixed(1)}</div>
            <p className="text-xs text-gray-500 mt-1">Most recent snapshot comparison</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Average Drift
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(driftResult.averageDrift || 0).toFixed(1)}</div>
            <p className="text-xs text-gray-500 mt-1">Mean drift across all snapshots</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Snapshots Analyzed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(driftResult.driftTimeline?.length || 0) + 1}
            </div>
            <p className="text-xs text-gray-500 mt-1">Total snapshots in analysis</p>
          </CardContent>
        </Card>

        {/* ✅ Enhanced Content Changes Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <Hash className="w-4 h-4" />
              Content Changes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {driftResult.totalContentChanges || 0}
            </div>
            <p className="text-xs text-gray-500 mt-1">Hash-detected modifications</p>
          </CardContent>
        </Card>
      </div>

      {/* ✅ Enhanced Performance Metrics Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-gray-900 flex items-center gap-2">
            <Gauge className="w-5 h-5" />
            Performance & Optimization Metrics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-blue-50">
                <Clock className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Total Processing Time</p>
                <p className="text-2xl font-bold text-blue-600">
                  {(driftResult.totalProcessingTime || 0).toFixed(0)}ms
                </p>
                <p className="text-xs text-gray-500">Entire analysis duration</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-green-50">
                <Zap className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Cache Hit Rate</p>
                <p className="text-2xl font-bold text-green-600">
                  {((driftResult.averageCacheHitRate || 0) * 100).toFixed(1)}%
                </p>
                <p className="text-xs text-gray-500">Embedding cache efficiency</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-purple-50">
                <Activity className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Stability Level</p>
                <Badge 
                  variant={
                    driftResult.stability === 'stable' ? 'default' :
                    driftResult.stability === 'medium' ? 'secondary' : 'destructive'
                  }
                  className="text-lg px-3 py-1"
                >
                  {driftResult.stability || 'unknown'}
                </Badge>
                <p className="text-xs text-gray-500 mt-1">Overall query stability</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-amber-50">
                <Hash className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Content Efficiency</p>
                <p className="text-2xl font-bold text-amber-600">
                  {driftResult.totalContentChanges === 0 ? '100%' : 
                   `${(((driftResult.driftTimeline?.length || 0) - (driftResult.totalContentChanges || 0)) / 
                     (driftResult.driftTimeline?.length || 1) * 100).toFixed(0)}%`}
                </p>
                <p className="text-xs text-gray-500">Unchanged content ratio</p>
              </div>
            </div>
          </div>

          {/* ✅ Performance Optimization Indicators */}
          <div className="mt-6 p-4 bg-gradient-to-r from-green-50 to-blue-50 rounded-lg border border-green-200">
            <h4 className="font-medium text-green-900 mb-2">Optimization Benefits</h4>
            <div className="grid gap-2 md:grid-cols-2 text-sm">
              <div className="flex items-center gap-2 text-green-700">
                <Zap className="w-4 h-4" />
                <span>Content hash optimization: {driftResult.totalContentChanges === 0 ? 'Maximum' : 'Partial'} speed boost</span>
              </div>
              <div className="flex items-center gap-2 text-blue-700">
                <Clock className="w-4 h-4" />
                <span>Processing time: {(driftResult.totalProcessingTime || 0) < 1000 ? 'Excellent' : 'Good'} performance</span>
              </div>
              <div className="flex items-center gap-2 text-purple-700">
                <Gauge className="w-4 h-4" />
                <span>Cache efficiency: {((driftResult.averageCacheHitRate || 0) * 100) > 70 ? 'High' : 'Building'} hit rate</span>
              </div>
              <div className="flex items-center gap-2 text-amber-700">
                <Hash className="w-4 h-4" />
                <span>Content stability: {driftResult.totalContentChanges || 0} hash changes detected</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Timeline Visualization - Enhanced */}
      <Card>
        <CardHeader>
          <CardTitle className="text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Drift Timeline with Performance Data
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DriftTimeline driftTimeline={driftResult.driftTimeline || []} />
          {driftResult.driftTimeline && driftResult.driftTimeline.length > 0 && (
            <div className="mt-4 p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
              <p><strong>Timeline Analysis:</strong> {driftResult.driftTimeline.length} drift comparisons completed. 
              Content changes detected in {driftResult.totalContentChanges || 0} snapshots. 
              Average cache hit rate: {((driftResult.averageCacheHitRate || 0) * 100).toFixed(1)}%</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ✅ Enhanced Analysis Insights */}
      <Card>
        <CardHeader>
          <CardTitle className="text-gray-900">Enhanced Analysis Insights</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                <Hash className="w-4 h-4" />
                Content Analysis
              </h4>
              <ul className="text-sm text-gray-600 space-y-2">
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                  {driftResult.totalContentChanges || 0} content modifications detected via SHA-256 hashing
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  Content hash fingerprinting for instant change detection
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
                  Semantic similarity analysis with AI embeddings and caching
                </li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                <Gauge className="w-4 h-4" />
                Performance Optimization
              </h4>
              <ul className="text-sm text-gray-600 space-y-2">
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  {((driftResult.averageCacheHitRate || 0) * 100).toFixed(0)}% embedding cache hit rate
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                  {(driftResult.totalProcessingTime || 0).toFixed(0)}ms total processing time
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
                  Smart caching reduces computation by up to 80% for unchanged content
                </li>
              </ul>
            </div>
          </div>

          {/* ✅ Technical Performance Details */}
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <h4 className="font-medium text-gray-900 mb-2">Technical Performance Details</h4>
            <div className="grid gap-4 md:grid-cols-3 text-sm">
              <div>
                <p className="font-medium text-gray-700">Content Hash Optimization</p>
                <p className="text-gray-600">
                  {driftResult.totalContentChanges === 0 
                    ? 'All content remained identical - maximum speed optimization applied'
                    : `${driftResult.totalContentChanges} content changes detected - partial optimization applied`
                  }
                </p>
              </div>
              <div>
                <p className="font-medium text-gray-700">Embedding Cache Performance</p>
                <p className="text-gray-600">
                  {((driftResult.averageCacheHitRate || 0) * 100) > 70 
                    ? 'High cache efficiency - excellent performance'
                    : 'Building cache efficiency - performance improving over time'
                  }
                </p>
              </div>
              <div>
                <p className="font-medium text-gray-700">Processing Efficiency</p>
                <p className="text-gray-600">
                  {(driftResult.totalProcessingTime || 0) < 500 
                    ? 'Excellent processing speed achieved'
                    : (driftResult.totalProcessingTime || 0) < 2000
                    ? 'Good processing performance'
                    : 'Standard processing time - consider optimization'
                  }
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
