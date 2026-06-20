"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Pause, RotateCcw, Download, TrendingUp, TrendingDown, Target } from "lucide-react";

type TSnapResult = {
  url: string;
  position: number;
  title?: string;
  domain?: string;
};

type TSnap = {
  timestamp: string | Date;
  results: TSnapResult[];
  queryId?: string;
};

type JourneyStep = {
  url: string;
  title: string;
  domain: string;
  position: number;
  changes: number;
  timestamp: Date;
  step: number;
};

type JourneyData = {
  url: string;
  domain: string;
  title: string;
  journey: JourneyStep[];
  totalMovement: number;
  finalPosition: number;
  trend: "up" | "down" | "stable";
  volatility: number;
};

// Trend classification threshold — position change beyond this many ranks
// (in either direction) counts as "up"/"down" rather than "stable".
const TREND_THRESHOLD = 2;

function toDate(ts: string | Date): Date {
  return ts instanceof Date ? ts : new Date(ts);
}

function posToY(position: number, pxPerRank: number, topPadding: number) {
  return topPadding + (position - 1) * pxPerRank;
}

// Safe hostname extraction — never throws. A single malformed URL in
// result.url previously crashed the entire useMemo (no try/catch here,
// unlike SemanticHeatmap which does guard this), taking down the whole
// component's render with it.
function safeDomain(url: string, fallback?: string): string {
  if (fallback) return fallback;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

// CSV field escaping — wraps in quotes and doubles internal quotes if the
// value contains a comma, quote, or newline.
function csvEscape(value: unknown): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

interface SERPJourneyFlowProps {
  snapshots: TSnap[];
  maxJourneys?: number;
  onExport?: () => void;
}

export function SERPJourneyFlow({
  snapshots,
  maxJourneys = 8,
  onExport
}: SERPJourneyFlowProps) {
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [pxPerRank, setPxPerRank] = useState(18);
  const [selectedTrend, setSelectedTrend] = useState<"all" | "up" | "down" | "stable">("all");
  const playbackSpeed = 1200;
  const topPadding = 20;
  const leftPadding = 80;

  // Sorted snapshots by time, with safe results
  const sortedSnapshots = useMemo(() => {
    return (snapshots || [])
      .filter(s => Array.isArray(s.results))
      .map(s => ({ ...s, timestamp: toDate(s.timestamp) }))
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }, [snapshots]);

  /**
   * ✅ Single shared computation of the full urlJourneys map.
   * Previously this exact map-building loop ran TWICE — once inside
   * journeyData, once again inside trendCounts — doing the same O(n)
   * work redundantly on every render where snapshots changed.
   */
  const allUrlJourneys = useMemo(() => {
    const urlJourneys = new Map<string, JourneyStep[]>();

    sortedSnapshots.forEach((snapshot) => {
      snapshot.results?.forEach((result) => {
        if (!result?.url || typeof result.position !== "number") return;

        if (!urlJourneys.has(result.url)) {
          urlJourneys.set(result.url, []);
        }

        const steps = urlJourneys.get(result.url)!;
        const prev = steps[steps.length - 1];
        const change = prev ? result.position - prev.position : 0;

        steps.push({
          url:       result.url,
          title:     result.title || "",
          // ✅ Wrapped in safeDomain — never throws on malformed URLs
          domain:    safeDomain(result.url, result.domain),
          position:  result.position,
          changes:   change,
          timestamp: snapshot.timestamp as Date,
          step:      steps.length,
        });
      });
    });

    return urlJourneys;
  }, [sortedSnapshots]);

  // Journey data calculation with volatility — now derived from the
  // shared allUrlJourneys map instead of rebuilding it.
  const journeyData: JourneyData[] = useMemo(() => {
    if (!allUrlJourneys.size) return [];

    const journeys: JourneyData[] = Array.from(allUrlJourneys.entries()).map(([url, steps]) => {
      if (steps.length < 2) {
        return {
          url,
          domain: steps[0]?.domain || "",
          title:  steps[0]?.title || url,
          journey: steps,
          totalMovement: 0,
          finalPosition: steps[0]?.position || 0,
          trend: "stable" as const,
          volatility: 0,
        };
      }

      const positions     = steps.map(s => s.position);
      const totalMovement = steps.reduce((sum, st) => sum + Math.abs(st.changes), 0);
      const firstPos       = steps[0]?.position || 0;
      const lastPos         = steps[steps.length - 1]?.position || 0;

      const mean     = positions.reduce((sum, pos) => sum + pos, 0) / positions.length;
      const variance = positions.reduce((sum, pos) => sum + Math.pow(pos - mean, 2), 0) / positions.length;
      const volatility = Math.sqrt(variance);

      let trend: JourneyData["trend"] = "stable";
      const positionDiff = firstPos - lastPos;
      if (positionDiff > TREND_THRESHOLD) trend = "up";        // lower position number = better rank
      else if (positionDiff < -TREND_THRESHOLD) trend = "down";

      return {
        url,
        domain: steps[0]?.domain || "",
        title:  steps[0]?.title || url,
        journey: steps,
        totalMovement,
        finalPosition: lastPos,
        trend,
        volatility,
      };
    });

    let filtered = journeys.filter(j => j.journey.length > 1);
    if (selectedTrend !== "all") {
      filtered = filtered.filter(j => j.trend === selectedTrend);
    }

    return filtered
      .sort((a, b) => {
        if (b.totalMovement !== a.totalMovement) return b.totalMovement - a.totalMovement;
        return a.finalPosition - b.finalPosition;
      })
      .slice(0, maxJourneys);
  }, [allUrlJourneys, selectedTrend, maxJourneys]);

  /**
   * ✅ Trend counts now derived from the SAME shared allUrlJourneys map —
   * no second Map-building pass, no dead `allJourneys` variable (the old
   * code computed `Array.from(new Map()).length` from a freshly-created
   * EMPTY map every time, which always evaluated to 0 and was never
   * actually used anywhere — pure dead code, removed).
   */
  const trendCounts = useMemo(() => {
    const counts = { all: 0, up: 0, down: 0, stable: 0 };

    for (const steps of allUrlJourneys.values()) {
      if (steps.length < 2) continue;
      const firstPos = steps[0]?.position || 0;
      const lastPos  = steps[steps.length - 1]?.position || 0;
      const positionDiff = firstPos - lastPos;

      counts.all++;
      if (positionDiff > TREND_THRESHOLD) counts.up++;
      else if (positionDiff < -TREND_THRESHOLD) counts.down++;
      else counts.stable++;
    }

    return counts;
  }, [allUrlJourneys]);

  // Adaptive pxPerRank based on maximum observed rank
  useEffect(() => {
    const maxRank =
      Math.max(
        10,
        ...sortedSnapshots.flatMap(s => s.results?.map(r => r.position) || [])
      ) || 10;
    const targetHeight = 300;
    const calc = Math.max(8, Math.min(25, Math.floor(targetHeight / maxRank)));
    setPxPerRank(calc);
  }, [sortedSnapshots]);

  // Playback effect
  useEffect(() => {
    if (!isPlaying || sortedSnapshots.length === 0) return;
    const timer = setInterval(() => {
      setPlaybackIndex(prev => (prev < sortedSnapshots.length - 1 ? prev + 1 : 0));
    }, playbackSpeed);
    return () => clearInterval(timer);
  }, [isPlaying, sortedSnapshots.length]);

  const visibleCutoffTime = sortedSnapshots[playbackIndex]?.timestamp?.getTime() ?? Infinity;

  const chartHeight = useMemo(() => {
    const maxRank =
      Math.max(
        10,
        ...sortedSnapshots.flatMap(s => s.results?.map(r => r.position) || [])
      ) || 10;
    return topPadding + maxRank * pxPerRank + 40;
  }, [sortedSnapshots, pxPerRank]);

  const makePathD = useCallback(
    (steps: JourneyStep[], stepSpacing: number) => {
      const pts = steps.map((step, i) => {
        const x = leftPadding + i * stepSpacing;
        const y = posToY(step.position, pxPerRank, topPadding);
        return `${i === 0 ? "M" : "L"} ${x},${y}`;
      });
      return pts.join(" ");
    },
    [pxPerRank, leftPadding]
  );

  const xStep = useMemo(() => {
    const maxSteps = Math.max(2, ...journeyData.map(j => j.journey.length));
    const widthAvailable = 800;
    return Math.max(50, Math.floor((widthAvailable - leftPadding - 40) / (maxSteps - 1)));
  }, [journeyData, leftPadding]);

  const xWidth = useMemo(() => {
    const maxSteps = Math.max(2, ...journeyData.map(j => j.journey.length));
    return leftPadding + (maxSteps - 1) * xStep + 60;
  }, [journeyData, xStep, leftPadding]);

  /** ✅ Export — Blob-based, escaped fields, no encodeURI size limits */
  const handleExport = useCallback(() => {
    if (onExport) {
      onExport();
      return;
    }

    const headers = ["URL", "Title", "Domain", "Trend", "Total Movement", "Volatility", "Final Position", "Journey Points"]
      .join(",") + "\n";

    const rows = journeyData.map(site => {
      const journeyPoints = site.journey
        .map(step => `${step.timestamp.toISOString().split("T")[0]}:${step.position}`)
        .join(";");

      return [
        site.url,
        site.title,
        site.domain,
        site.trend,
        site.totalMovement,
        site.volatility.toFixed(2),
        site.finalPosition,
        journeyPoints,
      ].map(csvEscape).join(",");
    }).join("\n");

    const blob = new Blob([headers + rows], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `serp_journey_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [journeyData, onExport]);

  if (!journeyData.length) {
    return (
      <Card className="border-l-4 border-l-blue-500">
        <CardHeader>
          <CardTitle>SERP Journey Flow</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-gray-500">
            <Target className="h-16 w-16 mx-auto mb-4 text-gray-400" />
            <h3 className="text-xl font-semibold mb-2">No Journey Data</h3>
            <p className="text-gray-600 mb-4">
              {selectedTrend === "all"
                ? "Add more snapshots to visualize rank changes over time."
                : `No ${selectedTrend} trends found. Try selecting a different filter.`}
            </p>
            {selectedTrend !== "all" && (
              <Button variant="outline" onClick={() => setSelectedTrend("all")}>
                Show All Trends
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-l-4 border-l-blue-500">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>SERP Journey Flow</span>
          <Badge variant="secondary" className="bg-blue-100 text-blue-700">
            {journeyData.length} journeys tracked
          </Badge>
        </CardTitle>

        <div className="flex items-center justify-between mt-4">
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setIsPlaying(p => !p)}>
              {isPlaying ? <Pause size={16} /> : <Play size={16} />}
              {isPlaying ? " Pause" : " Play"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setPlaybackIndex(0);
                setIsPlaying(false);
              }}
            >
              <RotateCcw size={16} />
            </Button>
            <Button size="sm" variant="outline" onClick={handleExport}>
              <Download size={16} />
              Export
            </Button>
          </div>

          <div className="flex gap-1">
            {(['all', 'up', 'down', 'stable'] as const).map((trend) => {
              const count = trendCounts[trend];
              const Icon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Target;

              return (
                <Button
                  key={trend}
                  size="sm"
                  variant={selectedTrend === trend ? "default" : "ghost"}
                  onClick={() => setSelectedTrend(trend)}
                  className="text-xs gap-1"
                >
                  <Icon size={12} />
                  {trend.charAt(0).toUpperCase() + trend.slice(1)}
                  <Badge variant="secondary" className="ml-1 text-xs">
                    {count}
                  </Badge>
                </Button>
              );
            })}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {isPlaying && (
          <div className="mb-4">
            <div className="flex justify-between text-sm text-gray-600 mb-1">
              <span>Playback Progress</span>
              <span>{playbackIndex + 1} of {sortedSnapshots.length}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${((playbackIndex + 1) / sortedSnapshots.length) * 100}%` }}
              />
            </div>
          </div>
        )}

        {journeyData.map((site, idx) => {
          const visibleSteps = site.journey.filter(
            st => st.timestamp.getTime() <= visibleCutoffTime
          );
          if (visibleSteps.length < 2) return null;

          return (
            <div key={`${site.url}-${idx}`} className="bg-white rounded-lg shadow-sm border p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-800 truncate">{site.title || site.url}</h3>
                  <p className="text-xs text-gray-500 truncate">{site.url}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className="text-xs"
                    // ✅ Low-confidence flag — std deviation from very few
                    // points (< 4 snapshots) is noisy; surface that context
                    // via title rather than silently presenting it the same
                    // as a well-sampled value.
                    title={
                      visibleSteps.length < 4
                        ? `Based on only ${visibleSteps.length} snapshots — low confidence`
                        : `Based on ${visibleSteps.length} snapshots`
                    }
                  >
                    Volatility: {site.volatility.toFixed(1)}
                    {visibleSteps.length < 4 && "*"}
                  </Badge>
                  <Badge
                    className={`text-xs ${
                      site.trend === "up"
                        ? "bg-green-100 text-green-700 border-green-200"
                        : site.trend === "down"
                        ? "bg-red-100 text-red-700 border-red-200"
                        : "bg-gray-100 text-gray-700 border-gray-200"
                    }`}
                  >
                    {site.trend === "up" ? (
                      <><TrendingUp size={12} className="mr-1" />Improving</>
                    ) : site.trend === "down" ? (
                      <><TrendingDown size={12} className="mr-1" />Declining</>
                    ) : (
                      <><Target size={12} className="mr-1" />Stable</>
                    )}
                  </Badge>
                </div>
              </div>

              <svg
                viewBox={`0 0 ${xWidth} ${chartHeight}`}
                preserveAspectRatio="xMinYMin meet"
                className="w-full h-[280px] border border-gray-100 rounded"
              >
                {[1, 5, 10, 20, 30, 50].map(rank => {
                  const y = posToY(rank, pxPerRank, topPadding);
                  if (y > chartHeight - 20) return null;
                  return (
                    <g key={rank}>
                      <line x1={leftPadding - 8} y1={y} x2={xWidth - 20} y2={y} stroke="#f1f5f9" strokeWidth={1} />
                      <text x={leftPadding - 12} y={y + 3} textAnchor="end" fontSize={9} fill="#64748b">
                        #{rank}
                      </text>
                    </g>
                  );
                })}

                {visibleSteps.map((st, i) => {
                  const x = leftPadding + i * xStep;
                  return (
                    <g key={i}>
                      <line x1={x} y1={topPadding - 8} x2={x} y2={chartHeight - 25} stroke="#f8fafc" strokeWidth={1} />
                      <text
                        x={x}
                        y={chartHeight - 8}
                        textAnchor="middle"
                        fontSize={8}
                        fill="#64748b"
                      >
                        {st.timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </text>
                    </g>
                  );
                })}

                <defs>
                  <linearGradient id={`gradient-${idx}`} x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor={site.trend === "up" ? "#16a34a" : site.trend === "down" ? "#dc2626" : "#6b7280"} stopOpacity="0.8"/>
                    <stop offset="100%" stopColor={site.trend === "up" ? "#16a34a" : site.trend === "down" ? "#dc2626" : "#6b7280"} stopOpacity="0.3"/>
                  </linearGradient>
                </defs>

                <path
                  d={makePathD(visibleSteps, xStep)}
                  fill="none"
                  stroke={`url(#gradient-${idx})`}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                />

                {visibleSteps.map((point, i) => {
                  const cx = leftPadding + i * xStep;
                  const cy = posToY(point.position, pxPerRank, topPadding);
                  const isCurrent = i === Math.min(visibleSteps.length - 1, playbackIndex);
                  const isFirst = i === 0;
                  const isLast = i === visibleSteps.length - 1;

                  return (
                    <g key={i}>
                      <circle
                        cx={cx}
                        cy={cy}
                        r={isCurrent ? 6 : isFirst || isLast ? 5 : 3.5}
                        fill={isCurrent ? "#3b82f6" : isFirst ? "#16a34a" : isLast ? "#dc2626" : "#94a3b8"}
                        stroke="white"
                        strokeWidth={2}
                      />
                      {(isCurrent || isFirst || isLast) && (
                        <text
                          x={cx}
                          y={cy - 12}
                          textAnchor="middle"
                          fontSize={10}
                          fontWeight="600"
                          fill={isCurrent ? "#3b82f6" : isFirst ? "#16a34a" : "#dc2626"}
                        >
                          #{point.position}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>

              <div className="mt-3 flex justify-between text-sm text-gray-600">
                <div>Movement: {site.totalMovement} positions</div>
                <div>Steps: {site.journey.length}</div>
                <div>Final: #{site.finalPosition}</div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}