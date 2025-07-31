"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DriftTimeline } from "@/components/driftAnalyzer/drift-timeline";
import { DriftBadge } from "@/components/driftAnalyzer/drift-badge";
import { Loader2, AlertTriangle, ArrowLeft, Calendar, Activity, Clock, Zap, Hash } from "lucide-react";
import { useAuth } from "@/lib/contexts/auth-context";
import type { DriftAnalysisResult } from "@/lib/type";

export default function QueryDriftPage({ params }: { params: { queryid: string } }) {
  const router = useRouter();
  const { userId } = useAuth();
  const [driftResult, setDriftResult] = useState<DriftAnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleBack = () => {
    router.push("/drift");
  };

  useEffect(() => {
    if (!userId || !params.queryid) return;

    const fetchDriftData = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/drift/${params.queryid}`, {
          credentials: 'include'
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fetch drift data');
        }

        const data = await response.json();
        
        // ✅ FIXED: Ensure we have proper data structure
        if (data && typeof data === 'object') {
          setDriftResult(data);
        } else {
          throw new Error('Invalid response format');
        }
      } catch (err) {
        console.error('Failed to fetch drift data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load drift data');
      } finally {
        setLoading(false);
      }
    };

    fetchDriftData();
  }, [userId, params.queryid]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        <span className="ml-2">Loading drift analysis...</span>
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
              Enhanced drift analysis with content hash fingerprinting
            </p>
          </div>
        </div>

        <DriftBadge 
          driftScore={driftResult.latestDrift || 0} 
          trend={driftResult.driftTrend || 'stable'} 
          size="lg" 
        />
      </div>

      {/* Enhanced Summary Cards with null safety */}
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
              <Activity className="w-4 h-4" />
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

        {/* ✅ New Content Changes Card with null safety */}
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
            <p className="text-xs text-gray-500 mt-1">Content modifications detected</p>
          </CardContent>
        </Card>
      </div>

      {/* ✅ Performance Metrics Card with null safety */}
      <Card>
        <CardHeader>
          <CardTitle className="text-gray-900 flex items-center gap-2">
            <Zap className="w-5 h-5" />
            Performance Metrics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex items-center gap-3">
              <Clock className="w-4 h-4 text-gray-400" />
              <div>
                <p className="text-sm font-medium">Processing Time</p>
                <p className="text-lg font-bold">
                  {(driftResult.totalProcessingTime || 0).toFixed(0)}ms
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Zap className="w-4 h-4 text-green-500" />
              <div>
                <p className="text-sm font-medium">Cache Hit Rate</p>
                <p className="text-lg font-bold text-green-600">
                  {((driftResult.averageCacheHitRate || 0) * 100).toFixed(0)}%
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Activity className="w-4 h-4 text-blue-500" />
              <div>
                <p className="text-sm font-medium">Stability</p>
                <Badge variant={
                  driftResult.stability === 'stable' ? 'default' :
                  driftResult.stability === 'medium' ? 'secondary' : 'destructive'
                }>
                  {driftResult.stability || 'unknown'}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Timeline Visualization */}
      <DriftTimeline driftTimeline={driftResult.driftTimeline || []} />

      {/* Enhanced Analysis Insights */}
      <Card>
        <CardHeader>
          <CardTitle className="text-gray-900">Analysis Insights</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Content Analysis</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• {driftResult.totalContentChanges || 0} content modifications detected</li>
                <li>• Content hash fingerprinting for instant change detection</li>
                <li>• Semantic similarity analysis with AI embeddings</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Performance</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• {((driftResult.averageCacheHitRate || 0) * 100).toFixed(0)}% cache hit rate</li>
                <li>• {(driftResult.totalProcessingTime || 0).toFixed(0)}ms total processing time</li>
                <li>• Smart caching reduces computation by up to 80%</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
