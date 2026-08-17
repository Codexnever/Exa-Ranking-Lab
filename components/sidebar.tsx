// components/sidebar.tsx
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { EmbeddingModeIndicator } from "@/components/ui/EmbeddingModeIndicator"
import {
  BarChart2, Search, Camera, GitCompare, MessageSquare,
  Settings, MonitorCog, Activity, Radar, Wifi, WifiOff,
  AlertCircle, CheckCircle, Clock, Zap, TrendingUp, Brain, Target,
} from "lucide-react"
import { cn } from "@/utils/utils"
import { Badge } from "@/components/ui/badge"
import { useConnectionHealth } from "@/monitoring/healthcheck/ConnectionHealthProvider"
import { useWeaviateStore } from "@/app/store/weaviate-store"
import { useAnalyticsStore } from "@/app/store/use-analytics-store"
import { useState, useEffect } from "react"
import { getEmbeddingService } from "@/app/services/EmbeddingService"

export default function Sidebar() {
  const pathname = usePathname()
  const {
    connectionQuality,
    lastActivity,
    reconnectAttempts,
    metrics,
  } = useConnectionHealth()

  const { dataSource, isConnected: weaviateConnected, error: weaviateError } = useWeaviateStore()

  const [activityStats, setActivityStats] = useState({
    totalEvents: 0, successfulEvents: 0, failedEvents: 0,
  })

  //  FIX: derive embeddingMode and cacheHitRate from real sources
  // instead of using undefined variables that caused the browser error.
  //
  // embeddingMode: read from the analytics store if it exposes the last
  // drift result's embeddingMode, otherwise default to "gemini" (correct
  // assumption when Gemini is healthy and no drift has run yet).
  //
  // cacheHitRate: read from EmbeddingService singleton's in-process LRU
  // hit rate. This resets on cold start but updates in real time as
  // embeddings are served from cache within the current invocation.
  const analytics = useAnalyticsStore(state => state.analytics)
  const embeddingMode = (analytics as any)?.embeddingMode ?? "gemini"

  const [cacheHitRate, setCacheHitRate] = useState(0)

  useEffect(() => {
    // Poll EmbeddingService singleton every 10s for real cache hit rate
    const update = () => {
      try {
        const stats = getEmbeddingService().cacheStats
        setCacheHitRate(stats.lruHitRate)
      } catch {
        // EmbeddingService not yet initialised — leave at 0
      }
    }
    update()
    const interval = setInterval(update, 10_000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    setActivityStats({
      totalEvents:      metrics.totalEvents,
      successfulEvents: metrics.successfulEvents,
      failedEvents:     metrics.failedEvents,
    })
  }, [metrics])

  const getConnectionConfig = () => {
    const timeSinceActivity = Date.now() - lastActivity
    const minutesAgo = Math.floor(timeSinceActivity / 60000)
    const secondsAgo = Math.floor((timeSinceActivity % 60000) / 1000)

    const isAIMode          = dataSource === "weaviate"
    const aiConnectionHealthy = isAIMode ? weaviateConnected && !weaviateError : true

    let effectiveQuality = connectionQuality
    if (isAIMode && !aiConnectionHealthy && connectionQuality !== "disconnected") {
      effectiveQuality = "poor"
    }

    switch (effectiveQuality) {
      case "excellent":
        return {
          icon: CheckCircle, color: "text-green-600",
          bgColor: "bg-green-50", borderColor: "border-green-200",
          status: isAIMode ? "AI Connected" : "Connected",
          detail: isAIMode ? "AI analytics active" : "Real-time active",
          showPulse: true,
        }
      case "good":
        return {
          icon: Wifi, color: "text-blue-600",
          bgColor: "bg-blue-50", borderColor: "border-blue-200",
          status: "Connected", detail: `${secondsAgo}s ago`, showPulse: false,
        }
      case "poor":
        return {
          icon: AlertCircle, color: "text-yellow-600",
          bgColor: "bg-yellow-50", borderColor: "border-yellow-200",
          status: isAIMode && !aiConnectionHealthy ? "AI Limited" : "Slow",
          detail: isAIMode && !aiConnectionHealthy ? "Traditional mode only" : `${minutesAgo}m ago`,
          showPulse: false,
        }
      case "disconnected":
        return {
          icon: WifiOff, color: "text-red-600",
          bgColor: "bg-red-50", borderColor: "border-red-200",
          status: "Disconnected",
          detail: reconnectAttempts > 0 ? `Retry ${reconnectAttempts}` : "Offline",
          showPulse: false,
        }
      default:
        return {
          icon: Clock, color: "text-gray-600",
          bgColor: "bg-gray-50", borderColor: "border-gray-200",
          status: "Connecting", detail: "Please wait...", showPulse: true,
        }
    }
  }

  const connectionConfig = getConnectionConfig()
  const ConnectionIcon   = connectionConfig.icon
  const successRate      = activityStats.totalEvents > 0
    ? Math.round((activityStats.successfulEvents / activityStats.totalEvents) * 100)
    : 100

  const routes = [
    { label: "Dashboard",       icon: BarChart2,    href: "/"              },
    { label: "Query Builder",   icon: Search,       href: "/query-builder" },
    { label: "Query Monitor",   icon: MonitorCog,   href: "/query-monitor" },
    {
      label: "Analytics", icon: Activity, href: "/analytics",
      badge: dataSource === "weaviate" ? "AI" : undefined,
    },
    { label: "Drift Radar",     icon: Radar,        href: "/drift"         },
    { label: "Snapshots",       icon: Camera,       href: "/snapshots"     },
    { label: "Compare Rankings",icon: GitCompare,   href: "/compare"       },
    { label: "Feedback",        icon: MessageSquare,href: "/feedback"      },
    { label: "Evaluation",      icon: Target,       href: "/evaluation"    },
    { label: "Settings",        icon: Settings,     href: "/settings"      },
  ]

  return (
    <div className="flex flex-col w-64 border-r bg-white">

      {/* Header */}
      <div className="p-6">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-blue-600 flex items-center justify-center">
            <span className="text-white font-bold">E</span>
          </div>
          <div>
            <span className="font-bold text-xl text-gray-900">Exa Ranking Lab</span>
            <div className="text-xs text-gray-500">v1.0.0</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 px-3 py-2">
        <div className="space-y-1">
          {routes.map(route => (
            <Link
              key={route.href}
              href={route.href}
              prefetch
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                pathname === route.href
                  ? "bg-blue-50 text-blue-700 border-r-2 border-blue-600"
                  : "text-gray-700 hover:bg-gray-50"
              )}
            >
              <route.icon className="h-4 w-4" />
              <span className="flex-1">{route.label}</span>
              {route.badge && (
                <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-700">
                  {route.badge}
                </Badge>
              )}
            </Link>
          ))}
        </div>
      </div>

      {/* Connection Health Panel */}
      <div className="p-3 border-t bg-gray-50/50">
        <div className="space-y-3">

          {/* Header */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              {dataSource === "weaviate" ? "AI Analytics Health" : "Connection Health"}
            </span>
            <Badge
              variant={connectionQuality === "excellent" ? "default" : "secondary"}
              className={cn(
                "text-xs",
                connectionQuality === "excellent"   && "bg-green-100 text-green-700",
                connectionQuality === "good"        && "bg-blue-100 text-blue-700",
                connectionQuality === "poor"        && "bg-yellow-100 text-yellow-700",
                connectionQuality === "disconnected"&& "bg-red-100 text-red-700",
              )}
            >
              {connectionConfig.status}
            </Badge>
          </div>

          {/* Main display */}
          <div className={cn(
            "p-3 rounded-lg border transition-all",
            connectionConfig.bgColor, connectionConfig.borderColor
          )}>
            <div className="flex items-center gap-3">
              <div className="relative">
                <ConnectionIcon className={cn("h-5 w-5", connectionConfig.color)} />
                {connectionConfig.showPulse && (
                  <div className="absolute inset-0">
                    <ConnectionIcon className={cn("h-5 w-5 animate-ping opacity-75", connectionConfig.color)} />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className={cn("font-medium text-sm", connectionConfig.color)}>
                  {connectionConfig.status}
                </div>
                <div className="text-xs text-gray-600 truncate">
                  {connectionConfig.detail}
                </div>
              </div>
            </div>

            {/* Metrics */}
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="bg-white/60 rounded px-2 py-1">
                <div className="flex items-center gap-1">
                  <TrendingUp className="h-3 w-3 text-green-600" />
                  <span className="font-medium">{successRate}%</span>
                </div>
                <div className="text-gray-500">Success</div>
              </div>
              <div className="bg-white/60 rounded px-2 py-1">
                <div className="flex items-center gap-1">
                  {dataSource === "weaviate"
                    ? <Brain className="h-3 w-3 text-purple-600" />
                    : <Zap   className="h-3 w-3 text-blue-600"   />
                  }
                  <span className="font-medium">{activityStats.totalEvents}</span>
                </div>
                <div className="text-gray-500">
                  {dataSource === "weaviate" ? "AI Ops" : "Events"}
                </div>
              </div>
            </div>

            {/* FIX: EmbeddingModeIndicator now receives real values.
                embeddingMode — read from analytics store, defaults to "gemini"
                cacheHitRate  — polled from EmbeddingService singleton every 10s
                Neither is undefined anymore. */}
            <div className="mt-2">
              <EmbeddingModeIndicator
                mode={embeddingMode as "gemini" | "openai" | "position-only"}
                cacheHitRate={cacheHitRate}
                compact={true}
              />
            </div>

            {/* Weaviate status */}
            {dataSource === "weaviate" && (
              <div className="mt-2 p-2 bg-white/80 rounded text-xs">
                <div className="flex items-center gap-1">
                  <Target className={cn(
                    "h-3 w-3",
                    weaviateConnected ? "text-green-500" : "text-red-500"
                  )} />
                  <span className={cn(
                    "font-medium",
                    weaviateConnected ? "text-green-700" : "text-red-700"
                  )}>
                    Vector DB: {weaviateConnected ? "Connected" : "Disconnected"}
                  </span>
                </div>
                {weaviateError && (
                  <div className="text-red-600 mt-1 truncate">{weaviateError}</div>
                )}
              </div>
            )}

            {/* Poor / disconnected status */}
            {(connectionQuality === "poor" || connectionQuality === "disconnected") && (
              <div className="mt-2 p-2 bg-white/80 rounded text-xs">
                <div className="flex items-center gap-1 text-gray-600">
                  <AlertCircle className="h-3 w-3" />
                  <span>
                    {connectionQuality === "poor"
                      ? (dataSource === "weaviate" && !weaviateConnected
                          ? "AI features limited"
                          : "Updates may be delayed")
                      : "Real-time features unavailable"
                    }
                  </span>
                </div>
                {reconnectAttempts > 0 && (
                  <div className="text-gray-500 mt-1">
                    Reconnection attempts: {reconnectAttempts}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quick health dots */}
          <div className="grid grid-cols-3 gap-1 text-xs">
            <div className="text-center p-1">
              <div className={cn(
                "h-2 w-2 rounded-full mx-auto mb-1",
                connectionQuality === "excellent" ? "bg-green-500" : "bg-gray-300"
              )} />
              <span className="text-gray-500">Live</span>
            </div>
            <div className="text-center p-1">
              <div className={cn(
                "h-2 w-2 rounded-full mx-auto mb-1",
                dataSource === "weaviate"
                  ? (weaviateConnected ? "bg-purple-500" : "bg-gray-300")
                  : (["excellent", "good"].includes(connectionQuality) ? "bg-blue-500" : "bg-gray-300")
              )} />
              <span className="text-gray-500">
                {dataSource === "weaviate" ? "AI" : "Sync"}
              </span>
            </div>
            <div className="text-center p-1">
              <div className={cn(
                "h-2 w-2 rounded-full mx-auto mb-1",
                connectionQuality !== "disconnected" ? "bg-yellow-500" : "bg-gray-300"
              )} />
              <span className="text-gray-500">Data</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
