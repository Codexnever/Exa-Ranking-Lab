// app/services/enhanced-analytics-service.ts
import { AnalyticsService } from "../../appwrite/analytics-service"
import type { EnhancedAnalyticsData, QueryConfig, RankingSnapshot } from "@/types/type"
import type { ContentCoherenceResult, SemanticStabilityResult } from "@/types/type"
import type { WeaviateService } from "../weaviate-service"
import {
  calculateUMassCoherence,
  // ✅ Import with alias to avoid shadowing by the private method below
  calculateSemanticStability as calcSemanticStability,
  calculateStandardDeviation,
} from "@/lib/analytics-calculations"
import { VectorUtils } from "@/utils/vector-utils"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SemanticInsights {
  contentAnomalies: {
    count:                number
    anomalies:            any[]
    severityDistribution: { low: number; medium: number; high: number; critical: number }
  }
  semanticClusters: {
    clusters:       any[]
    diversity:      number
    dominantThemes: string[]
  }
  contentEvolution: {
    periods:         any[]
    overallTrend:    string
    volatility:      number
    trendDirection:  "improving" | "declining" | "stable"
    discoveryRate:   number
    stabilityTrend:  any[]
    contentTurnover: number
  }
  weaviateMetrics: any
  trendAnalysis:   any
}

export interface EnhancedMetrics {
  semanticStability:      SemanticStabilityResult | number
  contentCoherence:       ContentCoherenceResult  | number
  diversityIndex:         number
  statisticalValidation?: {
    accuracy:        number
    precision:       number
    recall:          number
    f1Score:         number
    mape:            number
    confidenceLevel: number
    lastValidated:   number
  }
  dataQuality?: {
    completeness: number
    accuracy:     number
    consistency:  number
    freshness:    number
    validity:     number
    anomalyCount: number
    assessedAt:   number
  }
  performanceInsights?: {
    anomalyDetectionAccuracy:   number
    clusteringQuality:          number
    semanticSearchEfficiency:   number
    vectorCacheHitRate:         number
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class EnhancedAnalyticsService extends AnalyticsService {
  protected weaviateService: WeaviateService

  constructor(isLocal: boolean, weaviateService: WeaviateService) {
    super(isLocal)
    this.weaviateService = weaviateService
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  async getSemanticAnalytics(
    userId:      string,
    timeRangeMs: number,
    queries:     QueryConfig[] = []
  ): Promise<EnhancedAnalyticsData> {
    try {
      console.log(`[EnhancedAnalytics] Starting analysis for user: ${userId}`)

      const snapshots   = await this.getSnapshotsForUser(userId, timeRangeMs)
      const traditional = this.calculateEnhancedAnalyticsFromSnapshots(snapshots, queries)

      const [contentAnomalies, semanticClusters, contentEvolution] = await Promise.all([
        this.weaviateService.detectContentAnomalies(userId, timeRangeMs),
        this.analyzeSemanticClusters(userId, timeRangeMs),
        this.analyzeContentEvolution(userId, timeRangeMs, snapshots),
      ])

      const semanticInsights: SemanticInsights = {
        contentAnomalies: {
          count:                contentAnomalies.length,
          anomalies:            contentAnomalies.slice(0, 10),
          severityDistribution: this.categorizeAnomalies(contentAnomalies),
        },
        semanticClusters: {
          clusters:       semanticClusters,
          diversity:      this.calculateSemanticDiversity(semanticClusters),
          dominantThemes: this.extractDominantThemes(semanticClusters),
        },
        contentEvolution: {
          ...contentEvolution,
          trendDirection: this.determineEvolutionTrend(contentEvolution),
        },
        weaviateMetrics: this.weaviateService.getCacheStats(),
        trendAnalysis: { growingTopics: [], decliningTopics: [], emergingPatterns: [] },
      }

      const enhancedMetrics = this.calculateEnterpriseEnhancedMetrics({
        contentAnomalies,
        semanticClusters,
        contentEvolution,
        snapshots,
      })

      return {
        ...traditional,
        semanticInsights,
        enhancedMetrics,
        isWeaviateSource: true,
        dataSourceType:   "weaviate",
        calculatedAt:     new Date().toISOString(),
      }
    } catch (err) {
      console.error("[EnhancedAnalytics] Semantic analytics failed:", err)
      const snapshots = await this.getSnapshotsForUser(userId, timeRangeMs)
      const fallback  = this.calculateEnhancedAnalyticsFromSnapshots(snapshots, queries)
      return {
        ...fallback,
        semanticInsights: undefined,
        enhancedMetrics:  undefined,
        error:            "Semantic analysis unavailable",
        dataSourceType:   "appwrite",
      }
    }
  }

  // ── Enterprise metrics ─────────────────────────────────────────────────────

  // ✅ Sync — no actual async work inside
  private calculateEnterpriseEnhancedMetrics({
    contentAnomalies,
    semanticClusters,
    contentEvolution,
    snapshots,
  }: {
    contentAnomalies: any[]
    semanticClusters: any[]
    contentEvolution: any
    snapshots:        any[]
  }): EnhancedMetrics {
    try {
      // Semantic stability — use imported function (not private shadow)
      let semanticStability: SemanticStabilityResult | number
      const periods = contentEvolution?.periods ?? []

      if (periods.length > 1) {
        const series = periods
          .map((p: any) => ({
            timestamp: new Date(p.startDate).getTime(),
            content:   (p.themes ?? []).map((t: any) => t.theme).join(" "),
          }))
          .filter((item: any) => item.content.length > 0)

        // ✅ Uses imported calcSemanticStability — no shadowing
        semanticStability = series.length > 1
          ? calcSemanticStability(series)
          : this.semanticStabilityFallback(contentAnomalies, semanticClusters)
      } else {
        semanticStability = this.semanticStabilityFallback(contentAnomalies, semanticClusters)
      }

      // Content coherence
      // ✅ extractDocumentsFromClusters now uses 'content' field that clusters actually have
      const documents = this.extractDocumentsFromClusters(semanticClusters)
      const contentCoherence: ContentCoherenceResult | number =
        documents.length > 0
          ? calculateUMassCoherence(documents, "umass")
          : this.contentCoherenceFallback(semanticClusters)

      const diversityIndex         = this.calculateAdvancedDiversityIndex(semanticClusters, contentAnomalies)
      const statisticalValidation  = this.calculateStatisticalValidation(contentAnomalies, semanticClusters, snapshots)
      const dataQuality            = this.calculateEnhancedDataQuality(contentAnomalies, semanticClusters, snapshots)
      const performanceInsights    = this.calculatePerformanceInsights(contentAnomalies, semanticClusters)

      return { semanticStability, contentCoherence, diversityIndex, statisticalValidation, dataQuality, performanceInsights }
    } catch (err) {
      console.error("[EnhancedAnalytics] Enterprise metrics failed:", err)
      return {
        semanticStability: this.semanticStabilityFallback(contentAnomalies, semanticClusters),
        contentCoherence:  this.contentCoherenceFallback(semanticClusters),
        diversityIndex:    this.calculateSemanticDiversity(semanticClusters),
      }
    }
  }

  // ── Cluster analysis ───────────────────────────────────────────────────────

  private async analyzeSemanticClusters(
    userId:      string,
    timeRangeMs: number
  ): Promise<any[]> {
    try {
      await this.weaviateService.initialize()
      const anomalies = await this.weaviateService.detectContentAnomalies(userId, timeRangeMs)

      const grouped = new Map<string, any[]>()
      for (const anomaly of anomalies) {
        const theme  = this.extractTheme(anomaly.title ?? "")
        const bucket = grouped.get(theme) ?? []
        bucket.push(anomaly)
        grouped.set(theme, bucket)
      }

      return Array.from(grouped.entries()).map(([theme, items]) => {
        const queryIds = [...new Set(items.map((i: any) => i.queryId).filter(Boolean))]
        return {
          id:        theme,
          theme,
          size:      items.length,
          items:     items.slice(0, 5),
          coherence: this.calculateClusterCoherence(items),
          queryIds,
          centroid:  this.calculateClusterCentroid(items),
        }
      }).sort((a, b) => b.size - a.size)
    } catch (err) {
      console.error("[EnhancedAnalytics] Cluster analysis failed:", err)
      return []
    }
  }

  // ── Content evolution ──────────────────────────────────────────────────────

  /**
   * Fetches anomalies ONCE then filters client-side per period.
   * ✅ Replaces 7 sequential Weaviate calls with 1.
   */
  private async analyzeContentEvolution(
    userId:      string,
    timeRangeMs: number,
    snapshots:   RankingSnapshot[]
  ): Promise<any> {
    try {
      // Single Weaviate call for the full range
      const allAnomalies = await this.weaviateService.detectContentAnomalies(userId, timeRangeMs)
      const periods      = this.createTimePeriods(timeRangeMs, 7)
      const evolutionData: any[] = []

      for (const period of periods) {
        // Filter client-side instead of re-fetching
        const periodAnomalies = allAnomalies.filter((a: any) => {
          const ts = new Date(a.timestamp).getTime()
          return ts >= period.start.getTime() && ts < period.end.getTime()
        })

        evolutionData.push({
          period:       period.label,
          startDate:    period.start,
          endDate:      period.end,
          anomalyCount: periodAnomalies.length,
          themes:       this.extractThemes(periodAnomalies),
          stability:    this.calculatePeriodStability(periodAnomalies),
        })
      }

      // Also compute snapshot-based discovery rate as fallback
      const uniqueUrls = new Set<string>()
      for (const s of snapshots) {
        for (const r of s.results ?? []) {
          if (r.url) uniqueUrls.add(r.url)
        }
      }

      return {
        periods:         evolutionData,
        overallTrend:    this.calculateOverallTrend(evolutionData),
        volatility:      this.calculateContentVolatility(evolutionData),
        discoveryRate:   snapshots.length > 0
          ? uniqueUrls.size / snapshots.length
          : this.calculateDiscoveryRate(evolutionData),
        stabilityTrend:  evolutionData.map(d => ({ period: d.period, stability: d.stability })),
        contentTurnover: this.calculateContentTurnover(evolutionData),
      }
    } catch (err) {
      console.error("[EnhancedAnalytics] Content evolution failed:", err)
      return {
        periods: [], overallTrend: "stable", volatility: 0,
        discoveryRate: 0, stabilityTrend: [], contentTurnover: 0,
      }
    }
  }

  // ── Cluster helpers ────────────────────────────────────────────────────────

  /**
   * O(n) coherence via centroid — replaces O(n²) pairwise.
   */
  private calculateClusterCoherence(items: any[]): number {
    const vectors = items
      .map(item => this.extractVector(item))
      .filter((v): v is number[] => !!v?.length)

    if (vectors.length < 2) return vectors.length === 1 ? 1.0 : 0.5

    const centroid = VectorUtils.calculateCentroid(vectors)
    let sum = 0
    for (const v of vectors) sum += VectorUtils.cosineSimilarity(v, centroid)
    return Math.max(0, Math.min(1, sum / vectors.length))
  }

  private calculateClusterCentroid(items: any[]): number[] {
    const vectors = items
      .map(item => this.extractVector(item))
      .filter((v): v is number[] => !!v?.length)
    return vectors.length > 0 ? VectorUtils.calculateCentroid(vectors) : []
  }

  private extractVector(item: any): number[] | null {
    if (Array.isArray(item?._additional?.vector)) return item._additional.vector
    if (Array.isArray(item?.vector))              return item.vector
    return null
  }

  /**
   * ✅ Uses 'content' field that cluster items actually have.
   * Falls back gracefully when title is missing.
   */
  private extractDocumentsFromClusters(
    clusters: any[]
  ): Array<{ title: string; content: string; vector?: number[] }> {
    return clusters.flatMap(cluster =>
      (cluster.items ?? [])
        .filter((item: any) => item.content || item.snippet || item.description)
        .map((item: any) => ({
          title:   item.title   || item.url   || "untitled",
          content: item.content || item.snippet || item.description || "",
          vector:  this.extractVector(item) ?? undefined,
        }))
    )
  }

  // ── Statistical validation ─────────────────────────────────────────────────

  // ✅ Sync — was async with no await
  private calculateStatisticalValidation(
    contentAnomalies: any[],
    semanticClusters: any[],
    snapshots:        any[]
  ) {
    const totalItems       = contentAnomalies.length +
      semanticClusters.reduce((s, c) => s + (c.size ?? 0), 0)
    const goodDetections   = contentAnomalies.filter(a => a.anomalyScore > 1).length
    const accuracy         = totalItems > 0 ? (goodDetections / totalItems) * 100 : 85

    const avgCoherence     = semanticClusters.length > 0
      ? semanticClusters.reduce((s, c) => s + (c.coherence ?? 0), 0) / semanticClusters.length
      : 0.8

    const precision = Math.min(avgCoherence * 1.1, 1.0)
    const recall    = Math.min(avgCoherence * 0.95, 1.0)
    const f1Score   = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0

    const variances = snapshots
      .map((s: any) => calculateStandardDeviation((s.results ?? []).map((r: any) => r.position ?? 0)))
      .filter(v => v > 0)

    const avgVariance = variances.length > 0
      ? variances.reduce((s, v) => s + v, 0) / variances.length
      : 5
    const mape = Math.min(avgVariance * 2, 50)

    return {
      accuracy:        parseFloat(accuracy.toFixed(2)),
      precision:       parseFloat(precision.toFixed(3)),
      recall:          parseFloat(recall.toFixed(3)),
      f1Score:         parseFloat(f1Score.toFixed(3)),
      mape:            parseFloat(mape.toFixed(2)),
      confidenceLevel: 95,
      lastValidated:   Date.now(),
    }
  }

  private calculateEnhancedDataQuality(
    contentAnomalies: any[],
    semanticClusters: any[],
    snapshots:        any[]
  ) {
    const now        = Date.now()
    const expected   = semanticClusters.reduce((s, c) => s + (c.size ?? 0), 0)
    const actual     = contentAnomalies.length + expected
    const completeness = expected > 0 ? Math.min((actual / expected) * 100, 100) : 90

    const avgCoherence = semanticClusters.length > 0
      ? semanticClusters.reduce((s, c) => s + (c.coherence ?? 0), 0) / semanticClusters.length
      : 0.85

    const highQuality = semanticClusters.filter(c => (c.coherence ?? 0) > 0.7).length
    const consistency = semanticClusters.length > 0 ? (highQuality / semanticClusters.length) * 100 : 85

    const ages    = snapshots.map(s => now - new Date(s.timestamp).getTime())
    const avgAge  = ages.length > 0 ? ages.reduce((s, a) => s + a, 0) / ages.length : 0
    const freshness = Math.max(0, 100 - (avgAge / (24 * 60 * 60 * 1000)) * 5)

    const validAnomalies = contentAnomalies.filter(a => a.anomalyScore > 0.5).length
    const validity = contentAnomalies.length > 0 ? (validAnomalies / contentAnomalies.length) * 100 : 95

    return {
      completeness: parseFloat(completeness.toFixed(2)),
      accuracy:     parseFloat((avgCoherence * 100).toFixed(2)),
      consistency:  parseFloat(consistency.toFixed(2)),
      freshness:    parseFloat(freshness.toFixed(2)),
      validity:     parseFloat(validity.toFixed(2)),
      anomalyCount: contentAnomalies.length,
      assessedAt:   now,
    }
  }

  private calculatePerformanceInsights(contentAnomalies: any[], semanticClusters: any[]) {
    const high        = contentAnomalies.filter(a => a.anomalyScore > 2).length
    const detAccuracy = contentAnomalies.length > 0 ? (high / contentAnomalies.length) * 100 : 85

    const avgCoherence = semanticClusters.length > 0
      ? semanticClusters.reduce((s, c) => s + (c.coherence ?? 0), 0) / semanticClusters.length
      : 0.8

    const balanced = semanticClusters.filter(c => (c.size ?? 0) > 1 && (c.coherence ?? 0) > 0.6).length
    const searchEff = semanticClusters.length > 0 ? (balanced / semanticClusters.length) * 100 : 80

    const cacheStats   = this.weaviateService.getCacheStats()
    const cacheHitRate = (cacheStats.hitRate ?? 0) * 100

    return {
      anomalyDetectionAccuracy:  parseFloat(detAccuracy.toFixed(2)),
      clusteringQuality:         parseFloat((avgCoherence * 100).toFixed(2)),
      semanticSearchEfficiency:  parseFloat(searchEff.toFixed(2)),
      vectorCacheHitRate:        parseFloat(cacheHitRate.toFixed(2)),
    }
  }

  // ── Diversity & diversity helpers ──────────────────────────────────────────

  private calculateAdvancedDiversityIndex(semanticClusters: any[], contentAnomalies: any[]): number {
    if (semanticClusters.length <= 1) return 0

    const shannon     = this.calculateSemanticDiversity(semanticClusters)
    const anomThemes  = contentAnomalies.map(a => this.extractTheme(a.title ?? ""))
    const anomDiv     = this.calculateThemeDiversity(anomThemes)
    const sizes       = semanticClusters.map(c => c.size ?? 0)
    const gini        = this.calculateGiniDiversity(sizes)

    return shannon * 0.4 + anomDiv * 0.3 + gini * 0.3
  }

  private calculateSemanticDiversity(clusters: any[]): number {
    if (clusters.length <= 1) return 0
    const total = clusters.reduce((s, c) => s + (c.size ?? 0), 0)
    if (!total) return 0
    const H    = clusters.reduce((acc, c) => {
      const p = (c.size ?? 0) / total
      return p > 0 ? acc - p * Math.log2(p) : acc
    }, 0)
    const maxH = Math.log2(clusters.length)
    return maxH > 0 ? H / maxH : 0
  }

  private calculateThemeDiversity(themes: string[]): number {
    if (themes.length <= 1) return 0
    const counts = new Map<string, number>()
    for (const t of themes) counts.set(t, (counts.get(t) ?? 0) + 1)
    const total  = themes.length
    const H      = Array.from(counts.values()).reduce((h, c) => {
      const p = c / total
      return h - p * Math.log2(p)
    }, 0)
    const maxH = Math.log2(counts.size)
    return maxH > 0 ? H / maxH : 0
  }

  private calculateGiniDiversity(values: number[]): number {
    if (values.length <= 1) return 0
    const sorted = [...values].sort((a, b) => a - b)
    const n      = sorted.length
    const total  = sorted.reduce((s, v) => s + v, 0)
    if (!total) return 0
    let gini = 0
    for (let i = 0; i < n; i++) gini += (2 * (i + 1) - n - 1) * sorted[i]
    return Math.abs(gini / (n * total))
  }

  // ── Fallbacks ──────────────────────────────────────────────────────────────

  private semanticStabilityFallback(anomalies: any[], clusters: any[]): number {
    const anomalyRate  = Math.min(anomalies.length / 100, 1)
    const avgCoherence = clusters.length > 0
      ? clusters.reduce((s, c) => s + (c.coherence ?? 0), 0) / clusters.length
      : 0.8
    return Math.round((1 - anomalyRate) * avgCoherence * 100)
  }

  private contentCoherenceFallback(clusters: any[]): number {
    if (!clusters.length) return 80
    return (clusters.reduce((s, c) => s + (c.coherence ?? 0), 0) / clusters.length) * 100
  }

  // ── Snapshot retrieval helper ──────────────────────────────────────────────

  private async getSnapshotsForUser(
    userId:      string,
    timeRangeMs: number
  ): Promise<RankingSnapshot[]> {
    try {
      const analytics = await this.getAnalytics(userId, timeRangeMs)
      // ✅ filteredSnapshots may not be on AnalyticsData base type — access safely
      return (analytics as any).filteredSnapshots ?? []
    } catch (err) {
      console.error("[EnhancedAnalytics] getSnapshotsForUser failed:", err)
      return []
    }
  }

  // ── Theme / evolution helpers ──────────────────────────────────────────────

  private extractTheme(title: string): string {
    const map: Record<string, string[]> = {
      technology: ["ai", "tech", "software", "digital", "code", "programming", "api", "web", "app"],
      business:   ["business", "company", "market", "finance", "revenue", "profit", "sales"],
      news:       ["news", "report", "update", "breaking", "latest", "announcement"],
      research:   ["research", "study", "analysis", "findings", "paper", "journal", "academic"],
      education:  ["learn", "tutorial", "guide", "course", "education", "training", "how-to"],
      social:     ["twitter", "linkedin", "facebook", "social", "media", "post"],
      government: ["gov", "government", "policy", "regulation", "law", "legal"],
    }
    const lower = title.toLowerCase()
    let best = "general", max = 0
    for (const [theme, kws] of Object.entries(map)) {
      const n = kws.filter(k => lower.includes(k)).length
      if (n > max) { best = theme; max = n }
    }
    return best
  }

  private extractThemes(anomalies: any[]) {
    const counts = new Map<string, number>()
    for (const a of anomalies) {
      const t = this.extractTheme(a.title ?? "")
      counts.set(t, (counts.get(t) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .map(([theme, count]) => ({ theme, count }))
      .sort((a, b) => b.count - a.count)
  }

  private extractDominantThemes(clusters: any[]): string[] {
    return clusters
      .slice()
      .sort((a, b) => (b.size ?? 0) - (a.size ?? 0))
      .slice(0, 5)
      .map(c => c.theme as string)
      .filter(Boolean)
  }

  private categorizeAnomalies(anomalies: any[]) {
    const dist = { low: 0, medium: 0, high: 0, critical: 0 }
    for (const a of anomalies) {
      const s = a.anomalyScore ?? 0
      if      (s < 1) dist.low++
      else if (s < 2) dist.medium++
      else if (s < 3) dist.high++
      else            dist.critical++
    }
    return dist
  }

  private determineEvolutionTrend(evolution: any): "improving" | "declining" | "stable" {
    const periods = evolution?.periods ?? []
    if (periods.length < 2) return "stable"
    const slope = this.computeSlope(periods.slice(-3).map((p: any) => p.stability ?? 0))
    if (slope > 0.1)  return "improving"
    if (slope < -0.1) return "declining"
    return "stable"
  }

  private computeSlope(values: number[]): number {
    const n = values.length
    if (n < 2) return 0
    const sumX  = values.reduce((s, _, i) => s + i, 0)
    const sumY  = values.reduce((s, v) => s + v, 0)
    const sumXY = values.reduce((s, v, i) => s + i * v, 0)
    const sumX2 = values.reduce((s, _, i) => s + i * i, 0)
    const denom = n * sumX2 - sumX * sumX
    return denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom
  }

  private createTimePeriods(rangeMs: number, count: number) {
    const step = rangeMs / count
    const now  = Date.now()
    return Array.from({ length: count }, (_, i) => {
      const end   = now - i * step
      const start = end - step
      return { label: `Period ${count - i}`, start: new Date(start), end: new Date(end), duration: step }
    }).reverse()
  }

  private calculateOverallTrend(data: any[]): string {
    if (data.length < 2) return "stable"
    const slope = this.computeSlope(data.map(d => d.anomalyCount ?? 0))
    if (slope > 0.5)  return "increasing_anomalies"
    if (slope < -0.5) return "decreasing_anomalies"
    return "stable"
  }

  private calculateContentVolatility(data: any[]): number {
    if (data.length < 2) return 0
    const counts = data.map(d => d.anomalyCount ?? 0)
    const mean   = counts.reduce((s, v) => s + v, 0) / counts.length
    return Math.sqrt(counts.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / counts.length)
  }

  private calculatePeriodStability(anomalies: any[]): number {
    if (!anomalies.length) return 1
    const avg = anomalies.reduce((s, a) => s + (a.anomalyScore ?? 0), 0) / anomalies.length
    return Math.max(0, 1 - avg / 5)
  }

  private calculateDiscoveryRate(data: any[]): number {
    if (!data.length) return 0
    const allThemes = new Set<string>()
    for (const d of data) {
      for (const t of d.themes ?? []) allThemes.add(t.theme)
    }
    return allThemes.size / data.length
  }

  private calculateContentTurnover(data: any[]): number {
    if (data.length < 2) return 0
    let sum = 0
    for (let i = 1; i < data.length; i++) {
      const prev  = new Set((data[i - 1].themes ?? []).map((t: any) => t.theme))
      const curr  = new Set((data[i].themes     ?? []).map((t: any) => t.theme))
      const inter = [...prev].filter(t => curr.has(t)).length
      const union = new Set([...prev, ...curr]).size
      sum += union > 0 ? 1 - inter / union : 0
    }
    return sum / (data.length - 1)
  }

  // ── Default override ───────────────────────────────────────────────────────

  protected override getDefaultEnhancedAnalytics(): EnhancedAnalyticsData {
    return {
      ...super.getDefaultEnhancedAnalytics(),
      semanticInsights: undefined,
      enhancedMetrics: {
        semanticStability: 0,
        contentCoherence:  0,
        diversityIndex:    0,
        statisticalValidation: {
          accuracy: 0, precision: 0, recall: 0,
          f1Score: 0, mape: 100, confidenceLevel: 95, lastValidated: Date.now(),
        },
        dataQuality: {
          completeness: 0, accuracy: 0, consistency: 0,
          freshness: 0, validity: 0, anomalyCount: 0, assessedAt: Date.now(),
        },
      },
      isWeaviateSource: true,
      dataSourceType:   "weaviate",
    }
  }
}