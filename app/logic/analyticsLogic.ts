// app/logic/analyticsLogic.ts
// Pure calculation functions — no React, no side effects, fully testable.

import type { QueryConfig, RankingSnapshot, TrendPoint } from "@/types/type"

// ─── Time range ───────────────────────────────────────────────────────────────

export function calculateTimeRangeMs(timeRange: string): number {
  switch (timeRange) {
    case "7d":  return 7   * 24 * 60 * 60 * 1000
    case "30d": return 30  * 24 * 60 * 60 * 1000
    case "90d": return 90  * 24 * 60 * 60 * 1000
    case "1y":  return 365 * 24 * 60 * 60 * 1000
    default:    return 30  * 24 * 60 * 60 * 1000
  }
}

// ─── Snapshot filtering ───────────────────────────────────────────────────────

export function filterSnapshots(
  snapshots: RankingSnapshot[],
  timeRangeMs: number,
  filters: { queryType?: string; domain?: string } = {},
  maxSnapshots = 1000,
  deduplicationStrategy: "latest" | "average" | "best" | "worst" | "none" = "latest"
): RankingSnapshot[] {
  if (!Array.isArray(snapshots)) return []

  const cutoff = new Date(Date.now() - timeRangeMs)

  let filtered = snapshots.filter(
    s => s?.timestamp && new Date(s.timestamp) > cutoff
  )

  if (filters.queryType) {
    filtered = filtered.filter(s => s.queryType === filters.queryType)
  }

  if (filters.domain) {
    filtered = filtered.filter(s =>
      s.results?.some(r => r.url?.includes(filters.domain!))
    )
  }

  if (deduplicationStrategy !== "none") {
    filtered = deduplicateSnapshots(filtered, deduplicationStrategy)
  }

  if (filtered.length > maxSnapshots) {
    console.warn(
      `[analyticsLogic] filterSnapshots: capped ${filtered.length} → ${maxSnapshots} snapshots`
    )
    filtered = filtered.slice(0, maxSnapshots)
  }

  return filtered
}

// ─── Deduplication ────────────────────────────────────────────────────────────

export function deduplicateSnapshots(
  snapshots: RankingSnapshot[],
  strategy: "latest" | "average" | "best" | "worst"
): RankingSnapshot[] {
  if (!Array.isArray(snapshots)) return []

  const grouped = new Map<string, RankingSnapshot[]>()

  for (const snapshot of snapshots) {
    if (!snapshot?.timestamp || !snapshot?.queryId) continue
    const date = new Date(snapshot.timestamp).toISOString().split("T")[0] // ✅ ISO, not locale
    const key  = `${snapshot.queryId}-${date}`
    const bucket = grouped.get(key) ?? []
    bucket.push(snapshot)
    grouped.set(key, bucket)
  }

  const result: RankingSnapshot[] = []

  for (const group of grouped.values()) {
    if (group.length === 1) { result.push(group[0]); continue }

    switch (strategy) {
      case "latest":
        result.push(group.reduce((a, b) =>
          new Date(b.timestamp) > new Date(a.timestamp) ? b : a
        ))
        break

      case "best":
        result.push(group.reduce((best, cur) => {
          const avgPos = (s: RankingSnapshot) =>
            s.results?.length
              ? s.results.reduce((sum, r) => sum + (r.position ?? 0), 0) / s.results.length
              : Infinity
          return avgPos(cur) < avgPos(best) ? cur : best
        }))
        break

      case "worst":
        result.push(group.reduce((worst, cur) => {
          const avgPos = (s: RankingSnapshot) =>
            s.results?.length
              ? s.results.reduce((sum, r) => sum + (r.position ?? 0), 0) / s.results.length
              : 0
          return avgPos(cur) > avgPos(worst) ? cur : worst
        }))
        break

      case "average":
        result.push(createAverageSnapshot(group))
        break
    }
  }

  return result
}

// ─── Average snapshot ─────────────────────────────────────────────────────────

export function createAverageSnapshot(snapshots: RankingSnapshot[]): RankingSnapshot {
  if (!Array.isArray(snapshots) || snapshots.length === 0) {
    throw new Error("[analyticsLogic] createAverageSnapshot: empty input")
  }
  if (snapshots.length === 1) return snapshots[0]

  const base = snapshots[0]
  const avgResponseTime =
    snapshots.reduce((sum, s) => sum + (Number(s.metadata?.responseTime) || 0), 0) / snapshots.length

  const urlMap = new Map<string, { positions: number[]; title: string; snippet: string; raw: any }>()

  for (const snapshot of snapshots) {
    for (const result of snapshot.results ?? []) {
      if (!result.url) continue
      const entry = urlMap.get(result.url) ?? { positions: [], title: result.title ?? "", snippet: result.snippet ?? "", raw: result }
      entry.positions.push(result.position ?? 0)
      urlMap.set(result.url, entry)
    }
  }

  const averagedResults = Array.from(urlMap.entries())
    .map(([url, data]) => ({
      ...data.raw,
      url,
      title:    data.title,
      snippet:  data.snippet,
      position: data.positions.reduce((sum, p) => sum + p, 0) / data.positions.length,
    }))
    .sort((a, b) => a.position - b.position)

  return {
    ...base,
    id:      `avg-${base.queryId}-${new Date(base.timestamp).toISOString().split("T")[0]}`,
    results: averagedResults,
    metadata: {
      ...base.metadata,
      responseTime: avgResponseTime,
      isAveraged:   true,
      sourceCount:  snapshots.length,
    } as any,
  }
}

// ─── Trend prediction ─────────────────────────────────────────────────────────

export function predictTrend(positions: number[], forecastDays = 7): number {
  if (!Array.isArray(positions) || positions.length < 2) return Math.max(1, positions?.[0] ?? 0)

  const n   = positions.length
  const sumX  = positions.reduce((s, _, i) => s + i, 0)
  const sumY  = positions.reduce((s, y) => s + y, 0)
  const sumXY = positions.reduce((s, y, i) => s + i * y, 0)
  const sumX2 = positions.reduce((s, _, i) => s + i * i, 0)

  const denom = n * sumX2 - sumX * sumX
  if (denom === 0) return Math.max(1, positions[0])

  const slope     = (n * sumXY - sumX * sumY) / denom
  const intercept = (sumY - slope * sumX) / n
  const predicted = intercept + slope * (n + forecastDays - 1)

  return Math.max(1, Math.round(predicted * 10) / 10) // ✅ never below 1, rounded
}

// ─── Category clustering ──────────────────────────────────────────────────────

export function clusterCategories(
  categories: Record<string, number>
): Record<string, number> {
  // Extend here to merge semantically similar categories
  return { ...categories }
}

// ─── Ranking trend ────────────────────────────────────────────────────────────

export function calculateRankingTrendData(snapshots: RankingSnapshot[]): TrendPoint[] {
  if (!Array.isArray(snapshots) || snapshots.length === 0) return []

  // ✅ ISO date key — locale-independent
  const toDateKey = (ts: string | Date) => new Date(ts).toISOString().split("T")[0]

  const dailyMap = new Map<string, number[]>()

  for (const snapshot of snapshots) {
    if (!snapshot?.timestamp || !Array.isArray(snapshot.results)) continue
    const key = toDateKey(snapshot.timestamp)
    const positions = snapshot.results.map(r => r.position ?? 0).filter(p => p > 0)
    const bucket = dailyMap.get(key) ?? []
    bucket.push(...positions)
    dailyMap.set(key, bucket)
  }

  const allPositions: number[] = []
  const allVolatilities: number[] = []

  const trend: TrendPoint[] = Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b)) // sort by ISO date string
    .map(([dateKey, positions]) => {
      const avgPosition = positions.length
        ? positions.reduce((s, p) => s + p, 0) / positions.length
        : 0

      const variance = positions.length
        ? positions.reduce((s, p) => s + Math.pow(p - avgPosition, 2), 0) / positions.length
        : 0

      const volatility = Math.sqrt(variance)

      allPositions.push(...positions)
      allVolatilities.push(volatility)

      // Format for display after sorting
      const displayDate = new Date(dateKey).toLocaleDateString("en-US", {
        month: "short",
        day:   "numeric",
      })

      return {
        date:              displayDate,
        avgPosition,
        volatility,
        count:             positions.length,
        predictedPosition: predictTrend(positions),
        isAnomaly:         false,
        anomalyType:       undefined as string | undefined,
        anomalyScore:      0,
        volatilityThreshold: 0,
      }
    })

  // ── Anomaly detection (2-sigma) ────────────────────────────────────────────
  if (trend.length > 2 && allPositions.length > 0) {
    const mean   = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length
    const stdDev = (arr: number[], m: number) =>
      Math.sqrt(arr.reduce((s, v) => s + Math.pow(v - m, 2), 0) / arr.length)

    const meanVol   = mean(allVolatilities)
    const sdVol     = stdDev(allVolatilities, meanVol)
    const meanPos   = mean(allPositions)
    const sdPos     = stdDev(allPositions, meanPos)
    const volThresh = meanVol + 2 * sdVol

    trend.forEach((point, i) => {
      point.volatilityThreshold = volThresh

      if (point.volatility > volThresh) {
        point.isAnomaly  = true
        point.anomalyType  = "high_volatility"
        point.anomalyScore = sdVol > 0 ? (point.volatility - meanVol) / sdVol : 0
      }

      if (sdPos > 0 && Math.abs(point.avgPosition - meanPos) > 2 * sdPos) {
        point.isAnomaly  = true
        point.anomalyType  = "position_spike"
        point.anomalyScore = Math.abs(point.avgPosition - meanPos) / sdPos
      }

      if (i > 0 && sdPos > 0) {
        const delta     = Math.abs(point.avgPosition - trend[i - 1].avgPosition)
        const threshold = sdPos * 1.5
        if (delta > threshold) {
          point.isAnomaly  = true
          point.anomalyType  = point.avgPosition > trend[i - 1].avgPosition
            ? "sudden_drop"
            : "sudden_rise"
          point.anomalyScore = delta / sdPos
        }
      }
    })
  }

  return trend
}

// ─── Category distribution ────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  company:           "#3b82f6",
  "research paper":  "#a21caf",
  news:              "#22c55e",
  pdf:               "#f59e42",
  github:            "#24292f",
  tweet:             "#1df27d",
  "personal site":   "#f43f5e",
  "linkedin profile":"#0a66c2",
  "financial report":"#eab308",
  documents:         "#f97316",
}

export function calculateCategoryDistribution(queries: QueryConfig[]) {
  if (!Array.isArray(queries) || queries.length === 0) return []

  const raw: Record<string, number> = {}
  for (const q of queries) {
    const cat = q.category || "unknown"
    raw[cat] = (raw[cat] ?? 0) + 1
  }

  const clustered = clusterCategories(raw)
  const total     = Object.values(clustered).reduce((s, v) => s + v, 0)

  return Object.entries(clustered)
    .map(([name, value]) => ({
      name,
      value,
      percent:   total > 0 ? (value / total) * 100 : 0,
      color:     CATEGORY_COLORS[name] ?? "#94a3b8",
      diversity: queries.length > 0 ? value / queries.length : 0,
    }))
    .sort((a, b) => b.percent - a.percent)
}

// ─── Success rate by hour ─────────────────────────────────────────────────────

export function calculateSuccessRateByHour(snapshots: RankingSnapshot[]) {
  type HourStats = { success: number; total: number; failures: number; times: number[] }
  const hourly: HourStats[] = Array.from({ length: 24 }, () => ({
    success: 0, total: 0, failures: 0, times: [],
  }))

  if (Array.isArray(snapshots)) {
    for (const snapshot of snapshots) {
      if (!snapshot?.timestamp || !snapshot?.metadata) continue
      const hour = new Date(snapshot.timestamp).getHours()
      hourly[hour].total++
      if (snapshot.results?.length) {
        hourly[hour].success++
        hourly[hour].times.push(Number(snapshot.metadata.responseTime) || 0)
      } else {
        hourly[hour].failures++
      }
    }
  }

  return hourly.map((stats, hour) => {
    const successRate  = stats.total > 0 ? (stats.success / stats.total) * 100 : 0
    const failureRate  = stats.total > 0 ? (stats.failures / stats.total) * 100 : 0
    const avgTime      = stats.times.length > 0
      ? stats.times.reduce((s, t) => s + t, 0) / stats.times.length
      : 0

    const variance = stats.times.length > 0
      ? stats.times.reduce((s, t) => s + Math.pow(t - avgTime, 2), 0) / stats.times.length
      : 0

    const se = stats.times.length > 0
      ? Math.sqrt(variance) / Math.sqrt(stats.times.length)
      : 0

    const margin = 1.96 * se
    // ✅ Lower bound clamped to 0 — response times can't be negative
    const confidenceInterval: [number, number] = [
      Math.max(0, avgTime - margin),
      avgTime + margin,
    ]

    return { hour, successRate, avgTime, failureRate, confidenceInterval }
  })
}

// ─── Top performing queries ───────────────────────────────────────────────────

export function calculateTopPerformingQueries(
  queries:   QueryConfig[],
  snapshots: RankingSnapshot[]
) {
  if (!Array.isArray(queries) || !Array.isArray(snapshots)) return []
  if (queries.length === 0 || snapshots.length === 0) return []

  const stats = new Map<string, { name: string; positions: number[] }>()

  for (const snapshot of snapshots) {
    const query = queries.find(q => q.id === snapshot.queryId)
    if (!query) continue

    const entry = stats.get(query.id) ?? { name: query.name, positions: [] }
    const results = snapshot.results ?? []
    if (results.length > 0) {
      const avg = results.reduce((s, r) => s + (r.position ?? 0), 0) / results.length
      entry.positions.push(avg)
    }
    stats.set(query.id, entry)
  }

  return Array.from(stats.values())
    .map(({ name, positions }) => {
      if (positions.length === 0) return null

      const avg      = positions.reduce((s, p) => s + p, 0) / positions.length
      const variance = positions.reduce((s, p) => s + Math.pow(p - avg, 2), 0) / positions.length
      const stability = Math.max(0, 100 - Math.sqrt(variance)) // ✅ clamped to 0

      const recent    = positions.slice(-3)
      const slope     = recent.length >= 2
        ? (recent[recent.length - 1] - recent[0]) / (recent.length - 1)
        : 0

      return {
        name,
        avgPosition:       Math.round(avg * 10) / 10,
        stability:         Math.round(stability * 10) / 10,
        trend:             slope < -0.1 ? "up" : slope > 0.1 ? "down" : "stable",
        trendSlope:        slope,
        predictedPosition: predictTrend(positions),
      }
    })
    .filter((q): q is NonNullable<typeof q> => q !== null)
    .sort((a, b) => b.stability - a.stability)
    .slice(0, 5)
}

// ─── Derived summary metrics ──────────────────────────────────────────────────

export function calculateSummaryMetrics(
  snapshots: RankingSnapshot[],
  queries:   QueryConfig[]
) {
  if (!snapshots.length) {
    return {
      rankingStability:    0,
      volatilityIndex:     0,
      domainDiversity:     0,
      avgResponseTime:     0,
      newContentDiscovery: 0,
      querySuccessRate:    0,
      trendSlope:          0,
      predictedPosition:   0,
      isAnomaly:           false,
    }
  }

  // Ranking stability: average of per-snapshot position std-dev inverted
  const stabilityScores = snapshots.map(s => {
    const positions = (s.results ?? []).map(r => r.position ?? 0)
    if (positions.length === 0) return 100
    const avg = positions.reduce((sum, p) => sum + p, 0) / positions.length
    const sd  = Math.sqrt(positions.reduce((sum, p) => sum + Math.pow(p - avg, 2), 0) / positions.length)
    return Math.max(0, 100 - sd)
  })
  const rankingStability = stabilityScores.reduce((s, v) => s + v, 0) / stabilityScores.length

  // Volatility: average per-snapshot position std-dev
  const volatilityIndex =
    snapshots.reduce((sum, s) => {
      const positions = (s.results ?? []).map(r => r.position ?? 0)
      if (!positions.length) return sum
      const avg = positions.reduce((a, p) => a + p, 0) / positions.length
      return sum + Math.sqrt(positions.reduce((a, p) => a + Math.pow(p - avg, 2), 0) / positions.length)
    }, 0) / snapshots.length

  // Domain diversity: unique domains / total results
  const allDomains = snapshots.flatMap(s => (s.results ?? []).map(r => r.domain).filter(Boolean))
  const domainDiversity = allDomains.length > 0
    ? new Set(allDomains).size / allDomains.length
    : 0

  // Avg response time
  const responseTimes = snapshots
    .map(s => s.metadata?.responseTime)
    .filter((t): t is number => typeof t === "number")
  const avgResponseTime = responseTimes.length
    ? responseTimes.reduce((s, t) => s + t, 0) / responseTimes.length
    : 0

  // New content discovery: % of results with unique URLs across all snapshots
  const allUrls     = snapshots.flatMap(s => (s.results ?? []).map(r => r.url).filter(Boolean))
  const uniqueUrls  = new Set(allUrls)
  const newContentDiscovery = allUrls.length > 0 ? uniqueUrls.size / allUrls.length : 0

  // Query success rate: % of snapshots with at least one result
  const querySuccessRate = snapshots.length > 0
    ? (snapshots.filter(s => (s.results?.length ?? 0) > 0).length / snapshots.length) * 100
    : 0

  // Global trend slope across all positions
  const allPositions = snapshots.flatMap(s => (s.results ?? []).map(r => r.position ?? 0))
  const trendSlope   = allPositions.length >= 2
    ? (() => {
        const n    = allPositions.length
        const sumX = allPositions.reduce((s, _, i) => s + i, 0)
        const sumY = allPositions.reduce((s, y) => s + y, 0)
        const sumXY = allPositions.reduce((s, y, i) => s + i * y, 0)
        const sumX2 = allPositions.reduce((s, _, i) => s + i * i, 0)
        const denom = n * sumX2 - sumX * sumX
        return denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom
      })()
    : 0

  const predictedPosition = predictTrend(allPositions)

  // Global anomaly: any snapshot with anomalous volatility
  const trendData = calculateRankingTrendData(snapshots)
  const isAnomaly = trendData.some(p => p.isAnomaly)

  return {
    rankingStability:    Math.round(rankingStability * 10) / 10,
    volatilityIndex:     Math.round(volatilityIndex * 10) / 10,
    domainDiversity:     Math.round(domainDiversity * 1000) / 1000,
    avgResponseTime:     Math.round(avgResponseTime),
    newContentDiscovery: Math.round(newContentDiscovery * 1000) / 1000,
    querySuccessRate:    Math.round(querySuccessRate * 10) / 10,
    trendSlope:          Math.round(trendSlope * 1000) / 1000,
    predictedPosition,
    isAnomaly,
  }
}

// ─── Master calculation ───────────────────────────────────────────────────────

export function analyticsCalculations(
  queries:   QueryConfig[] = [],
  snapshots: RankingSnapshot[] = [],
  timeRange: string,
  filters:   { queryType?: string; domain?: string } = {},
  deduplicationStrategy: "latest" | "average" | "best" | "worst" | "none" = "latest"
) {
  const timeRangeMs        = calculateTimeRangeMs(timeRange)
  const filteredSnapshots  = filterSnapshots(snapshots, timeRangeMs, filters, 1000, deduplicationStrategy)
  const rankingTrendData   = calculateRankingTrendData(filteredSnapshots)
  const categoryDistribution = calculateCategoryDistribution(queries)
  const successRateByHour  = calculateSuccessRateByHour(filteredSnapshots)
  const topPerformingQueries = calculateTopPerformingQueries(queries, filteredSnapshots)

  const queryPerformanceStats = topPerformingQueries
    .map(q => ({ name: q.name, lastPosition: q.avgPosition, predictedPosition: q.predictedPosition }))
    .sort((a, b) => (a.lastPosition ?? 0) - (b.lastPosition ?? 0))
    .slice(0, 5)

  // ✅ Full summary metrics — completes the AnalyticsData shape
  const summary = calculateSummaryMetrics(filteredSnapshots, queries)

  return {
    timeRangeMs,
    filteredSnapshots,
    rankingTrendData,
    categoryDistribution,
    successRateByHour,
    performanceData:       successRateByHour, // alias kept for backward compat
    topPerformingQueries,
    queryPerformanceStats,
    ...summary,             // spreads all 9 summary fields
  }
}
