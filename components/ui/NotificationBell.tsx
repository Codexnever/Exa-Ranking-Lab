// components/ui/NotificationBell.tsx
"use client"

import { useState, useEffect, useCallback } from "react"
import { Bell, BellRing, AlertTriangle, TrendingUp, X, ExternalLink } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAuth } from "@/lib/middleware/authentication/auth-context"
import { useSecureApi } from "@/lib/api/use-secureApi"
import { useRouter } from "next/navigation"
import { cn } from "@/utils/utils"

interface Notification {
  $id:        string
  queryId:    string
  queryName:  string
  driftScore: number
  driftType:  "high" | "critical"
  change:     number
  read:       boolean
  createdAt:  string
}

export function NotificationBell() {
  const { userId } = useAuth()
  const router     = useRouter()
  const { call }   = useSecureApi({ showErrorToast: false })

  const [notifications, setNotifications] = useState<Notification[]>([])
  const [open,          setOpen]          = useState(false)
  const [loading,       setLoading]       = useState(false)

  const unreadCount = notifications.filter(n => !n.read).length

  const fetchNotifications = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const data = await call<Notification[]>("GET", "/notifications")
      if (Array.isArray(data)) setNotifications(data)
    } catch {
      // silent — bell just shows 0 if fetch fails
    } finally {
      setLoading(false)
    }
  }, [userId, call])

  // Poll every 2 minutes for new alerts
  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 2 * 60 * 1000)
    return () => clearInterval(interval)
  }, [fetchNotifications])

  const markAsRead = async (id: string) => {
    setNotifications(prev =>
      prev.map(n => n.$id === id ? { ...n, read: true } : n)
    )
    try {
      await call("PATCH", `/notifications/${id}/read`)
    } catch { /* optimistic update — ignore failure */ }
  }

  const markAllRead = async () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    try {
      await call("PATCH", "/notifications/read-all")
    } catch { /* optimistic */ }
  }

  const handleNotificationClick = (n: Notification) => {
    markAsRead(n.$id)
    setOpen(false)
    router.push(`/drift/${n.queryId}`)
  }

  const formatTimeAgo = (dateStr: string): string => {
    const past = new Date(dateStr)
    if (isNaN(past.getTime())) return "Unknown time"
    const diffH = Math.floor((Date.now() - past.getTime()) / 3600000)
    if (diffH < 1)  return "Just now"
    if (diffH < 24) return `${diffH}h ago`
    return `${Math.floor(diffH / 24)}d ago`
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="relative h-9 w-9 p-0">
          {unreadCount > 0 ? (
            <BellRing className="h-5 w-5 text-gray-700 animate-pulse" />
          ) : (
            <Bell className="h-5 w-5 text-gray-500" />
          )}
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-bold">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-96 p-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold text-gray-900">Drift Alerts</h3>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-blue-600 hover:underline"
              >
                Mark all read
              </button>
            )}
            <Badge variant="secondary" className="text-xs">
              {notifications.length} total
            </Badge>
          </div>
        </div>

        {/* List */}
        <div className="max-h-96 overflow-y-auto">
          {loading && notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-500">
              Loading alerts...
            </div>
          ) : notifications.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <Bell className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No drift alerts yet</p>
              <p className="text-xs text-gray-400 mt-1">
                You'll be notified when drift exceeds 60
              </p>
            </div>
          ) : (
            notifications.map(n => (
              <div
                key={n.$id}
                onClick={() => handleNotificationClick(n)}
                className={cn(
                  "flex items-start gap-3 px-4 py-3 border-b cursor-pointer hover:bg-gray-50 transition-colors",
                  !n.read && "bg-blue-50/50"
                )}
              >
                {/* Icon */}
                <div className={cn(
                  "mt-0.5 p-1.5 rounded-full flex-shrink-0",
                  n.driftType === "critical" ? "bg-red-100" : "bg-amber-100"
                )}>
                  <AlertTriangle className={cn(
                    "h-3.5 w-3.5",
                    n.driftType === "critical" ? "text-red-600" : "text-amber-600"
                  )} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {n.queryName}
                    </p>
                    {!n.read && (
                      <div className="h-2 w-2 rounded-full bg-blue-500 flex-shrink-0 mt-1.5" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge
                      variant={n.driftType === "critical" ? "destructive" : "secondary"}
                      className="text-xs"
                    >
                      {n.driftType === "critical" ? "🚨 Critical" : "⚠️ High"} drift
                    </Badge>
                    <span className="text-xs text-gray-600">
                      Score: {n.driftScore.toFixed(1)}
                      {n.change > 0 && ` (+${n.change.toFixed(1)})`}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    {formatTimeAgo(n.createdAt)}
                  </p>
                </div>

                <ExternalLink className="h-3.5 w-3.5 text-gray-400 flex-shrink-0 mt-1" />
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {notifications.length > 0 && (
          <div className="px-4 py-2 border-t">
            <button
              onClick={() => { setOpen(false); router.push("/drift") }}
              className="text-xs text-blue-600 hover:underline w-full text-center"
            >
              View all in Drift Radar →
            </button>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}