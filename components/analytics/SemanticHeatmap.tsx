"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Network, Maximize2, Download, AlertCircle } from "lucide-react";

interface SemanticHeatmapProps {
  snapshots: Array<{
    queryId?: string;
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
    };
    // ADDED: Support for direct content anomalies structure
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
  semanticScore: number;
  coherence: number;
  hasAnomalies: boolean; // ADDED: Anomaly indicator
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

  /** Build per-query coherence map from semantic clusters.queryIds */
  const perQueryCoherence = useMemo(() => {
    const map = new Map<string, number>();
    const clusters = semanticAnalytics?.semanticInsights?.semanticClusters?.clusters || [];
    
    for (const cl of clusters) {
      if (!cl || typeof cl.coherence !== "number" || !Array.isArray(cl.queryIds)) continue;
      for (const qid of cl.queryIds) {
        const prev = map.get(qid);
        map.set(qid, typeof prev === "number" ? (prev + cl.coherence) / 2 : cl.coherence);
      }
    }
    return map;
  }, [semanticAnalytics]);

  /** ADDED: Anomaly detection per query */
  const queryAnomalies = useMemo(() => {
    const anomalyMap = new Map<string, boolean>();
    
    // From direct content anomalies
    if (semanticAnalytics?.contentAnomalies) {
      semanticAnalytics.contentAnomalies.forEach(anomaly => {
        anomalyMap.set(anomaly.queryId, true);
      });
    }

    return anomalyMap;
  }, [semanticAnalytics]);

  /** Aggregate heatmap data for each query */
  const heatmapData = useMemo<HeatmapData[]>(() => {
    if (!snapshots?.length || !queries?.length) return [];

    const dataMap = new Map<string, HeatmapData>();

    for (const snapshot of snapshots) {
      const qid = snapshot.queryId;
      if (!qid || !Array.isArray(snapshot.results)) continue;

      if (!dataMap.has(qid)) {
        const rowCoherence = perQueryCoherence.get(qid) ?? globalCoherence;
        dataMap.set(qid, {
          queryId: qid,
          queryName: queryNameById.get(qid) || "Unknown Query",
          domains: {},
          totalResults: 0,
          semanticScore: rowCoherence,
          coherence: rowCoherence,
          hasAnomalies: queryAnomalies.get(qid) || false,
        });
      }

      const row = dataMap.get(qid)!;
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
    }

    return Array.from(dataMap.values());
  }, [snapshots, queries, queryNameById, perQueryCoherence, globalCoherence, queryAnomalies]);

  /** ADDED: Filter data based on anomalies if needed */
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

  /** ADDED: Export functionality */
  const handleExport = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Query,Total Results,Semantic Score,Coherence,Has Anomalies,Top Domain,Domain Count\n";
    
    filteredHeatmapData.forEach(row => {
      const topDomain = Object.entries(row.domains).sort((a, b) => b[1] - a[1])[0];
      csvContent += `"${row.queryName}",${row.totalResults},${row.semanticScore.toFixed(2)},${row.coherence.toFixed(2)},${row.hasAnomalies},${topDomain?.[0] || 'N/A'},${topDomain?.[1] || 0}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `semantic_heatmap_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
              : "No data available. Capture snapshots to generate the domain heatmap."
            }
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

        {/* UPDATED: Enhanced Legend with controls */}
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
            
            {/* ADDED: Anomaly filter toggle */}
            {heatmapData.some(d => d.hasAnomalies) && (
              <Button 
                variant={showAnomaliesOnly ? "default" : "outline"} 
                size="sm" 
                onClick={() => setShowAnomaliesOnly(!showAnomaliesOnly)}
                className="text-xs"
              >
                <AlertCircle className="h-3 w-3 mr-1" />
                {showAnomaliesOnly ? 'Show All' : 'Anomalies Only'}
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
              <div className="w-20 p-2 text-xs text-center text-gray-600 border-r">Score</div>
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
                  <div className="text-sm font-medium">{Math.round(row.semanticScore * 100)}</div>
                  <div className="w-full bg-gray-200 rounded-full h-1 mt-1">
                    <div
                      className="bg-indigo-600 h-1 rounded-full transition-all"
                      style={{ width: `${Math.round(row.semanticScore * 100)}%` }}
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

        {/* ENHANCED: Selected query details */}
        {selectedQuery && (
          <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium text-blue-900">
                {filteredHeatmapData.find(d => d.queryId === selectedQuery)?.queryName}
              </h4>
              <Button variant="ghost" size="sm" onClick={() => setSelectedQuery(null)}>×</Button>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <strong>Total Results:</strong> {filteredHeatmapData.find(d => d.queryId === selectedQuery)?.totalResults}
              </div>
              <div>
                <strong>Semantic Score:</strong> {Math.round((filteredHeatmapData.find(d => d.queryId === selectedQuery)?.semanticScore || 0) * 100)}%
              </div>
              <div>
                <strong>Coherence:</strong> {Math.round((filteredHeatmapData.find(d => d.queryId === selectedQuery)?.coherence || 0) * 100)}%
              </div>
              <div>
                <strong>Has Anomalies:</strong> 
                <span className={`ml-1 ${filteredHeatmapData.find(d => d.queryId === selectedQuery)?.hasAnomalies ? 'text-red-600' : 'text-green-600'}`}>
                  {filteredHeatmapData.find(d => d.queryId === selectedQuery)?.hasAnomalies ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="col-span-2">
                <strong>Top Domain:</strong> {Object.entries(filteredHeatmapData.find(d => d.queryId === selectedQuery)?.domains || {}).sort((a,b) => b[1]-a[1])[0]?.[0] || "N/A"}
              </div>
            </div>
          </div>
        )}

        {/* ENHANCED: Global summary with anomaly info */}
        {semanticAnalytics && (
          <div className="mt-4 p-3 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Network className="h-4 w-4 text-indigo-600" />
              <span className="text-sm font-medium text-indigo-900">Semantic Analysis Active</span>
            </div>
            <div className="text-xs text-indigo-700 space-y-1">
              <div>Diversity Index: {semanticAnalytics.enhancedMetrics?.diversityIndex != null ? Math.round(semanticAnalytics.enhancedMetrics.diversityIndex * 100) : "N/A"}%</div>
              <div>Content Coherence: {semanticAnalytics.enhancedMetrics?.contentCoherence != null ? Math.round(semanticAnalytics.enhancedMetrics.contentCoherence * 100) : "N/A"}%</div>
              {semanticAnalytics.contentAnomalies && (
                <div className="text-red-700">
                  Content Anomalies: {semanticAnalytics.contentAnomalies.length} detected
                </div>
              )}
            </div>
          </div>
        )}

      </CardContent>
    </Card>
  );
}
