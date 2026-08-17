// components/driftAnalyzer/CoverageGapChart.tsx
"use client"

import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from "recharts"
import { AlertTriangle, CheckCircle, TrendingDown } from "lucide-react"
import { analyzeCoverageTrend, type CoverageGapMetric } from "@/utils/coverage-and-versioning"
import type { RankingSnapshot } from "@/types/type"

interface CoverageGapChartProps {
  snapshots:   RankingSnapshot[]
  queryName:   string
}

function safeFixed(v: unknown, d = 1): string {
  return typeof v === "number" && isFinite(v) ? v.toFixed(d) : "—"
}

function formatDate(ts: Date | string): string {
  const d = new Date(ts)
  if (isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

const STATUS_CONFIG = {
  full:    { color: "#22c55e", label: "Full coverage",   icon: CheckCircle  },
  partial: { color: "#f97316", label: "Partial coverage", icon: AlertTriangle },
  sparse:  { color: "#ef4444", label: "Sparse coverage", icon: TrendingDown  },
} as const

export function CoverageGapChart({ snapshots, queryName }: CoverageGapChartProps) {
  const chartData = useMemo(() => {
    if (!Array.isArray(snapshots) || snapshots.length === 0) return []

    return [...snapshots]
      .filter(s => s?.metadata?.numRequested != null)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .map(s => {
        const numRequested = s.metadata?.numRequested ?? 0
        const numReturned  = s.results?.length ?? 0
        const gap          = Math.max(0, numRequested - numReturned)
        const gapRate      = numRequested > 0 ? (gap / numRequested) * 100 : 0
        const coveragePct  = numRequested > 0 ? (numReturned / numRequested) * 100 : 0

        return {
          date:        formatDate(s.timestamp),
          numRequested,
          numReturned,
          gap,
          gapRate:     Math.round(gapRate),
          coveragePct: Math.round(coveragePct),
          configHash:  s.metadata?.configHash,
          status: gapRate < 10 ? "full" : gapRate < 50 ? "partial" : "sparse",
        }
      })
  }, [snapshots])

  const metrics: CoverageGapMetric[] = chartData.map(d => ({
    numRequested: d.numRequested,
    numReturned:  d.numReturned,
    gap:          d.gap,
    gapRate:      d.gapRate / 100,
    status:       d.status as CoverageGapMetric["status"],
  }))

  const trend = useMemo(() => analyzeCoverageTrend(metrics), [metrics])

  const configChanges = useMemo(() => {
    const changes: number[] = []
    for (let i = 1; i < chartData.length; i++) {
      if (
        chartData[i].configHash &&
        chartData[i - 1].configHash &&
        chartData[i].configHash !== chartData[i - 1].configHash
      ) {
        changes.push(i)
      }
    }
    return changes
  }, [chartData])

  const latestCoverage = chartData[chartData.length - 1]
  const latestStatus = STATUS_CONFIG[(latestCoverage?.status ?? "full") as keyof typeof STATUS_CONFIG]
  const StatusIcon     = latestStatus.icon

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-gray-900">Result Coverage Gap</CardTitle>
          <CardDescription>Tracking how many results Exa returns vs what was requested</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-10 text-gray-500">
            <CheckCircle className="h-10 w-10 text-gray-300 mb-3" />
            <p className="text-sm">No coverage data yet</p>
            <p className="text-xs mt-1 text-gray-400">
              Coverage tracking requires snapshots captured after the latest update
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-gray-900">Result Coverage Gap</CardTitle>
            <CardDescription>
              How many results Exa returned vs requested over time — "{queryName}"
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              className="text-xs"
              style={{
                backgroundColor: latestStatus.color + "15",
                color: latestStatus.color,
                border: `1px solid ${latestStatus.color}40`,
              }}
            >
              <StatusIcon className="h-3 w-3 mr-1" />
              {latestStatus.label}
            </Badge>
            {trend.trend !== "stable" && (
              <Badge
                variant={trend.trend === "worsening" ? "destructive" : "default"}
                className="text-xs"
              >
                {trend.trend === "worsening" ? "↓ Coverage declining" : "↑ Coverage improving"}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 border rounded-lg">
            <div className="text-2xl font-bold text-gray-900">
              {latestCoverage?.numRequested ?? "—"}
            </div>
            <div className="text-xs text-gray-500">Requested</div>
          </div>
          <div className="text-center p-3 border rounded-lg">
            <div className="text-2xl font-bold text-blue-600">
              {latestCoverage?.numReturned ?? "—"}
            </div>
            <div className="text-xs text-gray-500">Returned</div>
          </div>
          <div className="text-center p-3 border rounded-lg">
            <div
              className="text-2xl font-bold"
              style={{ color: latestStatus.color }}
            >
              {latestCoverage?.coveragePct ?? "—"}%
            </div>
            <div className="text-xs text-gray-500">Coverage</div>
          </div>
        </div>

        {/* Config change warning */}
        {configChanges.length > 0 && (
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
            <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <span>
              Query parameters changed {configChanges.length} time{configChanges.length !== 1 ? "s" : ""} in this period.
              Coverage comparisons across those points may not be reliable.
            </span>
          </div>
        )}

        {/* Coverage % area chart */}
        <div>
          <p className="text-xs font-medium text-gray-600 mb-2">Coverage % over time</p>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} />
                <Tooltip
                  contentStyle={{ fontSize: 12 }}
                  formatter={(v: unknown, name: string | number | undefined) => [
                    `${v}%`,
                    name === "coveragePct" ? "Coverage" : name,
                  ]}
                />
                {/* 90% "full" threshold line */}
                <ReferenceLine
                  y={90}
                  stroke="#22c55e"
                  strokeDasharray="4 3"
                  label={{ value: "Full (90%)", fontSize: 10, fill: "#22c55e", position: "right" }}
                />
                {/* 50% "sparse" threshold line */}
                <ReferenceLine
                  y={50}
                  stroke="#ef4444"
                  strokeDasharray="4 3"
                  label={{ value: "Sparse (50%)", fontSize: 10, fill: "#ef4444", position: "right" }}
                />
                <Area
                  type="monotone"
                  dataKey="coveragePct"
                  stroke="#2563eb"
                  fill="#2563eb"
                  fillOpacity={0.1}
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#2563eb" }}
                  activeDot={{ r: 5 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Interpretation */}
        <div className="p-3 bg-gray-50 rounded-lg text-xs text-gray-600">
          {trend.trend === "worsening" ? (
            <span>
              <span className="text-red-600 font-medium">Coverage declining.</span>{" "}
              Exa is returning fewer results for this query over time — the topic may be becoming less
              indexed or the query is too narrow for the current result pool.
            </span>
          ) : trend.trend === "improving" ? (
            <span>
              <span className="text-green-600 font-medium">Coverage improving.</span>{" "}
              Exa is returning more results for this query over time — broader topic coverage or index growth.
            </span>
          ) : (
            <span>
              <span className="text-blue-600 font-medium">Coverage stable.</span>{" "}
              Exa consistently returns a similar number of results — no significant index changes for this query.
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}