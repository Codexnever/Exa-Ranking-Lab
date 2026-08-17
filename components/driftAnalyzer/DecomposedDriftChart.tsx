// components/driftAnalyzer/DecomposedDriftChart.tsx
"use client"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from "recharts"
import { TrendingUp, Users, Shuffle, AlertCircle } from "lucide-react"
import type { DecomposedDrift } from "@/app/services/DriftDecomposer"

interface DecomposedDriftChartProps {
  decomposed: DecomposedDrift
  queryName:  string
}

function safeFixed(v: unknown, d = 1): string {
  return typeof v === "number" && isFinite(v) ? v.toFixed(d) : "—"
}

const CAUSE_CONFIG = {
  content:    { label: "Content Drift",    color: "#8b5cf6", icon: TrendingUp,   desc: "Page content changed semantically" },
  competitor: { label: "Competitor Drift", color: "#ef4444", icon: Users,        desc: "New URLs entered the SERP"          },
  rerank:     { label: "Re-rank Drift",    color: "#f97316", icon: Shuffle,      desc: "Pure algorithmic re-ordering"       },
  mixed:      { label: "Mixed Causes",     color: "#6b7280", icon: AlertCircle,  desc: "Multiple factors contributing"      },
  stable:     { label: "Stable",           color: "#22c55e", icon: TrendingUp,   desc: "No significant drift detected"      },
} as const

export function DecomposedDriftChart({ decomposed, queryName }: DecomposedDriftChartProps) {
  if (!decomposed) return null

  const cause  = CAUSE_CONFIG[decomposed.dominantCause ?? "stable"]
  const DIcon  = cause.icon

  const barData = [
    { name: "Content",    value: decomposed.contentDrift    ?? 0, color: "#8b5cf6" },
    { name: "Competitor", value: decomposed.competitorDrift ?? 0, color: "#ef4444" },
    { name: "Re-rank",    value: decomposed.rerankDrift     ?? 0, color: "#f97316" },
  ]

  const radarData = [
    { subject: "Content",    A: decomposed.contentDrift    ?? 0 },
    { subject: "Competitor", A: decomposed.competitorDrift ?? 0 },
    { subject: "Re-rank",    A: decomposed.rerankDrift     ?? 0 },
  ]

  const { contentChangedUrls = [], newCompetitorUrls = [], droppedUrls = [], rerankedUrls = [] } =
    decomposed.breakdown ?? {}

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-gray-900 flex items-center gap-2">
              <DIcon className="h-5 w-5" style={{ color: cause.color }} />
              Drift Decomposition
            </CardTitle>
            <CardDescription>What caused the drift in "{queryName}"</CardDescription>
          </div>
          <Badge
            className="text-sm px-3 py-1"
            style={{ backgroundColor: cause.color + "20", color: cause.color, border: `1px solid ${cause.color}40` }}
          >
            {cause.label}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4">
          {barData.map(d => (
            <div key={d.name} className="text-center p-3 border rounded-lg">
              <div className="text-2xl font-bold" style={{ color: d.color }}>
                {safeFixed(d.value)}
              </div>
              <div className="text-xs text-gray-500 mt-1">{d.name} Drift</div>
              <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${Math.min(100, d.value)}%`, backgroundColor: d.color }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Charts side by side */}
        <div className="grid grid-cols-2 gap-4">
          {/* Bar chart */}
          <div>
            <p className="text-xs font-medium text-gray-600 mb-2">Drift by Type (0–100)</p>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(v: any) => [`${safeFixed(v)}`, "Drift Score"]}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {barData.map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Radar chart */}
          <div>
            <p className="text-xs font-medium text-gray-600 mb-2">Drift Shape</p>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} />
                  <Radar
                    name="Drift"
                    dataKey="A"
                    stroke={cause.color}
                    fill={cause.color}
                    fillOpacity={0.25}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Breakdown tables */}
        <div className="space-y-3">
          {contentChangedUrls.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-purple-700 mb-1 flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                Content Changed ({contentChangedUrls.length} URLs)
              </p>
              <div className="space-y-1">
                {contentChangedUrls.slice(0, 5).map(url => (
                  <div key={url} className="text-xs text-gray-600 bg-purple-50 px-2 py-1 rounded truncate">
                    {url}
                  </div>
                ))}
                {contentChangedUrls.length > 5 && (
                  <p className="text-xs text-gray-400">+{contentChangedUrls.length - 5} more</p>
                )}
              </div>
            </div>
          )}

          {newCompetitorUrls.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-red-700 mb-1 flex items-center gap-1">
                <Users className="h-3 w-3" />
                New Competitors ({newCompetitorUrls.length} URLs)
              </p>
              <div className="space-y-1">
                {newCompetitorUrls.slice(0, 5).map(url => (
                  <div key={url} className="text-xs text-gray-600 bg-red-50 px-2 py-1 rounded truncate">
                    {url}
                  </div>
                ))}
                {newCompetitorUrls.length > 5 && (
                  <p className="text-xs text-gray-400">+{newCompetitorUrls.length - 5} more</p>
                )}
              </div>
            </div>
          )}

          {droppedUrls.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Dropped from SERP ({droppedUrls.length} URLs)
              </p>
              <div className="space-y-1">
                {droppedUrls.slice(0, 5).map(url => (
                  <div key={url} className="text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded truncate line-through">
                    {url}
                  </div>
                ))}
              </div>
            </div>
          )}

          {rerankedUrls.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-orange-700 mb-1 flex items-center gap-1">
                <Shuffle className="h-3 w-3" />
                Re-ranked ({rerankedUrls.length} URLs)
              </p>
              <div className="space-y-1">
                {rerankedUrls.slice(0, 5).map(r => (
                  <div key={r.url} className="flex items-center justify-between text-xs bg-orange-50 px-2 py-1 rounded">
                    <span className="text-gray-600 truncate flex-1 mr-2">{r.url}</span>
                    <span className={r.delta > 0 ? "text-red-600 font-medium" : "text-green-600 font-medium"}>
                      {r.previousRank} → {r.currentRank}
                      {r.delta > 0 ? ` ↓${r.delta}` : ` ↑${Math.abs(r.delta)}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Dominant cause explanation */}
        <div className="p-3 rounded-lg border text-xs text-gray-600"
          style={{ backgroundColor: cause.color + "08", borderColor: cause.color + "30" }}>
          <span className="font-medium" style={{ color: cause.color }}>
            Dominant cause: {cause.label}.
          </span>{" "}
          {cause.desc}. Total weighted drift score: {safeFixed(decomposed.total)}/100.
        </div>
      </CardContent>
    </Card>
  )
}
