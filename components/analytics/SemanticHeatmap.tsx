"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Network, Maximize2, Download, AlertCircle } from "lucide-react";

interface SemanticHeatmapProps {
  snapshots: Array<{
    queryId?: string;
    timestamp?: string | Date;
    results: Array<{ url: string; position?: number }>;
  }>;
  queries: Array<{ id: string; name: string }>;
  semanticAnalytics?: {
    enhancedMetrics?: {
      diversityIndex?: number;
      contentCoherence?: number;
    };
    semanticInsights?: {
      semanticClusters?: {
        clusters?: Array<{
          theme: string;
          size: number;
          coherence: number;
          items?: Array<any>;
          queryIds?: string[];
        }>;
      };
      // ✅ Matches the actual shape returned by WeaviateAnalyticsService —
      //    contentAnomalies is an OBJECT with a nested .anomalies array,
      //    not a flat array. The old code checked semanticAnalytics
      //    .contentAnomalies directly (wrong path + wrong shape), so it
      //    never found anomalies that the API actually returns.
      contentAnomalies?: {
        count?: number;
        anomalies?: Array<{ queryId: string; anomalyScore: number }>;
      };
    };
    // Kept for backward-compat with any caller still passing this flat
    // shape directly — checked as a fallback, not the primary path.
    contentAnomalies?: Array<{
      queryId: string;
      anomalyScore: number;
    }>;
  };
}

interface HeatmapData {
  queryId: string;
  queryName: string;
  domains: Record<string, number>;
  totalResults: number;
  coherence: number;       // ✅ single source of truth — semanticScore removed
  hasAnomalies: boolean;
}

// CSV field escaping — wraps in quotes and doubles internal quotes if the
// value contains a comma, quote, or newline.
function csvEscape(value: unknown): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function SemanticHeatmap({
  snapshots,
  queries,
  semanticAnalytics,
}: SemanticHeatmapProps) {
  const [selectedQuery, setSelectedQuery] = useState<string | null>(null);
  const [showAnomaliesOnly, setShowAnomaliesOnly] = useState(false);

  /** Map queryId -> queryName */
  const queryNameById = useMemo(() => {
    const m = new Map<string, string>();
    (queries || []).forEach(q => m.set(q.id, q.name));
    return m;
  }, [queries]);

  /** Global coherence fallback value */
  const globalCoherence =
    typeof semanticAnalytics?.enhancedMetrics?.contentCoherence === "number"
      ? semanticAnalytics.enhancedMetrics.contentCoherence
      : 0;

  /**
   *  FIXED: true average per query, not a recency-weighted running
   * average. Old code did `(prev + cl.coherence) / 2` repeatedly, which
   * over-weights later clusters and under-weights earlier ones — e.g.
   * three values [0.9, 0.5, 0.1] resolved to 0.4 instead of the true
   * mean 0.5, with the result depending on cluster iteration order.
   */
  const perQueryCoherence = useMemo(() => {
    const sums   = new Map<string, number>();
    const counts = new Map<string, number>();
    const clusters = semanticAnalytics?.semanticInsights?.semanticClusters?.clusters || [];

    for (const cl of clusters) {
      if (!cl || typeof cl.coherence !== "number" || !Array.isArray(cl.queryIds)) continue;
      for (const qid of cl.queryIds) {
        sums.set(qid, (sums.get(qid) ?? 0) + cl.coherence);
        counts.set(qid, (counts.get(qid) ?? 0) + 1);
      }
    }

    const result = new Map<string, number>();
    for (const [qid, sum] of sums) {
      result.set(qid, sum / (counts.get(qid) ?? 1));
    }
    return result;
  }, [semanticAnalytics]);

  /**
   * ✅ FIXED: checks the correct path/shape matching what
   * WeaviateAnalyticsService actually returns (semanticInsights
   * .contentAnomalies.anomalies[]), with the old flat-array shape kept
   * as a fallback for any caller still using it. Previously this only
   * checked semanticAnalytics.contentAnomalies directly, which the real
   * API response never populates — anomaly highlighting silently never
   * worked.
   */
  const queryAnomalies = useMemo(() => {
    const anomalyMap = new Map<string, boolean>();

    const nested = semanticAnalytics?.semanticInsights?.contentAnomalies?.anomalies;
    if (Array.isArray(nested)) {
      for (const a of nested) {
        if (a?.queryId) anomalyMap.set(a.queryId, true);
      }
    }

    const flat = semanticAnalytics?.contentAnomalies;
    if (Array.isArray(flat)) {
      for (const a of flat) {
        if (a?.queryId) anomalyMap.set(a.queryId, true);
      }
    }

    return anomalyMap;
  }, [semanticAnalytics]);

  /**
   * Aggregate heatmap data for each query.
   *
   * ✅ FIXED: only the LATEST snapshot per query is used for domain
   * counts. Previously, domain counts accumulated across EVERY snapshot
   * for a query — so a domain appearing in 5 historical snapshots showed
   * count=5, inflating its apparent dominance purely because the query
   * had been tracked longer, not because that domain genuinely holds
   * more positions in the current SERP.
   */
  const heatmapData = useMemo<HeatmapData[]>(() => {
    if (!snapshots?.length || !queries?.length) return [];

    // Find the latest snapshot per query first
    const latestByQuery = new Map<string, typeof snapshots[number]>();
    for (const snapshot of snapshots) {
      const qid = snapshot.queryId;
      if (!qid || !Array.isArray(snapshot.results)) continue;

      const existing = latestByQuery.get(qid);
      const snapTime  = snapshot.timestamp ? new Date(snapshot.timestamp).getTime() : 0;
      const existTime = existing?.timestamp ? new Date(existing.timestamp).getTime() : -1;

      if (!existing || snapTime > existTime) {
        latestByQuery.set(qid, snapshot);
      }
    }

    const dataMap = new Map<string, HeatmapData>();

    for (const [qid, snapshot] of latestByQuery) {
      const rowCoherence = perQueryCoherence.get(qid) ?? globalCoherence;
      const row: HeatmapData = {
        queryId:      qid,
        queryName:    queryNameById.get(qid) || "Unknown Query",
        domains:      {},
        totalResults: 0,
        coherence:    rowCoherence,
        hasAnomalies: queryAnomalies.get(qid) || false,
      };

      for (const r of snapshot.results) {
        if (!r?.url) continue;
        try {
          const domain = new URL(r.url).hostname.replace(/^www\./, "");
          row.domains[domain] = (row.domains[domain] || 0) + 1;
          row.totalResults++;
        } catch {
          // Ignore invalid URLs
        }
      }

      dataMap.set(qid, row);
    }

    return Array.from(dataMap.values());
  }, [snapshots, queries, queryNameById, perQueryCoherence, globalCoherence, queryAnomalies]);

  /** Filter data based on anomalies if needed */
  const filteredHeatmapData = useMemo(() => {
    if (!showAnomaliesOnly) return heatmapData;
    return heatmapData.filter(data => data.hasAnomalies);
  }, [heatmapData, showAnomaliesOnly]);

  /** Top N domains for columns */
  const topDomains = useMemo(() => {
    const domainCounts = new Map<string, number>();
    for (const row of filteredHeatmapData) {
      for (const [domain, count] of Object.entries(row.domains)) {
        domainCounts.set(domain, (domainCounts.get(domain) || 0) + count);
      }
    }
    return Array.from(domainCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([domain]) => domain);
  }, [filteredHeatmapData]);

  /** Domain count scaling */
  const allCounts = filteredHeatmapData.flatMap(d => Object.values(d.domains));
  const maxCount = allCounts.length ? Math.max(...allCounts) : 0;

  const getIntensityClass = (count: number) => {
    if (maxCount === 0 || count === 0) return "bg-gray-50";
    const intensity = count / maxCount;
    if (intensity >= 0.8) return "bg-blue-600";
    if (intensity >= 0.6) return "bg-blue-500";
    if (intensity >= 0.4) return "bg-blue-400";
    if (intensity >= 0.2) return "bg-blue-300";
    return "bg-blue-200";
  };

  const getTextClass = (count: number) => {
    if (maxCount === 0 || count === 0) return "text-gray-400";
    const intensity = count / maxCount;
    return intensity >= 0.4 ? "text-white" : "text-gray-700";
  };

  /** ✅ Export — Blob-based, escaped fields, no encodeURI size limits */
  const handleExport = () => {
    const headers = ["Query", "Total Results", "Coherence", "Has Anomalies", "Top Domain", "Domain Count"]
      .join(",") + "\n";

    const rows = filteredHeatmapData.map(row => {
      const topDomain = Object.entries(row.domains).sort((a, b) => b[1] - a[1])[0];
      return [
        row.queryName,
        row.totalResults,
        row.coherence.toFixed(2),
        row.hasAnomalies,
        topDomain?.[0] ?? "N/A",
        topDomain?.[1] ?? 0,
      ].map(csvEscape).join(",");
    }).join("\n");

    const blob = new Blob([headers + rows], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `semantic_heatmap_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  /** No-data state */
  if (!filteredHeatmapData.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Network className="h-5 w-5 text-indigo-600" />
            Semantic Domain Heatmap
            {showAnomaliesOnly && (
              <Badge variant="destructive" className="text-xs">
                <AlertCircle className="h-3 w-3 mr-1" />
                Anomalies Only
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500">
            {showAnomaliesOnly
              ? "No anomalies detected in the current dataset."
              : "No data available. Capture snapshots to generate the domain heatmap."}
            {showAnomaliesOnly && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => setShowAnomaliesOnly(false)}
              >
                Show All Data
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Network className="h-5 w-5 text-indigo-600" />
          Semantic Domain Heatmap
          <Badge variant="secondary" className="ml-auto bg-indigo-100 text-indigo-700">
            {filteredHeatmapData.length} queries × {topDomains.length} domains
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>

        {/* Legend with controls */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Semantic Coherence:</span>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-blue-200 rounded" /><span className="text-xs">Low</span>
                <div className="w-3 h-3 bg-blue-400 rounded" /><span className="text-xs">Med</span>
                <div className="w-3 h-3 bg-blue-600 rounded" /><span className="text-xs">High</span>
              </div>
            </div>

            {heatmapData.some(d => d.hasAnomalies) && (
              <Button
                variant={showAnomaliesOnly ? "default" : "outline"}
                size="sm"
                onClick={() => setShowAnomaliesOnly(!showAnomaliesOnly)}
                className="text-xs"
              >
                <AlertCircle className="h-3 w-3 mr-1" />
                {showAnomaliesOnly ? "Show All" : "Anomalies Only"}
              </Button>
            )}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />Export
            </Button>
            <Button variant="outline" size="sm">
              <Maximize2 className="h-4 w-4 mr-2" />Expand
            </Button>
          </div>
        </div>

        {/* Table Matrix */}
        <div className="overflow-x-auto">
          <div className="min-w-fit">
            {/* Header row */}
            <div className="flex mb-1">
              <div className="w-48 p-2 text-sm font-medium text-gray-700 border-r">Query</div>
              {/* ✅ Renamed from "Score" — this column shows coherence,
                  the only metric this component tracks (semanticScore
                  was a duplicate of the same number under a different name) */}
              <div className="w-20 p-2 text-xs text-center text-gray-600 border-r">Coherence</div>
              {topDomains.map(domain => (
                <div
                  key={domain}
                  className="w-16 p-2 text-xs text-center text-gray-600 transform -rotate-45 origin-bottom-left h-16 flex items-end justify-center"
                  title={domain}
                >
                  <span className="truncate max-w-12">{domain.split(".")[0]}</span>
                </div>
              ))}
            </div>

            {/* Rows */}
            {filteredHeatmapData.map(row => (
              <div
                key={row.queryId}
                className={`flex border-b hover:bg-gray-50 ${
                  selectedQuery === row.queryId ? "bg-blue-50 border-blue-200" : ""
                } ${row.hasAnomalies ? "border-l-2 border-l-red-400" : ""}`}
                onClick={() =>
                  setSelectedQuery(selectedQuery === row.queryId ? null : row.queryId)
                }
              >
                <div className="w-48 p-2 text-sm border-r cursor-pointer">
                  <div className="font-medium text-gray-900 truncate flex items-center gap-2" title={row.queryName}>
                    {row.queryName}
                    {row.hasAnomalies && (
                      <AlertCircle className="h-3 w-3 text-red-500 flex-shrink-0" />
                    )}
                  </div>
                  <div className="text-xs text-gray-500">{row.totalResults} results</div>
                </div>

                <div className="w-20 p-2 text-center border-r">
                  <div className="text-sm font-medium">{Math.round(row.coherence * 100)}</div>
                  <div className="w-full bg-gray-200 rounded-full h-1 mt-1">
                    <div
                      className="bg-indigo-600 h-1 rounded-full transition-all"
                      style={{ width: `${Math.round(row.coherence * 100)}%` }}
                    />
                  </div>
                </div>

                {topDomains.map(domain => {
                  const count = row.domains[domain] || 0;
                  return (
                    <div
                      key={domain}
                      className={`w-16 h-12 flex items-center justify-center text-xs font-medium ${getIntensityClass(count)} ${getTextClass(count)}`}
                      title={`${domain}: ${count}`}
                    >
                      {count > 0 ? count : ""}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Selected query details */}
        {selectedQuery && (() => {
          const sel = filteredHeatmapData.find(d => d.queryId === selectedQuery);
          if (!sel) return null;
          const topDomainEntry = Object.entries(sel.domains).sort((a, b) => b[1] - a[1])[0];

          return (
            <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-blue-900">{sel.queryName}</h4>
                <Button variant="ghost" size="sm" onClick={() => setSelectedQuery(null)}>×</Button>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><strong>Total Results:</strong> {sel.totalResults}</div>
                <div><strong>Coherence:</strong> {Math.round(sel.coherence * 100)}%</div>
                <div className="col-span-2">
                  <strong>Has Anomalies:</strong>{" "}
                  <span className={sel.hasAnomalies ? "text-red-600" : "text-green-600"}>
                    {sel.hasAnomalies ? "Yes" : "No"}
                  </span>
                </div>
                <div className="col-span-2">
                  <strong>Top Domain:</strong> {topDomainEntry?.[0] || "N/A"}
                  {topDomainEntry && ` (${topDomainEntry[1]} results)`}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Global summary */}
        {semanticAnalytics && (
          <div className="mt-4 p-3 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Network className="h-4 w-4 text-indigo-600" />
              <span className="text-sm font-medium text-indigo-900">Semantic Analysis Active</span>
            </div>
            <div className="text-xs text-indigo-700 space-y-1">
              <div>
                Diversity Index:{" "}
                {semanticAnalytics.enhancedMetrics?.diversityIndex != null
                  ? Math.round(semanticAnalytics.enhancedMetrics.diversityIndex)
                  : "N/A"}%
              </div>
              <div>
                Content Coherence:{" "}
                {semanticAnalytics.enhancedMetrics?.contentCoherence != null
                  ? Math.round(semanticAnalytics.enhancedMetrics.contentCoherence)
                  : "N/A"}%
              </div>
              {(semanticAnalytics.semanticInsights?.contentAnomalies?.count ?? 0) > 0 && (
                <div className="text-red-700">
                  Content Anomalies: {semanticAnalytics.semanticInsights!.contentAnomalies!.count} detected
                </div>
              )}
            </div>
          </div>
        )}

      </CardContent>
    </Card>
  );
}