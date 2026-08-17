// app/(dashboard)/query-monitor/page.tsx
"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { useQueriesStore } from "@/app/store"
import { useSnapshotsStore } from "@/app/store"
import { useAuth } from "@/lib/middleware/authentication/auth-context"
import { useSecureApi } from "@/lib/api/use-secureApi"
import { toast } from "sonner"
import type { MonitorStats, SchedulerConfig, QueryExecution } from "@/types/type"
import {
  Play, Pause, RotateCcw, Settings, AlertTriangle, CheckCircle,
  Clock, Activity, TrendingUp, Zap, Calendar, Database, Timer,
  AlertCircle, Filter, Download, RefreshCw, Eye, BarChart3,
} from "lucide-react"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeResponseTime(v: number | string | undefined): number {
  if (typeof v === "number") return v
  if (typeof v === "string") { const n = parseFloat(v); return isNaN(n) ? 0 : n }
  return 0
}

function safeDomain(url: string): string {
  try { return new URL(url).hostname } catch { return url }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function QueryMonitor() {
  const { user } = useAuth()
  const { call: secureCall } = useSecureApi({ showErrorToast: true })

  const queries        = useQueriesStore(state => state.queries)        ?? []
  const runQuery       = useQueriesStore(state => state.runQuery)
  const fetchQueries   = useQueriesStore(state => state.fetchQueries)
  const queriesLoading = useQueriesStore(state => state.isLoading)

  const allSnapshots      = useSnapshotsStore(state => state.allSnapshots)      ?? []
  const fetchAllSnapshots = useSnapshotsStore(state => state.fetchAllSnapshots)

  const [executions,          setExecutions]       = useState<Map<string, QueryExecution>>(new Map())
  const [executionQueue,      setExecutionQueue]   = useState<string[]>([])
  const [selectedQueryIds,    setSelectedQueryIds] = useState<Set<string>>(new Set())
  const [isMonitoring,        setIsMonitoring]     = useState(false)
  const [monitoringStartTime, setMonitoringStartTime] = useState<number | null>(null)
  const [selectedCategory,    setSelectedCategory] = useState("all")
  const [searchFilter,        setSearchFilter]     = useState("")
  const [autoRefresh,         setAutoRefresh]      = useState(false)
  const [refreshInterval,     setRefreshInterval]  = useState(30)
  const [isTriggeringCron,    setIsTriggeringCron] = useState(false)
  const [sortBy,              setSortBy]           = useState<"name" | "lastRun" | "successRate" | "avgTime">("lastRun")

  // ✅ FIX: ref to prevent concurrent queue processing — the root cause
  // of the infinite loop. Without this, multiple processQueue calls could
  // run simultaneously, each re-queuing the same item.
  const isProcessingQueue = useRef(false)
  const isRefreshing = useRef(false)

  const [schedulerConfig, setSchedulerConfig] = useState<SchedulerConfig>({
    isEnabled:              true,
    batchSize:              5,
    intervalBetweenQueries: 2000,
    maxConcurrent:          3,
    retryAttempts:          3,
    retryDelay:             5000,
    autoRetryOnFailure:     true,
  })

  const refreshMonitorData = useCallback(async () => {
    if (!user?.$id || isRefreshing.current) return
    isRefreshing.current = true
    try {
      await Promise.allSettled([
        fetchQueries(user.$id),
        fetchAllSnapshots(user.$id),
      ])
    } finally {
      isRefreshing.current = false
    }
  }, [user?.$id, fetchQueries, fetchAllSnapshots])

  // ── Init ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    void refreshMonitorData()
  }, [refreshMonitorData])

  // ── Auto-refresh ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!autoRefresh || !user?.$id) return
    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout>

    const scheduleNextRefresh = () => {
      timeoutId = setTimeout(async () => {
        if (cancelled) return
        // Avoid background polling while the tab is not visible.
        if (document.visibilityState === "visible") await refreshMonitorData()
        if (!cancelled) scheduleNextRefresh()
      }, refreshInterval * 1000)
    }

    scheduleNextRefresh()
    return () => {
      cancelled = true
      clearTimeout(timeoutId)
    }
  }, [autoRefresh, refreshInterval, user?.$id, refreshMonitorData])

  // ── Filtering & sorting ────────────────────────────────────────────────────
  const calculateQuerySuccessRate = useCallback((queryId: string) => {
    const snaps = allSnapshots.filter(s => s.queryId === queryId)
    if (snaps.length === 0) return 0
    return (snaps.filter(s => s.results.length > 0).length / snaps.length) * 100
  }, [allSnapshots])

  const calculateQueryAverageTime = useCallback((queryId: string) => {
    const snaps = allSnapshots.filter(s => s.queryId === queryId)
    if (snaps.length === 0) return 0
    const total = snaps.reduce((sum, s) => sum + safeResponseTime(s.metadata?.responseTime), 0)
    return total / snaps.length
  }, [allSnapshots])

  const filteredQueries = useMemo(() => {
    let list = queries.filter(q => q.userId === user?.$id)
    if (selectedCategory !== "all") list = list.filter(q => q.category === selectedCategory)
    if (searchFilter) {
      const lc = searchFilter.toLowerCase()
      list = list.filter(q =>
        q.name.toLowerCase().includes(lc) || q.query.toLowerCase().includes(lc)
      )
    }
    list.sort((a, b) => {
      switch (sortBy) {
        case "name":        return a.name.localeCompare(b.name)
        case "lastRun":     return (Number(b.lastRun) || 0) - (Number(a.lastRun) || 0)
        case "successRate": return calculateQuerySuccessRate(b.id) - calculateQuerySuccessRate(a.id)
        case "avgTime":     return calculateQueryAverageTime(a.id) - calculateQueryAverageTime(b.id)
        default:            return 0
      }
    })
    return list
  }, [queries, user?.$id, selectedCategory, searchFilter, sortBy,
      calculateQuerySuccessRate, calculateQueryAverageTime])

  const categories = useMemo(() => {
    const cats = [...new Set(queries.map(q => q.category))].filter(Boolean)
    return ["all", ...cats]
  }, [queries])

  const monitorStats: MonitorStats = useMemo(() => {
    const arr = Array.from(executions.values())
    const succeeded = arr.filter(e => e.status === "success")
    return {
      totalExecutions:     arr.length,
      successRate:         arr.length > 0 ? (succeeded.length / arr.length) * 100 : 0,
      averageResponseTime: succeeded.length > 0
        ? succeeded.reduce((s, e) => s + safeResponseTime(e.results?.responseTime), 0) / succeeded.length
        : 0,
      totalResults:   arr.reduce((s, e) => s + (e.results?.totalResults ?? 0), 0),
      activeQueries:  arr.filter(e => e.status === "running").length,
      queuedQueries:  executionQueue.length,
      failedQueries:  arr.filter(e => e.status === "error").length,
      uptime:         monitoringStartTime ? Date.now() - monitoringStartTime : 0,
    }
  }, [executions, executionQueue, monitoringStartTime])

  // ── Query execution ────────────────────────────────────────────────────────
  const executeQuery = useCallback(async (queryId: string, isRetry = false) => {
    const query = queries.find(q => q.id === queryId)
    if (!query) return

    const execution: QueryExecution = {
      id:         `${queryId}-${Date.now()}`,
      queryId,
      status:     "running",
      progress:   0,
      startTime:  Date.now(),
      retryCount: isRetry ? (executions.get(queryId)?.retryCount ?? 0) + 1 : 0,
    }

    setExecutions(prev => new Map(prev).set(queryId, execution))

    const progressId = setInterval(() => {
      setExecutions(prev => {
        const cur = prev.get(queryId)
        if (cur?.status === "running" && (cur.progress ?? 0) < 90) {
          return new Map(prev).set(queryId, {
            ...cur,
            progress: Math.min((cur.progress ?? 0) + Math.random() * 15, 90),
          })
        }
        return prev
      })
    }, 300)

    try {
      const result = await runQuery(queryId)
      clearInterval(progressId)

      const avgPosition = result?.results?.length > 0
        ? result.results.reduce((s: number, r: any) => s + (r.position ?? 0), 0) / result.results.length
        : 0

      const topDomains: string[] = result?.results
        ? [...new Set(result.results.map((r: any) => safeDomain(r.url)))].slice(0, 5) as string[]
        : []

      setExecutions(prev => new Map(prev).set(queryId, {
        ...execution,
        status:   "success",
        progress: 100,
        endTime:  Date.now(),
        duration: Date.now() - execution.startTime!,
        results: {
          totalResults:    result?.results?.length ?? 0,
          responseTime:    safeResponseTime(result?.metadata?.responseTime),
          timestamp:       result?.timestamp ? new Date(result.timestamp) : new Date(),
          averagePosition: avgPosition,
          topDomains,
        },
      }))

      toast.success(`"${query.name}" completed`)

      // ✅ FIX: fire-and-forget — do NOT await fetchAllSnapshots inside
      // executeQuery. Awaiting it caused allSnapshots → processQueue
      // dependency chain to update mid-execution, re-triggering the queue.
      if (user?.$id) {
        setTimeout(() => fetchAllSnapshots(user.$id!), 500)
      }

    } catch (err) {
      clearInterval(progressId)
      const msg = err instanceof Error ? err.message : "Unknown error"

      const errExec: QueryExecution = {
        ...execution,
        status:   "error",
        progress: 0,
        endTime:  Date.now(),
        duration: Date.now() - execution.startTime!,
        error:    msg,
      }

      setExecutions(prev => new Map(prev).set(queryId, errExec))

      if (schedulerConfig.autoRetryOnFailure &&
          (errExec.retryCount ?? 0) < schedulerConfig.retryAttempts) {
        toast.info(`"${query.name}" failed — retrying in ${schedulerConfig.retryDelay / 1000}s`)
        setTimeout(() => executeQuery(queryId, true), schedulerConfig.retryDelay)
      } else {
        toast.error(`"${query.name}" failed: ${msg}`)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queries, runQuery, schedulerConfig, executions, user?.$id, fetchAllSnapshots])

  // ✅ FIX: processQueue with isProcessingQueue guard
  // Root cause of infinite loop:
  // 1. processQueue runs → executeQuery → fetchAllSnapshots (async)
  // 2. fetchAllSnapshots updates allSnapshots store
  // 3. allSnapshots is in executeQuery deps → executeQuery ref changes
  // 4. executeQuery in processQueue deps → processQueue ref changes
  // 5. processQueue in useEffect deps → effect re-runs
  // 6. Queue processes same item again → infinite loop
  //
  // Fix: isProcessingQueue ref gates entry, so even if the effect
  // re-fires while a query is running, it can't start another run.
  const processQueue = useCallback(async () => {
    if (isProcessingQueue.current) return
    if (executionQueue.length === 0 || !schedulerConfig.isEnabled) return

    const running = Array.from(executions.values()).filter(e => e.status === "running").length
    if (running >= schedulerConfig.maxConcurrent) return

    isProcessingQueue.current = true

    // Grab next item and remove it from queue atomically
    let nextQueryId: string | undefined
    setExecutionQueue(prev => {
      if (prev.length === 0) return prev
      nextQueryId = prev[0]
      return prev.slice(1)
    })

    if (!nextQueryId) {
      isProcessingQueue.current = false
      return
    }

    try {
      await executeQuery(nextQueryId)
    } finally {
      isProcessingQueue.current = false
    }
  }, [executionQueue, schedulerConfig, executions, executeQuery])

  // ✅ FIX: stable ref for processQueue — prevents stale closure in useEffect
  const processQueueRef = useRef(processQueue)
  useEffect(() => {
    processQueueRef.current = processQueue
  }, [processQueue])

  // ✅ FIX: only trigger on queue LENGTH changes, not on processQueue reference
  // changes. This breaks the dependency loop that caused infinite re-runs.
  useEffect(() => {
    if (executionQueue.length > 0 && schedulerConfig.isEnabled && !isProcessingQueue.current) {
      // Small delay to let state settle after setExecutionQueue
      const t = setTimeout(() => processQueueRef.current(), 50)
      return () => clearTimeout(t)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [executionQueue.length, schedulerConfig.isEnabled])

  // ── Action handlers ────────────────────────────────────────────────────────
  const handleRunQuery = useCallback((queryId: string) => {
    // Direct single-query run — bypasses queue entirely
    // so it can't be accidentally re-queued
    executeQuery(queryId)
  }, [executeQuery])

  const handleRunSelected = useCallback(() => {
    if (selectedQueryIds.size === 0) {
      toast.info("No queries selected — click cards to select them")
      return
    }
    // ✅ Snapshot selection before clearing — prevents double-queue
    const toRun = Array.from(selectedQueryIds)
    setSelectedQueryIds(new Set())  // clear immediately
    setExecutionQueue(prev => [...prev, ...toRun])
    toast.info(`Queued ${toRun.length} quer${toRun.length === 1 ? "y" : "ies"}`)
  }, [selectedQueryIds])

  const toggleQuerySelection = useCallback((queryId: string) => {
    setSelectedQueryIds(prev => {
      const next = new Set(prev)
      next.has(queryId) ? next.delete(queryId) : next.add(queryId)
      return next
    })
  }, [])

  const handleRunAllScheduled = useCallback(() => {
    if (isMonitoring) {
      setIsMonitoring(false)
      setExecutionQueue([])
      isProcessingQueue.current = false
      toast.info("Scheduler stopped")
      return
    }
    const scheduled = queries.filter(q => q.schedule?.enabled && q.userId === user?.$id)
    if (scheduled.length === 0) { toast.info("No scheduled queries found"); return }
    setIsMonitoring(true)
    setMonitoringStartTime(Date.now())
    setExecutionQueue(scheduled.map(q => q.id))
    toast.info(`Queued ${scheduled.length} scheduled queries`)
  }, [isMonitoring, queries, user?.$id])

  const handleRetryFailed = useCallback(() => {
    const failed = Array.from(executions.entries())
      .filter(([, e]) => e.status === "error").map(([id]) => id)
    if (failed.length === 0) { toast.info("No failed queries to retry"); return }
    setExecutionQueue(prev => [...prev, ...failed])
    toast.info(`Queued ${failed.length} failed queries for retry`)
  }, [executions])

  const handleClearResults = useCallback(() => {
    setExecutions(new Map())
    setExecutionQueue([])
    setMonitoringStartTime(null)
    setSelectedQueryIds(new Set())
    isProcessingQueue.current = false
    toast.success("Results cleared")
  }, [])

  const handleExportResults = useCallback(() => {
    const blob = new Blob([JSON.stringify({
      timestamp: new Date().toISOString(), stats: monitorStats,
      executions: Array.from(executions.values()), config: schedulerConfig,
    }, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url; a.download = `query-monitor-${new Date().toISOString().split("T")[0]}.json`
    a.click(); URL.revokeObjectURL(url)
    toast.success("Exported successfully")
  }, [monitorStats, executions, schedulerConfig])

  // ── Loading state ──────────────────────────────────────────────────────────
  if (queriesLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">Loading query monitor...</p>
        </div>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Query Monitor</h1>
          <p className="text-gray-600 mt-1">Real-time query execution monitoring and management</p>
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
            <span>{filteredQueries.length} queries</span>
            <span>{monitorStats.activeQueries} running</span>
            <span>{monitorStats.queuedQueries} queued</span>
            {selectedQueryIds.size > 0 && (
              <span className="text-blue-600 font-medium">{selectedQueryIds.size} selected</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 mr-2">
            <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} id="auto-refresh" />
            <label htmlFor="auto-refresh" className="text-sm text-gray-600">
              Auto-refresh ({refreshInterval}s)
            </label>
          </div>
          <Button variant="outline" size="sm" onClick={handleExportResults}>
            <Download className="w-4 h-4 mr-2" />Export
          </Button>
          <Button variant="outline" size="sm" onClick={handleClearResults}>
            <RotateCcw className="w-4 h-4 mr-2" />Clear
          </Button>
          <Button variant="outline" size="sm" onClick={handleRetryFailed}>
            <RefreshCw className="w-4 h-4 mr-2" />Retry Failed
          </Button>
          <Button
            variant="outline" size="sm"
            onClick={handleRunSelected}
            disabled={selectedQueryIds.size === 0}
          >
            <Play className="w-4 h-4 mr-2" />
            {selectedQueryIds.size > 0 ? `Run Selected (${selectedQueryIds.size})` : "Run Selected"}
          </Button>
          <Button
            onClick={handleRunAllScheduled}
            disabled={!isMonitoring && queries.filter(q => q.schedule?.enabled).length === 0}
            className={isMonitoring ? "bg-red-600 hover:bg-red-700" : ""}
          >
            {isMonitoring ? (
              <><Pause className="w-4 h-4 mr-2" />Stop ({executionQueue.length} left)</>
            ) : (
              <><Play className="w-4 h-4 mr-2" />Run All Scheduled</>
            )}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {[
          { label: "Total Queries",  value: filteredQueries.length,                                sub: `${queries.filter(q => q.schedule?.enabled).length} scheduled`, icon: Database,      color: "text-gray-900"    },
          { label: "Running",        value: monitorStats.activeQueries,                             sub: `${monitorStats.queuedQueries} queued`,  icon: Activity,      color: "text-orange-600" },
          { label: "Success Rate",   value: `${monitorStats.successRate.toFixed(1)}%`,              sub: `${monitorStats.totalExecutions} runs`,   icon: CheckCircle,   color: "text-emerald-600" },
          { label: "Avg Response",   value: `${monitorStats.averageResponseTime.toFixed(0)}ms`,     sub: "response time",                          icon: Timer,         color: "text-blue-600"   },
          { label: "Total Results",  value: monitorStats.totalResults.toLocaleString(),             sub: "results fetched",                        icon: BarChart3,     color: "text-purple-600" },
          { label: "Failed",         value: monitorStats.failedQueries,                             sub: "need retry",                             icon: AlertTriangle, color: "text-red-600"    },
          { label: "Session",        value: `${Math.floor(monitorStats.uptime / 60000)}m`,          sub: "uptime",                                 icon: Clock,         color: "text-indigo-600" },
        ].map(({ label, value, sub, icon: Icon, color }) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                <Icon className="w-4 h-4" />{label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${color}`}>{value}</div>
              <p className="text-xs text-gray-500">{sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-500" />
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>
                  {categories.map(c => (
                    <SelectItem key={c} value={c}>{c === "all" ? "All Categories" : c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Input placeholder="Search queries..." value={searchFilter}
              onChange={e => setSearchFilter(e.target.value)} className="w-48" />
            <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Sort by" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="lastRun">Last Run</SelectItem>
                <SelectItem value="successRate">Success Rate</SelectItem>
                <SelectItem value="avgTime">Avg Time</SelectItem>
              </SelectContent>
            </Select>
            <Select value={refreshInterval.toString()}
              onValueChange={v => setRefreshInterval(Number(v))}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10s refresh</SelectItem>
                <SelectItem value="30">30s refresh</SelectItem>
                <SelectItem value="60">1m refresh</SelectItem>
                <SelectItem value="300">5m refresh</SelectItem>
              </SelectContent>
            </Select>
            {(searchFilter || selectedCategory !== "all") && (
              <Button variant="ghost" size="sm"
                onClick={() => { setSearchFilter(""); setSelectedCategory("all") }}>
                Clear filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="monitor" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="monitor"><Activity className="w-4 h-4 mr-2" />Monitor</TabsTrigger>
          <TabsTrigger value="scheduler"><Calendar className="w-4 h-4 mr-2" />Scheduler</TabsTrigger>
          <TabsTrigger value="analytics"><TrendingUp className="w-4 h-4 mr-2" />Analytics</TabsTrigger>
          <TabsTrigger value="settings"><Settings className="w-4 h-4 mr-2" />Settings</TabsTrigger>
        </TabsList>

        {/* Monitor tab */}
        <TabsContent value="monitor" className="space-y-6">
          {filteredQueries.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <Activity className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Queries Found</h3>
                <p className="text-gray-500 mb-4">
                  {searchFilter || selectedCategory !== "all"
                    ? "No queries match your current filters."
                    : "Create some queries in Query Builder to start monitoring."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredQueries.map(query => {
                const execution   = executions.get(query.id)
                const querySnaps  = allSnapshots.filter(s => s.queryId === query.id)
                const successRate = calculateQuerySuccessRate(query.id)
                const avgTime     = calculateQueryAverageTime(query.id)
                const isSelected  = selectedQueryIds.has(query.id)
                const isRunning   = execution?.status === "running"
                const isQueued    = executionQueue.includes(query.id)

                return (
                  <Card
                    key={query.id}
                    onClick={() => toggleQuerySelection(query.id)}
                    className={[
                      "cursor-pointer transition-all select-none",
                      isSelected  ? "ring-2 ring-blue-500 ring-offset-1" : "",
                      isRunning   ? "border-orange-300 bg-orange-50/50"  : "",
                      execution?.status === "success" ? "border-green-200 bg-green-50/30" : "",
                      execution?.status === "error"   ? "border-red-200 bg-red-50/30"     : "",
                    ].filter(Boolean).join(" ")}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {/* Selection indicator */}
                          <div className={[
                            "w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center",
                            isSelected
                              ? "bg-blue-600 border-blue-600"
                              : "border-gray-300 bg-white",
                          ].join(" ")}>
                            {isSelected && (
                              <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5"
                                  strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </div>
                          <CardTitle className="text-sm font-medium truncate">{query.name}</CardTitle>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {isQueued && !isRunning && (
                            <Badge variant="outline" className="text-xs bg-yellow-50 border-yellow-200 text-yellow-700">
                              Queued
                            </Badge>
                          )}
                          {query.schedule?.enabled && (
                            <Badge variant="secondary" className="text-xs">
                              <Calendar className="w-3 h-3 mr-1" />Scheduled
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-xs">{query.category}</Badge>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-3">
                      {/* Status */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {isRunning && <Activity className="w-4 h-4 text-orange-500 animate-pulse" />}
                          {execution?.status === "success" && <CheckCircle className="w-4 h-4 text-green-600" />}
                          {execution?.status === "error"   && <AlertCircle  className="w-4 h-4 text-red-600"   />}
                          {!execution && <div className="w-4 h-4 rounded-full border-2 border-gray-200" />}
                          <span className="text-sm font-medium capitalize text-gray-700">
                            {execution?.status ?? "Ready"}
                          </span>
                        </div>
                        {isRunning && (
                          <span className="text-xs text-orange-600 font-medium">
                            {(execution?.progress ?? 0).toFixed(0)}%
                          </span>
                        )}
                      </div>

                      {isRunning && (
                        <Progress value={execution?.progress ?? 0} className="h-1.5" />
                      )}

                      {/* Results */}
                      {execution?.results && (
                        <div className="grid grid-cols-2 gap-1 text-xs bg-gray-50 rounded p-2">
                          <div><span className="text-gray-500">Results:</span> <span className="font-medium">{execution.results.totalResults}</span></div>
                          <div><span className="text-gray-500">Time:</span> <span className="font-medium">{safeResponseTime(execution.results.responseTime).toFixed(0)}ms</span></div>
                          {(execution.results.averagePosition ?? 0) > 0 && (
                            <div className="col-span-2">
                              <span className="text-gray-500">Avg pos:</span>{" "}
                              <span className="font-medium">#{(execution.results.averagePosition ?? 0).toFixed(1)}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {execution?.error && (
                        <p className="text-xs text-red-600 bg-red-50 border border-red-100 p-2 rounded truncate">
                          {execution.error}
                        </p>
                      )}

                      {/* Stats */}
                      <div className="grid grid-cols-3 gap-1 text-xs border-t pt-2">
                        <div className="text-center">
                          <div className="font-medium text-gray-900">{successRate.toFixed(0)}%</div>
                          <div className="text-gray-400">success</div>
                        </div>
                        <div className="text-center">
                          <div className="font-medium text-gray-900">{avgTime.toFixed(0)}ms</div>
                          <div className="text-gray-400">avg time</div>
                        </div>
                        <div className="text-center">
                          <div className="font-medium text-gray-900">{querySnaps.length}</div>
                          <div className="text-gray-400">snapshots</div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div
                        className="flex gap-2 pt-1"
                        onClick={e => e.stopPropagation()} // prevent card click = select
                      >
                        <Button size="sm" variant="outline"
                          onClick={() => handleRunQuery(query.id)}
                          disabled={isRunning}
                          className="flex-1 h-8 text-xs"
                        >
                          <Play className="w-3 h-3 mr-1" />
                          {isRunning ? "Running..." : "Run"}
                        </Button>
                        {execution?.status === "error" && (
                          <Button size="sm" variant="outline"
                            onClick={() => handleRunQuery(query.id)}
                            className="flex-1 h-8 text-xs"
                          >
                            <RefreshCw className="w-3 h-3 mr-1" />Retry
                          </Button>
                        )}
                        <Button size="sm" variant="ghost"
                          onClick={() => window.location.href = `/snapshots?queryId=${query.id}`}
                          className="h-8 px-2"
                        >
                          <Eye className="w-3 h-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* Scheduler tab */}
        <TabsContent value="scheduler" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Execution Configuration</CardTitle>
              <p className="text-sm text-gray-600">Controls for the in-browser queue</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Enable Queue</label>
                  <Switch checked={schedulerConfig.isEnabled}
                    onCheckedChange={c => setSchedulerConfig(p => ({ ...p, isEnabled: c }))} />
                </div>
                <div>
                  <label className="text-sm font-medium">Max Concurrent</label>
                  <Input type="number" min="1" max="10" value={schedulerConfig.maxConcurrent}
                    onChange={e => setSchedulerConfig(p => ({ ...p, maxConcurrent: parseInt(e.target.value) || 3 }))}
                    className="mt-1" />
                </div>
                <div>
                  <label className="text-sm font-medium">Interval Between Queries (ms)</label>
                  <Input type="number" min="1000" max="60000" step="1000"
                    value={schedulerConfig.intervalBetweenQueries}
                    onChange={e => setSchedulerConfig(p => ({ ...p, intervalBetweenQueries: parseInt(e.target.value) || 2000 }))}
                    className="mt-1" />
                </div>
                <div>
                  <label className="text-sm font-medium">Retry Attempts</label>
                  <Input type="number" min="0" max="10" value={schedulerConfig.retryAttempts}
                    onChange={e => setSchedulerConfig(p => ({ ...p, retryAttempts: parseInt(e.target.value) || 3 }))}
                    className="mt-1" />
                </div>
                <div>
                  <label className="text-sm font-medium">Retry Delay (ms)</label>
                  <Input type="number" min="1000" max="300000" step="1000"
                    value={schedulerConfig.retryDelay}
                    onChange={e => setSchedulerConfig(p => ({ ...p, retryDelay: parseInt(e.target.value) || 5000 }))}
                    className="mt-1" />
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Auto-retry on Failure</label>
                  <Switch checked={schedulerConfig.autoRetryOnFailure}
                    onCheckedChange={c => setSchedulerConfig(p => ({ ...p, autoRetryOnFailure: c }))} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Queue status */}
          <Card>
            <CardHeader>
              <CardTitle>Execution Queue ({executionQueue.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {executionQueue.length > 0 ? (
                <div className="space-y-2">
                  {executionQueue.slice(0, 10).map((queryId, i) => {
                    const q = queries.find(x => x.id === queryId)
                    return (
                      <div key={`${queryId}-${i}`}
                        className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                        <div>
                          <span className="font-medium">{q?.name ?? "Unknown"}</span>
                          <span className="text-xs text-gray-500 ml-2">#{i + 1}</span>
                        </div>
                        <Badge variant="outline">{q?.category}</Badge>
                      </div>
                    )
                  })}
                  {executionQueue.length > 10 && (
                    <p className="text-sm text-gray-500 text-center">
                      +{executionQueue.length - 10} more
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-center text-sm text-gray-500 py-8">Queue is empty</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics tab */}
        <TabsContent value="analytics" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Execution History</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Array.from(executions.values())
                    .sort((a, b) => (b.startTime ?? 0) - (a.startTime ?? 0))
                    .slice(0, 10)
                    .map(e => {
                      const q = queries.find(x => x.id === e.queryId)
                      return (
                        <div key={e.id} className="flex items-center justify-between p-2 border rounded text-sm">
                          <div>
                            <p className="font-medium">{q?.name}</p>
                            <p className="text-xs text-gray-500">
                              {e.startTime ? new Date(e.startTime).toLocaleTimeString() : "—"}
                            </p>
                          </div>
                          <div className="text-right">
                            <Badge variant={
                              e.status === "success" ? "default" :
                              e.status === "error"   ? "destructive" :
                              e.status === "running" ? "secondary" : "outline"
                            }>{e.status}</Badge>
                            {e.duration && (
                              <p className="text-xs text-gray-500 mt-0.5">{(e.duration / 1000).toFixed(1)}s</p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  {executions.size === 0 && (
                    <p className="text-center text-sm text-gray-500 py-4">No executions yet</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Performance</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {[
                  { label: "Success Rate",    value: monitorStats.successRate,         display: `${monitorStats.successRate.toFixed(1)}%`,          showBar: true },
                  { label: "Avg Response",    value: null,                             display: `${monitorStats.averageResponseTime.toFixed(0)}ms`,  showBar: false },
                  { label: "Total Runs",      value: null,                             display: String(monitorStats.totalExecutions),                showBar: false },
                  { label: "Failed",          value: null,                             display: String(monitorStats.failedQueries),                  showBar: false, red: true },
                ].map(({ label, value, display, showBar, red }) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">{label}</span>
                    <div className="flex items-center gap-2">
                      {showBar && value !== null && <Progress value={value} className="w-20 h-2" />}
                      <span className={`text-sm font-medium ${red ? "text-red-600" : "text-gray-900"}`}>
                        {display}
                      </span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Settings tab */}
        <TabsContent value="settings" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Monitor Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Auto-refresh</label>
                  <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} />
                </div>
                <div>
                  <label className="text-sm font-medium">Refresh every (seconds)</label>
                  <Input type="number" min="5" max="300" value={refreshInterval}
                    onChange={e => setRefreshInterval(parseInt(e.target.value) || 30)}
                    className="mt-1" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* GitHub Actions cron info — honest, no fake start/stop */}
          <Card>
            <CardHeader>
              <CardTitle>Automatic Scheduling</CardTitle>
              <p className="text-sm text-gray-600">
                Queries with scheduling enabled run automatically via GitHub Actions
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-green-900">GitHub Actions Cron</p>
                  <p className="text-xs text-green-700">Fires every 30 minutes · UTC</p>
                </div>
                <Badge className="bg-green-600">Active</Badge>
              </div>
              <div className="text-xs text-gray-500 space-y-1">
                <p>• Runs independently of your browser session</p>
                <p>• Checks which queries are due on each trigger</p>
                <p>• Hourly queries run every ~60 minutes</p>
                <p>• Daily queries run every ~24 hours</p>
              </div>
              <Button
                variant="outline" size="sm"
                disabled={isTriggeringCron}
                onClick={async () => {
                  setIsTriggeringCron(true)
                  try {
                    const result = await secureCall<{
                      success: boolean
                      message?: string
                      processed?: number
                    }>("POST", "/scheduler/trigger")
                    toast.success(result.message ?? `Manual run completed (${result.processed ?? 0} processed)`)
                    await refreshMonitorData()
                  } catch {
                    toast.error("Failed to trigger cron")
                  } finally {
                    setIsTriggeringCron(false)
                  }
                }}
              >
                <Play className="w-4 h-4 mr-2" />
                {isTriggeringCron ? "Running…" : "Trigger Manually"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Data Management</CardTitle></CardHeader>
            <CardContent className="flex gap-2">
              <Button variant="outline" onClick={handleClearResults}>
                <RotateCcw className="w-4 h-4 mr-2" />Clear Results
              </Button>
              <Button variant="outline" onClick={handleExportResults}>
                <Download className="w-4 h-4 mr-2" />Export History
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
