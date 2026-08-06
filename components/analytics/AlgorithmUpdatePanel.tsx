// components/analytics/AlgorithmUpdatePanel.tsx
"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Zap, ChevronDown, ChevronUp, AlertTriangle,
  TrendingDown, Info, RefreshCw,
} from "lucide-react"
import { useAuth } from "@/lib/middleware/authentication/auth-context"
import { useSecureApi } from "@/lib/api/use-secureApi"
import type { AlgorithmUpdateEvent } from "@/types/type"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeFixed(v: unknown, d = 1): string {
  return typeof v === "number" && isFinite(v) ? v.toFixed(d) : "—"
}

function formatDate(dateStr: string | Date): string {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return "Unknown date"
  return d.toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}

const SEVERITY_CONFIG = {
  major:    { color: "#dc2626", bg: "#fef2f2", border: "#fecaca", label: "Major",    icon: "🚨" },
  moderate: { color: "#d97706", bg: "#fffbeb", border: "#fde68a", label: "Moderate", icon: "⚠️" },
  minor:    { color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe", label: "Minor",    icon: "ℹ️" },
} as const

// ─── Component ────────────────────────────────────────────────────────────────

export function AlgorithmUpdatePanel() {
  const { user }  = useAuth()
  const { call }  = useSecureApi({ showErrorToast: false })

  const [events,   setEvents]   = useState<AlgorithmUpdateEvent[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const fetchEvents = useCallback(async () => {
    if (!user?.$id) return
    setLoading(true)
    setError(null)
    try {
      const data = await call("GET", "/analytics/algorithm-events?limit=10"
      )
      if (Array.isArray(data)) {
        // Parse affectedQueries if it came back as a string
        const parsed = data.map(e => ({
          ...e,
          affectedQueries: typeof e.affectedQueries === "string"
            ? JSON.parse(e.affectedQueries)
            : (e.affectedQueries ?? []),
        }))
        setEvents(parsed)
      } else {
        setEvents([])
      }
    } catch (err) {
      setError("Failed to load algorithm update events")
      setEvents([])
    } finally {
      setLoading(false)
    }
  }, [user?.$id, call])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-500" />
            Algorithm Update Detector
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2].map(i => (
              <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-500" />
            Algorithm Update Detector
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center gap-3">
            <AlertTriangle className="h-8 w-8 text-red-400" />
            <p className="text-sm text-gray-600">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchEvents}>
              <RefreshCw className="h-4 w-4 mr-2" />Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-gray-900">
              <Zap className="h-5 w-5 text-yellow-500" />
              Algorithm Update Detector
            </CardTitle>
            <CardDescription>
              Detected when ≥60% of queries in a category drift simultaneously
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {events.length > 0 && (
              <Badge variant="destructive" className="text-xs">
                {events.length} event{events.length !== 1 ? "s" : ""}
              </Badge>
            )}
            <Button variant="ghost" size="sm" onClick={fetchEvents}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {events.length === 0 ? (
          // ── Empty state ──────────────────────────────────────────────────
          <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
            <div className="h-12 w-12 rounded-full bg-green-50 flex items-center justify-center">
              <Zap className="h-6 w-6 text-green-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700">
                No algorithm updates detected
              </p>
              <p className="text-xs text-gray-500 mt-1 max-w-xs">
                We monitor for coordinated drift across query categories.
                Events appear here when ≥60% of a category's queries drift
                on the same day.
              </p>
            </div>
            <div className="text-xs text-gray-400 space-y-1 text-left bg-gray-50 rounded-lg p-3 w-full max-w-sm">
              <p className="font-medium text-gray-500 mb-2">Detection requirements:</p>
              <p>• At least 3 queries in the same category</p>
              <p>• 60%+ of those queries drift above score 30</p>
              <p>• All within a 24-hour window</p>
            </div>
          </div>
        ) : (
          // ── Events list ──────────────────────────────────────────────────
          <div className="space-y-3">
            {events.map(event => {
              const sev     = SEVERITY_CONFIG[event.severity] ?? SEVERITY_CONFIG.minor
              const isOpen  = expanded === event.id
              const driftPct = Math.round((event.driftRate ?? 0) * 100)
              const affectedQueries = Array.isArray(event.affectedQueries)
                ? event.affectedQueries
                : []

              return (
                <div
                  key={event.id}
                  className="border rounded-lg overflow-hidden transition-all"
                  style={{ borderColor: sev.border }}
                >
                  {/* Header row */}
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:opacity-90 transition-opacity"
                    style={{ backgroundColor: sev.bg }}
                    onClick={() => setExpanded(isOpen ? null : event.id)}
                  >
                    <span className="text-lg flex-shrink-0">{sev.icon}</span>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-gray-900">
                          {event.category}
                        </span>
                        <Badge
                          className="text-xs"
                          style={{
                            backgroundColor: sev.color + "20",
                            color:           sev.color,
                            border:          `1px solid ${sev.color}40`,
                          }}
                        >
                          {sev.label}
                        </Badge>
                        <span className="text-xs text-gray-500">
                          {formatDate(event.detectedAt)}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 mt-0.5">
                        {affectedQueries.length} queries affected ·{" "}
                        {driftPct}% drift rate ·{" "}
                        avg score {safeFixed(event.avgDriftScore)}
                      </p>
                    </div>

                    {isOpen
                      ? <ChevronUp  className="h-4 w-4 text-gray-400 flex-shrink-0" />
                      : <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    }
                  </button>

                  {/* Expanded detail */}
                  {isOpen && (
                    <div className="px-4 py-3 border-t bg-white space-y-4">

                      {/* Description */}
                      <div className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg">
                        <Info className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-gray-600 leading-relaxed">
                          {event.description}
                        </p>
                      </div>

                      {/* Stats */}
                      <div className="grid grid-cols-3 gap-3">
                        <div className="text-center p-2 border rounded-lg">
                          <div className="text-lg font-bold" style={{ color: sev.color }}>
                            {driftPct}%
                          </div>
                          <div className="text-xs text-gray-500">Drift Rate</div>
                        </div>
                        <div className="text-center p-2 border rounded-lg">
                          <div className="text-lg font-bold text-gray-900">
                            {safeFixed(event.avgDriftScore)}
                          </div>
                          <div className="text-xs text-gray-500">Avg Score</div>
                        </div>
                        <div className="text-center p-2 border rounded-lg">
                          <div className="text-lg font-bold text-gray-900">
                            {affectedQueries.length}
                          </div>
                          <div className="text-xs text-gray-500">Queries</div>
                        </div>
                      </div>

                      {/* Affected queries */}
                      {affectedQueries.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-gray-700 mb-2">
                            Affected Queries
                          </p>
                          <div className="space-y-1">
                            {affectedQueries.map((q: any, i: number) => (
                              <div
                                key={q.queryId ?? i}
                                className="flex items-center justify-between text-xs px-2 py-1.5 bg-gray-50 rounded"
                              >
                                <span className="text-gray-700 truncate flex-1 mr-2">
                                  {q.queryName ?? q.queryId}
                                </span>
                                <Badge variant="outline" className="text-xs flex-shrink-0">
                                  <TrendingDown className="h-2.5 w-2.5 mr-1 text-red-500" />
                                  {safeFixed(q.driftScore)}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}