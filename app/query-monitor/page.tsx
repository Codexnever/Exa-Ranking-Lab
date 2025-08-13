// pages/query-monitor.tsx
"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
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
import { useAuth } from "@/lib/contexts/auth-context"
import { useSecureApi } from '@/lib/use-secureApi'
import { toast } from "sonner"
import type { MonitorStats, SchedulerConfig, QueryExecution } from "@/lib/type"
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Settings, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  Activity,
  TrendingUp,
  TrendingDown,
  Zap,
  Calendar,
  Database,
  Timer,
  AlertCircle,
  Filter,
  Download,
  RefreshCw,
  Eye,
  BarChart3
} from "lucide-react"


export default function QueryMonitor() {
  const { user } = useAuth()
  
   const { call: secureCall, loading: apiLoading, error: apiError } = useSecureApi({
    showErrorToast: true
  })
  // Store selectors
  const queries = useQueriesStore(state => state.queries) || []
  const runQuery = useQueriesStore(state => state.runQuery)
  const fetchQueries = useQueriesStore(state => state.fetchQueries)
  const queriesLoading = useQueriesStore(state => state.isLoading)
  
  const allSnapshots = useSnapshotsStore(state => state.allSnapshots) || []
  const fetchAllSnapshots = useSnapshotsStore(state => state.fetchAllSnapshots)
  
  // State management
  const [executions, setExecutions] = useState<Map<string, QueryExecution>>(new Map())
  const [executionQueue, setExecutionQueue] = useState<string[]>([])
  const [isMonitoring, setIsMonitoring] = useState(false)
  const [monitoringStartTime, setMonitoringStartTime] = useState<number | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string>("all")
  const [searchFilter, setSearchFilter] = useState("")
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [refreshInterval, setRefreshInterval] = useState(30) // seconds
  const [sortBy, setSortBy] = useState<'name' | 'lastRun' | 'successRate' | 'avgTime'>('lastRun')
  
  // ✅ NEW: Scheduler status state
  const [schedulerStatus, setSchedulerStatus] = useState<any>(null)
  
  // Scheduler configuration
  const [schedulerConfig, setSchedulerConfig] = useState<SchedulerConfig>({
    isEnabled: true,
    batchSize: 5,
    intervalBetweenQueries: 2000, // 2 seconds
    maxConcurrent: 3,
    retryAttempts: 3,
    retryDelay: 5000, // 5 seconds
    autoRetryOnFailure: true
  })

  // Initialize data
  useEffect(() => {
    if (user?.$id) {
      fetchQueries(user.$id)
      fetchAllSnapshots(user.$id)
      refreshSchedulerStatus() // ✅ Check scheduler status on load
    }
  }, [user?.$id, fetchQueries, fetchAllSnapshots])

  // Auto-refresh functionality
  useEffect(() => {
    if (!autoRefresh || !user?.$id) return

    const interval = setInterval(() => {
      fetchQueries(user.$id)
      fetchAllSnapshots(user.$id)
    }, refreshInterval * 1000)

    return () => clearInterval(interval)
  }, [autoRefresh, refreshInterval, user?.$id, fetchQueries, fetchAllSnapshots])

  // ✅ NEW: Scheduler control functions
 const refreshSchedulerStatus = async () => {
  try {
    const result = await secureCall('GET', '/scheduler/start')
    setSchedulerStatus(result.status)
  } catch (error) {
    console.error('Failed to get scheduler status:', error)
  }
}

  const handleStartScheduler = async () => {
    try {
      const response = await secureCall('POST', '/scheduler/start')
      const result = await response.json()
      
      if (result.success) {
        toast.success('Server scheduler started successfully')
        await refreshSchedulerStatus()
      } else {
        toast.error(result.error || 'Failed to start scheduler')
      }
    } catch (error) {
      toast.error('Failed to start scheduler')
    }
  }

 const handleStopScheduler = async () => {
  try {
    const result = await secureCall('POST', '/scheduler/stop')
    
    if (result.success) {
      toast.success('Server scheduler stopped')
      await refreshSchedulerStatus()
    } else {
      toast.error(result.error || 'Failed to stop scheduler')
    }
  } catch (error) {
      toast.error('Failed to stop scheduler')
  }
}

  const handleRunSelected = () => {
    const selectedQueries = Array.from(executions.keys())
    if (selectedQueries.length === 0) {
      toast.info("No queries selected")
      return
    }

    setExecutionQueue(prev => [...prev, ...selectedQueries])
    toast.info(`Queued ${selectedQueries.length} selected queries`)
  }

  // Filter and sort queries
  const filteredQueries = useMemo(() => {
    let filtered = queries.filter(q => q.userId === user?.$id)
    
    // Category filter
    if (selectedCategory !== "all") {
      filtered = filtered.filter(q => q.category === selectedCategory)
    }
    
    // Search filter
    if (searchFilter) {
      filtered = filtered.filter(q => 
        q.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
        q.query.toLowerCase().includes(searchFilter.toLowerCase())
      )
    }
    
    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name)
        case 'lastRun':
          return (Number(b.lastRun) || 0) - (Number(a.lastRun) || 0)
        case 'successRate':
          const aRate = calculateQuerySuccessRate(a.id)
          const bRate = calculateQuerySuccessRate(b.id)
          return bRate - aRate
        case 'avgTime':
          const aTime = calculateQueryAverageTime(a.id)
          const bTime = calculateQueryAverageTime(b.id)
          return aTime - bTime
        default:
          return 0
      }
    })
    
    return filtered
  }, [queries, user?.$id, selectedCategory, searchFilter, sortBy])

  // Calculate statistics
  const monitorStats: MonitorStats = useMemo(() => {
    const execArray = Array.from(executions.values())
    const totalExecutions = execArray.length
    const successfulExecutions = execArray.filter(e => e.status === 'success').length
    const activeQueries = execArray.filter(e => e.status === 'running').length
    const queuedQueries = executionQueue.length
    const failedQueries = execArray.filter(e => e.status === 'error').length
    
    const totalResponseTime = execArray
      .filter(e => e.results?.responseTime)
      .reduce((sum, e) => sum + (e.results?.responseTime || 0), 0)
    
    const totalResults = execArray
      .filter(e => e.results?.totalResults)
      .reduce((sum, e) => sum + (e.results?.totalResults || 0), 0)
    
    return {
      totalExecutions,
      successRate: totalExecutions > 0 ? (successfulExecutions / totalExecutions) * 100 : 0,
      averageResponseTime: successfulExecutions > 0 ? totalResponseTime / successfulExecutions : 0,
      totalResults,
      activeQueries,
      queuedQueries,
      failedQueries,
      uptime: monitoringStartTime ? Date.now() - monitoringStartTime : 0
    }
  }, [executions, executionQueue, monitoringStartTime])

  // Get unique categories
  const categories = useMemo(() => {
    const cats = [...new Set(queries.map(q => q.category))].filter(Boolean)
    return ['all', ...cats]
  }, [queries])

  // Calculate query success rate
  const calculateQuerySuccessRate = useCallback((queryId: string) => {
    const querySnapshots = allSnapshots.filter(s => s.queryId === queryId)
    if (querySnapshots.length === 0) return 0
    
    const successfulSnapshots = querySnapshots.filter(s => s.results.length > 0)
    return (successfulSnapshots.length / querySnapshots.length) * 100
  }, [allSnapshots])

  // Calculate query average response time
  const calculateQueryAverageTime = useCallback((queryId: string) => {
    const querySnapshots = allSnapshots.filter(s => s.queryId === queryId)
    if (querySnapshots.length === 0) return 0
    
    const totalTime = querySnapshots.reduce((sum: number, s: typeof querySnapshots[0]) => sum + (s.metadata.responseTime || 0), 0)
    return totalTime / querySnapshots.length
  }, [allSnapshots])

  // Enhanced query execution with queue management
  const executeQuery = useCallback(async (queryId: string, isRetry = false) => {
    const query = queries.find(q => q.id === queryId)
    if (!query) return

    // Create or update execution record
    const executionId = `${queryId}-${Date.now()}`
    const execution: QueryExecution = {
      id: executionId,
      queryId,
      status: 'running',
      progress: 0,
      startTime: Date.now(),
      retryCount: isRetry ? (executions.get(queryId)?.retryCount || 0) + 1 : 0
    }

    setExecutions(prev => new Map(prev).set(queryId, execution))

    // Progress simulation
    const progressInterval = setInterval(() => {
      setExecutions(prev => {
        const current = prev.get(queryId)
        if (current?.status === 'running' && current.progress < 90) {
          return new Map(prev).set(queryId, {
            ...current,
            progress: Math.min(current.progress + Math.random() * 15, 90)
          })
        }
        return prev
      })
    }, 300)

    try {
      const result = await runQuery(queryId)
      clearInterval(progressInterval)

      // Calculate additional metrics
      const querySnapshots = allSnapshots.filter(s => s.queryId === queryId)
      const averagePosition = result?.results?.length > 0 
        ? result.results.reduce((sum: number, r: { position?: number }) => sum + (r.position || 0), 0) / result.results.length
        : 0

      const topDomains: string[] = result?.results 
        ? [...new Set(result.results.map((r: { url: string }) => new URL(r.url).hostname))].slice(0, 5) as string[]
        : []

      const successExecution: QueryExecution = {
        ...execution,
        status: 'success',
        progress: 100,
        endTime: Date.now(),
        duration: Date.now() - execution.startTime!,
        results: {
          totalResults: result?.results?.length || 0,
          responseTime: result?.metadata?.responseTime || 0,
          timestamp: result?.timestamp ? new Date(result.timestamp) : new Date(),
          averagePosition,
          topDomains
        }
      }

      setExecutions(prev => new Map(prev).set(queryId, successExecution))
      toast.success(`Query "${query.name}" completed successfully!`)

      // Refresh snapshots data
      if (user?.$id) {
        await fetchAllSnapshots(user.$id)
      }

    } catch (error) {
      clearInterval(progressInterval)
      
      const errorExecution: QueryExecution = {
        ...execution,
        status: 'error',
        progress: 0,
        endTime: Date.now(),
        duration: Date.now() - execution.startTime!,
        error: error instanceof Error ? error.message : 'Unknown error'
      }

      setExecutions(prev => new Map(prev).set(queryId, errorExecution))

      // Auto-retry logic
      if (schedulerConfig.autoRetryOnFailure && 
          errorExecution.retryCount < schedulerConfig.retryAttempts) {
        
        toast.info(`Query "${query.name}" failed, retrying in ${schedulerConfig.retryDelay / 1000}s...`)
        
        setTimeout(() => {
          executeQuery(queryId, true)
        }, schedulerConfig.retryDelay)
      } else {
        toast.error(`Query "${query.name}" failed: ${errorExecution.error}`)
      }
    }
  }, [queries, runQuery, allSnapshots, schedulerConfig, executions, user?.$id, fetchAllSnapshots])

  // Queue management
  const processQueue = useCallback(async () => {
    if (executionQueue.length === 0 || !schedulerConfig.isEnabled) return

    const currentRunning = Array.from(executions.values())
      .filter(e => e.status === 'running').length

    if (currentRunning >= schedulerConfig.maxConcurrent) return

    const nextQueryId = executionQueue[0]
    setExecutionQueue(prev => prev.slice(1))

    await executeQuery(nextQueryId)

    // Schedule next query
    if (executionQueue.length > 0) {
      setTimeout(() => processQueue(), schedulerConfig.intervalBetweenQueries)
    }
  }, [executionQueue, schedulerConfig, executions, executeQuery])

  // Process queue when it changes
  useEffect(() => {
    if (executionQueue.length > 0 && schedulerConfig.isEnabled) {
      processQueue()
    }
  }, [executionQueue, processQueue, schedulerConfig.isEnabled])

  // Enhanced handlers
  const handleRunQuery = (queryId: string) => {
    executeQuery(queryId)
  }

  const handleRunAllScheduled = () => {
    if (isMonitoring) {
      setIsMonitoring(false)
      setExecutionQueue([])
      return
    }

    const scheduledQueries = queries.filter(q => q.schedule?.enabled && q.userId === user?.$id)
    
    if (scheduledQueries.length === 0) {
      toast.info("No scheduled queries found")
      return
    }

    setIsMonitoring(true)
    setMonitoringStartTime(Date.now())
    setExecutionQueue(scheduledQueries.map(q => q.id))
    
    toast.info(`Queued ${scheduledQueries.length} queries for execution`)
  }

  const handleRetryFailed = () => {
    const failedQueries = Array.from(executions.entries())
      .filter(([_, execution]) => execution.status === 'error')
      .map(([queryId]) => queryId)

    if (failedQueries.length === 0) {
      toast.info("No failed queries to retry")
      return
    }

    setExecutionQueue(prev => [...prev, ...failedQueries])
    toast.info(`Queued ${failedQueries.length} failed queries for retry`)
  }

  const handleClearResults = () => {
    setExecutions(new Map())
    setExecutionQueue([])
    setMonitoringStartTime(null)
    toast.success("Results cleared")
  }

  const handleExportResults = () => {
    const data = {
      timestamp: new Date().toISOString(),
      stats: monitorStats,
      executions: Array.from(executions.values()),
      config: schedulerConfig
    }

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `query-monitor-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)

    toast.success("Results exported successfully")
  }

  // Loading state
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

  return (
    <div className="space-y-6">
      {/* Enhanced Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Query Monitor</h1>
          <p className="text-gray-600 mt-1">Real-time query execution monitoring and management</p>
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
            <span>{filteredQueries.length} queries</span>
            <span>{monitorStats.activeQueries} running</span>
            <span>{monitorStats.queuedQueries} queued</span>
            {monitoringStartTime && (
              <span>Uptime: {Math.floor((Date.now() - monitoringStartTime) / 60000)}m</span>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 mr-4">
            <Switch
              checked={autoRefresh}
              onCheckedChange={setAutoRefresh}
              id="auto-refresh"
            />
            <label htmlFor="auto-refresh" className="text-sm text-gray-600">
              Auto-refresh ({refreshInterval}s)
            </label>
          </div>
          
          <Button variant="outline" size="sm" onClick={handleExportResults}>
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          
          <Button variant="outline" size="sm" onClick={handleClearResults}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Clear
          </Button>
          
          <Button variant="outline" size="sm" onClick={handleRetryFailed}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry Failed
          </Button>
          
          {/* ✅ NEW: Add Run Selected button */}
          <Button variant="outline" size="sm" onClick={handleRunSelected}>
            <Play className="w-4 h-4 mr-2" />
            Run Selected
          </Button>
          
          <Button
            onClick={handleRunAllScheduled}
            disabled={queries.filter(q => q.schedule?.enabled).length === 0}
            className={isMonitoring ? "bg-red-600 hover:bg-red-700" : ""}
          >
            {isMonitoring ? (
              <>
                <Pause className="w-4 h-4 mr-2" />
                Stop ({executionQueue.length} queued)
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Run All Scheduled
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Enhanced Statistics Dashboard */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <Database className="w-4 h-4" />
              Total Queries
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{filteredQueries.length}</div>
            <p className="text-xs text-gray-500">
              {queries.filter(q => q.schedule?.enabled).length} scheduled
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Running
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{monitorStats.activeQueries}</div>
            <p className="text-xs text-gray-500">
              {monitorStats.queuedQueries} queued
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              Success Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              {monitorStats.successRate.toFixed(1)}%
            </div>
            <p className="text-xs text-gray-500">
              {monitorStats.totalExecutions} total runs
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <Timer className="w-4 h-4" />
              Avg Response
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {monitorStats.averageResponseTime.toFixed(0)}ms
            </div>
            <p className="text-xs text-gray-500">
              response time
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Total Results
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {monitorStats.totalResults.toLocaleString()}
            </div>
            <p className="text-xs text-gray-500">
              search results
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Failed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{monitorStats.failedQueries}</div>
            <p className="text-xs text-gray-500">
              need retry
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Uptime
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-indigo-600">
              {Math.floor(monitorStats.uptime / 60000)}m
            </div>
            <p className="text-xs text-gray-500">
              monitoring time
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Filters & Controls
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Category:</label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(cat => (
                    <SelectItem key={cat} value={cat}>
                      {cat === 'all' ? 'All Categories' : cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Search:</label>
              <Input
                placeholder="Filter queries..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-48"
              />
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Sort:</label>
              <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="lastRun">Last Run</SelectItem>
                  <SelectItem value="successRate">Success Rate</SelectItem>
                  <SelectItem value="avgTime">Avg Time</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Refresh:</label>
              <Select value={refreshInterval.toString()} onValueChange={(value) => setRefreshInterval(Number(value))}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10s</SelectItem>
                  <SelectItem value="30">30s</SelectItem>
                  <SelectItem value="60">1m</SelectItem>
                  <SelectItem value="300">5m</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Content Tabs */}
      <Tabs defaultValue="monitor" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="monitor">
            <Activity className="w-4 h-4 mr-2" />
            Monitor
          </TabsTrigger>
          <TabsTrigger value="scheduler">
            <Calendar className="w-4 h-4 mr-2" />
            Scheduler
          </TabsTrigger>
          <TabsTrigger value="analytics">
            <TrendingUp className="w-4 h-4 mr-2" />
            Analytics
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings className="w-4 h-4 mr-2" />
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="monitor" className="space-y-6">
          {/* Query Execution Grid */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredQueries.map((query) => {
              const execution = executions.get(query.id)
              const querySnapshots = allSnapshots.filter(s => s.queryId === query.id)
              const successRate = calculateQuerySuccessRate(query.id)
              const avgTime = calculateQueryAverageTime(query.id)

              return (
                <Card key={query.id} className={`
                  ${execution?.status === 'running' ? 'border-orange-300 bg-orange-50' : ''}
                  ${execution?.status === 'success' ? 'border-green-300 bg-green-50' : ''}
                  ${execution?.status === 'error' ? 'border-red-300 bg-red-50' : ''}
                `}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium truncate">
                        {query.name}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        {query.schedule?.enabled && (
                          <Badge variant="secondary" className="text-xs">
                            <Calendar className="w-3 h-3 mr-1" />
                            Scheduled
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-xs">
                          {query.category}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="space-y-3">
                    {/* Status and Progress */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {execution?.status === 'running' && (
                          <Activity className="w-4 h-4 text-orange-600 animate-pulse" />
                        )}
                        {execution?.status === 'success' && (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        )}
                        {execution?.status === 'error' && (
                          <AlertCircle className="w-4 h-4 text-red-600" />
                        )}
                        <span className="text-sm font-medium capitalize">
                          {execution?.status || 'Idle'}
                        </span>
                      </div>
                      
                      {execution?.status === 'running' && (
                        <span className="text-xs text-gray-500">
                          {execution.progress.toFixed(0)}%
                        </span>
                      )}
                    </div>

                    {/* Progress Bar */}
                    {execution?.status === 'running' && (
                      <Progress value={execution.progress} className="h-2" />
                    )}

                    {/* Results Summary */}
                    {execution?.results && (
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-gray-500">Results:</span>
                          <span className="font-medium ml-1">
                            {execution.results.totalResults}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500">Time:</span>
                          <span className="font-medium ml-1">
                            {execution.results.responseTime}ms
                          </span>
                        </div>
                        {execution.results.averagePosition && (
                          <div className="col-span-2">
                            <span className="text-gray-500">Avg Position:</span>
                            <span className="font-medium ml-1">
                              {execution.results.averagePosition.toFixed(1)}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Error Display */}
                    {execution?.error && (
                      <div className="text-xs text-red-600 bg-red-100 p-2 rounded">
                        {execution.error}
                      </div>
                    )}

                    {/* Historical Stats */}
                    <div className="grid grid-cols-2 gap-2 text-xs border-t pt-2">
                      <div>
                        <span className="text-gray-500">Success Rate:</span>
                        <span className="font-medium ml-1">
                          {successRate.toFixed(1)}%
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Avg Time:</span>
                        <span className="font-medium ml-1">
                          {avgTime.toFixed(0)}ms
                        </span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-gray-500">Total Runs:</span>
                        <span className="font-medium ml-1">
                          {querySnapshots.length}
                        </span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2 pt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRunQuery(query.id)}
                        disabled={execution?.status === 'running'}
                        className="flex-1"
                      >
                        <Play className="w-3 h-3 mr-1" />
                        Run
                      </Button>
                      
                      {execution?.status === 'error' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRunQuery(query.id)}
                          className="flex-1"
                        >
                          <RefreshCw className="w-3 h-3 mr-1" />
                          Retry
                        </Button>
                      )}
                      
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          window.location.href = `/snapshots?queryId=${query.id}`
                        }}
                      >
                        <Eye className="w-3 h-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {/* Empty State */}
          {filteredQueries.length === 0 && (
            <Card>
              <CardContent className="text-center py-12">
                <Activity className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Queries Found</h3>
                <p className="text-gray-500 mb-4">
                  {searchFilter || selectedCategory !== 'all' 
                    ? 'No queries match your current filters.'
                    : 'Create some queries to start monitoring their execution.'}
                </p>
                {(searchFilter || selectedCategory !== 'all') && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearchFilter('')
                      setSelectedCategory('all')
                    }}
                  >
                    Clear Filters
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="scheduler" className="space-y-6">
          {/* Scheduler Configuration */}
          <Card>
            <CardHeader>
              <CardTitle>Scheduler Configuration</CardTitle>
              <p className="text-sm text-gray-600">
                Configure automatic query execution settings
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Enable Scheduler</label>
                  <Switch
                    checked={schedulerConfig.isEnabled}
                    onCheckedChange={(checked) =>
                      setSchedulerConfig(prev => ({ ...prev, isEnabled: checked }))
                    }
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Max Concurrent Queries</label>
                  <Input
                    type="number"
                    min="1"
                    max="10"
                    value={schedulerConfig.maxConcurrent}
                    onChange={(e) =>
                      setSchedulerConfig(prev => ({ 
                        ...prev, 
                        maxConcurrent: parseInt(e.target.value) || 3 
                      }))
                    }
                    className="mt-1"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Interval Between Queries (ms)</label>
                  <Input
                    type="number"
                    min="1000"
                    max="60000"
                    step="1000"
                    value={schedulerConfig.intervalBetweenQueries}
                    onChange={(e) =>
                      setSchedulerConfig(prev => ({ 
                        ...prev, 
                        intervalBetweenQueries: parseInt(e.target.value) || 2000 
                      }))
                    }
                    className="mt-1"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Retry Attempts</label>
                  <Input
                    type="number"
                    min="0"
                    max="10"
                    value={schedulerConfig.retryAttempts}
                    onChange={(e) =>
                      setSchedulerConfig(prev => ({ 
                        ...prev, 
                        retryAttempts: parseInt(e.target.value) || 3 
                      }))
                    }
                    className="mt-1"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Retry Delay (ms)</label>
                  <Input
                    type="number"
                    min="1000"
                    max="300000"
                    step="1000"
                    value={schedulerConfig.retryDelay}
                    onChange={(e) =>
                      setSchedulerConfig(prev => ({ 
                        ...prev, 
                        retryDelay: parseInt(e.target.value) || 5000 
                      }))
                    }
                    className="mt-1"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Auto-retry on Failure</label>
                  <Switch
                    checked={schedulerConfig.autoRetryOnFailure}
                    onCheckedChange={(checked) =>
                      setSchedulerConfig(prev => ({ ...prev, autoRetryOnFailure: checked }))
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Queue Status */}
          <Card>
            <CardHeader>
              <CardTitle>Execution Queue</CardTitle>
              <p className="text-sm text-gray-600">
                Current queue status and upcoming executions
              </p>
            </CardHeader>
            <CardContent>
              {executionQueue.length > 0 ? (
                <div className="space-y-2">
                  {executionQueue.slice(0, 10).map((queryId, index) => {
                    const query = queries.find(q => q.id === queryId)
                    return (
                      <div key={`${queryId}-${index}`} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                        <div>
                          <span className="font-medium">{query?.name || 'Unknown Query'}</span>
                          <span className="text-xs text-gray-500 ml-2">
                            Position {index + 1} in queue
                          </span>
                        </div>
                        <Badge variant="outline">
                          {query?.category}
                        </Badge>
                      </div>
                    )
                  })}
                  {executionQueue.length > 10 && (
                    <p className="text-sm text-gray-500 text-center">
                      ... and {executionQueue.length - 10} more
                    </p>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Calendar className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No queries in queue</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          {/* Performance Analytics */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Execution History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {Array.from(executions.values())
                    .sort((a, b) => (b.startTime || 0) - (a.startTime || 0))
                    .slice(0, 10)
                    .map((execution) => {
                      const query = queries.find(q => q.id === execution.queryId)
                      return (
                        <div key={execution.id} className="flex items-center justify-between p-2 border rounded">
                          <div>
                            <p className="font-medium text-sm">{query?.name}</p>
                            <p className="text-xs text-gray-500">
                              {execution.startTime && new Date(execution.startTime).toLocaleString()}
                            </p>
                          </div>
                          <div className="text-right">
                            <Badge variant={
                              execution.status === 'success' ? 'default' :
                              execution.status === 'error' ? 'destructive' :
                              execution.status === 'running' ? 'secondary' : 'outline'
                            }>
                              {execution.status}
                            </Badge>
                            {execution.duration && (
                              <p className="text-xs text-gray-500">
                                {(execution.duration / 1000).toFixed(1)}s
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Performance Trends</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Overall Success Rate</span>
                    <div className="flex items-center gap-2">
                      <Progress value={monitorStats.successRate} className="w-20 h-2" />
                      <span className="text-sm font-medium">
                        {monitorStats.successRate.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Average Response Time</span>
                    <span className="text-sm font-medium">
                      {monitorStats.averageResponseTime.toFixed(0)}ms
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Total Executions</span>
                    <span className="text-sm font-medium">
                      {monitorStats.totalExecutions}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Failed Executions</span>
                    <span className="text-sm font-medium text-red-600">
                      {monitorStats.failedQueries}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="settings" className="space-y-6">
          {/* Monitor Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Monitor Settings</CardTitle>
              <p className="text-sm text-gray-600">
                Configure monitoring behavior and preferences
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Auto-refresh Data</label>
                  <Switch
                    checked={autoRefresh}
                    onCheckedChange={setAutoRefresh}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Refresh Interval (seconds)</label>
                  <Input
                    type="number"
                    min="5"
                    max="300"
                    value={refreshInterval}
                    onChange={(e) => setRefreshInterval(parseInt(e.target.value) || 30)}
                    className="mt-1"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Show Debug Info</label>
                  <Switch defaultChecked={process.env.NODE_ENV === 'development'} />
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Sound Notifications</label>
                  <Switch defaultChecked={false} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ✅ NEW: Server-Side Scheduler Control */}
          <Card>
            <CardHeader>
              <CardTitle>Server-Side Scheduler Control</CardTitle>
              <p className="text-sm text-gray-600">
                Control the automatic query execution scheduler
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Scheduler Status</p>
                  <p className="text-sm text-gray-500">
                    {schedulerStatus?.isRunning ? 'Running' : 'Stopped'} • 
                    Runs scheduled queries automatically on the server
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button 
                    onClick={handleStartScheduler} 
                    size="sm"
                    disabled={schedulerStatus?.isRunning}
                  >
                    <Play className="w-4 h-4 mr-2" />
                    {schedulerStatus?.isRunning ? 'Running' : 'Start Scheduler'}
                  </Button>
                  <Button 
                    onClick={handleStopScheduler} 
                    variant="outline" 
                    size="sm"
                    disabled={!schedulerStatus?.isRunning}
                  >
                    <Pause className="w-4 h-4 mr-2" />
                    Stop
                  </Button>
                </div>
              </div>
              
              <div className="text-xs text-gray-500">
                <p>• Automatic scheduler runs every 30 minutes</p>
                <p>• Processes all due scheduled queries</p>
                <p>• Independent of browser sessions</p>
              </div>
            </CardContent>
          </Card>

          {/* Data Management */}
          <Card>
            <CardHeader>
              <CardTitle>Data Management</CardTitle>
              <p className="text-sm text-gray-600">
                Manage monitoring data and history
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleClearResults}>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Clear All Results
                </Button>
                
                <Button variant="outline" onClick={handleExportResults}>
                  <Download className="w-4 h-4 mr-2" />
                  Export History
                </Button>
              </div>
              
              <div className="text-sm text-gray-500">
                <p>• Clear Results: Remove all execution history and reset statistics</p>
                <p>• Export History: Download execution data as JSON for analysis</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
