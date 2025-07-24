"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BarChart2,
  Search,
  Camera,
  GitCompare,
  MessageSquare,
  Settings,
  MonitorCog,
  Activity,
  Radar,
  Wifi,
  WifiOff,
  AlertCircle,
  CheckCircle,
  Clock,
  Zap,
  TrendingUp,
  Database,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { useConnectionHealth } from "@/components/providers/ConnectionHealthProvider"
import { useState, useEffect } from "react"

export default function Sidebar() {
  const pathname = usePathname()
  const { connectionQuality, isHealthy, lastActivity, reconnectAttempts } = useConnectionHealth()
  const [activityStats, setActivityStats] = useState({
    totalEvents: 0,
    successfulEvents: 0,
    failedEvents: 0,
  })

  // Track activity statistics
  useEffect(() => {
    // This would be connected to your real-time event tracking
    // For now, we'll simulate with the lastActivity changes
    const updateStats = () => {
      setActivityStats(prev => ({
        ...prev,
        totalEvents: prev.totalEvents + 1,
        successfulEvents: prev.successfulEvents + (isHealthy ? 1 : 0),
        failedEvents: prev.failedEvents + (isHealthy ? 0 : 1),
      }))
    }

    // Simulate activity tracking
    const interval = setInterval(() => {
      if (isHealthy) updateStats()
    }, 30000) // Every 30 seconds if healthy

    return () => clearInterval(interval)
  }, [isHealthy, lastActivity])

  const routes = [
    {
      label: "Dashboard",
      icon: BarChart2,
      href: "/",
    },
    {
      label: "Query Builder",
      icon: Search,
      href: "/query-builder",
    },
    {
      label: "Query Monitor",
      icon: MonitorCog,
      href: "/query-monitor",
    },
    {
      label: "Analytics",
      icon: Activity,
      href: "/analytics",
    },
    {
      label: "Drift Radar",
      icon: Radar,
      href: "/drift",
    },
    {
      label: "Snapshots",
      icon: Camera,
      href: "/snapshots",
    },
    {
      label: "Compare Rankings",
      icon: GitCompare,
      href: "/compare",
    },
    {
      label: "Feedback",
      icon: MessageSquare,
      href: "/feedback",
    },
    {
      label: "Settings",
      icon: Settings,
      href: "/settings",
    },
  ]

  // Connection health display configuration
  const getConnectionConfig = () => {
    const timeSinceActivity = Date.now() - lastActivity
    const minutesAgo = Math.floor(timeSinceActivity / 60000)
    const secondsAgo = Math.floor((timeSinceActivity % 60000) / 1000)

    switch (connectionQuality) {
      case 'excellent':
        return {
          icon: CheckCircle,
          color: 'text-green-600',
          bgColor: 'bg-green-50',
          borderColor: 'border-green-200',
          status: 'Connected',
          detail: 'Real-time active',
          showPulse: true,
        }
      case 'good':
        return {
          icon: Wifi,
          color: 'text-blue-600',
          bgColor: 'bg-blue-50',
          borderColor: 'border-blue-200',
          status: 'Connected',
          detail: `${secondsAgo}s ago`,
          showPulse: false,
        }
      case 'poor':
        return {
          icon: AlertCircle,
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-50',
          borderColor: 'border-yellow-200',
          status: 'Slow',
          detail: `${minutesAgo}m ago`,
          showPulse: false,
        }
      case 'disconnected':
        return {
          icon: WifiOff,
          color: 'text-red-600',
          bgColor: 'bg-red-50',
          borderColor: 'border-red-200',
          status: 'Disconnected',
          detail: reconnectAttempts > 0 ? `Retry ${reconnectAttempts}` : 'Offline',
          showPulse: false,
        }
      default:
        return {
          icon: Clock,
          color: 'text-gray-600',
          bgColor: 'bg-gray-50',
          borderColor: 'border-gray-200',
          status: 'Connecting',
          detail: 'Please wait...',
          showPulse: true,
        }
    }
  }

  const connectionConfig = getConnectionConfig()
  const ConnectionIcon = connectionConfig.icon
  const successRate = activityStats.totalEvents > 0 
    ? Math.round((activityStats.successfulEvents / activityStats.totalEvents) * 100)
    : 100

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

      {/* Navigation Routes */}
      <div className="flex-1 px-3 py-2">
        <div className="space-y-1">
          {routes.map((route) => (
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
              {route.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Connection Health Panel */}
      <div className="p-3 border-t bg-gray-50/50">
        <div className="space-y-3">
          {/* Connection Status Header */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Connection Health
            </span>
            <Badge 
              variant={connectionQuality === 'excellent' ? 'default' : 'secondary'}
              className={cn(
                "text-xs",
                connectionQuality === 'excellent' && "bg-green-100 text-green-700",
                connectionQuality === 'good' && "bg-blue-100 text-blue-700",
                connectionQuality === 'poor' && "bg-yellow-100 text-yellow-700",
                connectionQuality === 'disconnected' && "bg-red-100 text-red-700"
              )}
            >
              {connectionConfig.status}
            </Badge>
          </div>

          {/* Main Connection Display */}
          <div className={cn(
            "p-3 rounded-lg border transition-all",
            connectionConfig.bgColor,
            connectionConfig.borderColor
          )}>
            <div className="flex items-center gap-3">
              <div className="relative">
                <ConnectionIcon className={cn("h-5 w-5", connectionConfig.color)} />
                {connectionConfig.showPulse && (
                  <div className="absolute inset-0">
                    <ConnectionIcon className={cn(
                      "h-5 w-5 animate-ping opacity-75",
                      connectionConfig.color
                    )} />
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

            {/* Connection Metrics */}
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
                  <Zap className="h-3 w-3 text-blue-600" />
                  <span className="font-medium">{activityStats.totalEvents}</span>
                </div>
                <div className="text-gray-500">Events</div>
              </div>
            </div>

            {/* Detailed Status for Poor/Disconnected */}
            {(connectionQuality === 'poor' || connectionQuality === 'disconnected') && (
              <div className="mt-2 p-2 bg-white/80 rounded text-xs">
                <div className="flex items-center gap-1 text-gray-600">
                  <AlertCircle className="h-3 w-3" />
                  <span>
                    {connectionQuality === 'poor' 
                      ? 'Updates may be delayed'
                      : 'Real-time features unavailable'
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

          {/* Quick Health Indicators */}
          <div className="grid grid-cols-3 gap-1 text-xs">
            <div className="text-center p-1">
              <div className={cn(
                "h-2 w-2 rounded-full mx-auto mb-1",
                connectionQuality === 'excellent' ? 'bg-green-500' : 'bg-gray-300'
              )} />
              <span className="text-gray-500">Live</span>
            </div>
            <div className="text-center p-1">
              <div className={cn(
                "h-2 w-2 rounded-full mx-auto mb-1",
                ['excellent', 'good'].includes(connectionQuality) ? 'bg-blue-500' : 'bg-gray-300'
              )} />
              <span className="text-gray-500">Sync</span>
            </div>
            <div className="text-center p-1">
              <div className={cn(
                "h-2 w-2 rounded-full mx-auto mb-1",
                connectionQuality !== 'disconnected' ? 'bg-yellow-500' : 'bg-gray-300'
              )} />
              <span className="text-gray-500">Data</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
