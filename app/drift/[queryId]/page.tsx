// app/drift/[queryid]/page.tsx
"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DriftTimeline } from "@/components/driftAnalyzer/drift-timeline";
import { DriftBadge } from "@/components/driftAnalyzer/drift-badge";
import { Loader2, AlertTriangle, ArrowLeft, Calendar, Activity } from "lucide-react";
import { useDrift } from "@/app/logic/use-drift"; // Updated import (new hook file)

export default function QueryDriftPage({ params }: { params: { queryid: string } }) {
  const router = useRouter();
  const { driftResult, loading, error } = useDrift(params.queryid); // Fixed: pass queryid to hook

  const handleBack = () => {
    router.push("/drift");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
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
            <p className="text-gray-600 mt-1">Drift analysis for query "{driftResult.queryName}"</p>
          </div>
        </div>

        <DriftBadge driftScore={driftResult.latestDrift} trend={driftResult.driftTrend} size="lg" />
      </div>

      {/* Summary Cards */}
      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Latest Drift Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{driftResult.latestDrift.toFixed(1)}</div>
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
            <div className="text-2xl font-bold">{driftResult.averageDrift.toFixed(1)}</div>
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
            <div className="text-2xl font-bold">{driftResult.driftTimeline.length + 1}</div>
            <p className="text-xs text-gray-500 mt-1">Total snapshots in analysis</p>
          </CardContent>
        </Card>
      </div>

      {/* Timeline Visualization */}
      <DriftTimeline driftTimeline={driftResult.driftTimeline} />
    </div>
  );
}
