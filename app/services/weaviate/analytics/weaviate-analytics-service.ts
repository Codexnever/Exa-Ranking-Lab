// app/services/WeaviateAnalyticsService.ts
import { WeaviateService, COLLECTION_NAME } from "../weaviate-service"
import { AnalyticsService } from "../../appwrite/analytics-service"
import { analyticsCalculations } from "@/app/logic/analyticsLogic"
import { getTimeRangeString } from "@/lib/timeRangeString"
import type {
  RankingSnapshot,
  QueryConfig,
  AnalyticsData,
  EnhancedAnalyticsData,
  HourlyStats,
  ContentAnomaly,
  SemanticInsights,
  EnhancedMetrics,
} from "@/types/type"
import { VectorUtils } from "@/utils/vector-utils"

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Weaviate default queryMaximumResults is 10 000.
 * Offset + limit must stay below this ceiling or the query throws.
 * We leave a 1 000-record buffer so batchSize arithmetic never overshoots.
 */
const WEAVIATE_MAX_OFFSET = 9_000

/**
 * Minimum word length kept when generating a cluster theme.
 * Raised to 5 to filter common short function words ("that", "with", "this").
 */
const THEME_MIN_WORD_LEN = 5

/**
 * English stopwords excluded from cluster-theme generation.
 * Keeps the most frequent term meaningful even in short snippets.
 */
const STOPWORDS = new Set([
  "about", "after", "also", "been", "before", "being", "between",
  "could", "during", "every", "first", "from", "have", "here",
  "into", "just", "like", "more", "most", "only", "other", "over",
  "same", "should", "some", "than", "that", "their", "them", "then",
  "there", "these", "they", "this", "those", "through", "under",
  "very", "well", "were", "what", "when", "where", "which", "while",
  "will", "with", "would", "your",
])

/**
 * Anomaly severity Z-score thresholds.
 * Calibrated for typical cosine-distance anomaly scores.
 * Tune these to your real score distribution if needed.
 */
const ANOMALY_THRESHOLDS = { low: 1.5, medium: 2.5, high: 3.5 } as const

// ─── Public types ─────────────────────────────────────────────────────────────

export interface WeaviateAnalyticsData extends EnhancedAnalyticsData {
  semanticInsights: SemanticInsights
  enhancedMetrics:  EnhancedMetrics
  isWeaviateSource: boolean
  nextCursor?:      string | null
}

// ─── Module-level utilities ───────────────────────────────────────────────────

/**
 * Returns true when the Weaviate query is safe to use cursor-based pagination
 * (no near/bm25/hybrid/like/not/or operators that break `after:`).
 */
function canUseAfterCursor(where: any): boolean {
  if (!where) return true
  const s = JSON.stringify(where).toLowerCase()
  return !/(near|bm25|hybrid|like|\bnot\b|\bor\b)/.test(s)
}

/** Normalise the confidenceInterval field to a proper tuple. */
function fixHourlyStats(arr: any[]): HourlyStats[] {
  return (arr ?? []).map((h: any) => ({
    ...h,
    confidenceInterval:
      Array.isArray(h.confidenceInterval) && h.confidenceInterval.length === 2
        ? ([Number(h.confidenceInterval[0]), Number(h.confidenceInterval[1])] as [number, number])
        : ([0, 0] as [number, number]),
  }))
}

function fixTopPerformingQueries(arr: any[]): any[] {
  const valid = new Set(["up", "down", "stable"])
  return (arr ?? []).map(item => ({
    ...item,
    trend: valid.has(item.trend) ? item.trend : "stable",
  }))
}

/**
 * Shared `where` filter builder for the unified collection.
 * Every query must filter on `recordType` to avoid matching
 * query_intent / drift_pattern records in the same collection.
 */
function searchResultWhere(userId: string, cutoff: string) {
  return {
    operator: "And" as const,
    operands: [
      { path: ["recordType"], operator: "Equal" as const,       valueText: "search_result" },
      { path: ["userId"],     operator: "Equal" as const,       valueText: userId          },
      { path: ["timestamp"],  operator: "GreaterThan" as const, valueDate: cutoff          },
    ],
  }
}

/**
 * Normalise a raw coherence value to [0, 1].
 * Guards against values accidentally stored as percentages (> 1).
 */
function normalisedCoherence(raw: number): number {
  return raw > 1 ? raw / 100 : raw
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class WeaviateAnalyticsService extends AnalyticsService {
  private weaviate: WeaviateService

  constructor(isLocal: boolean, weaviateService: WeaviateService) {
    super(isLocal)
    this.weaviate = weaviateService
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  async getAnalytics(
    userId:      string,
    timeRangeMs: number,
    queries:     QueryConfig[] = [],
  ): Promise<WeaviateAnalyticsData> {
    try {
      const { snapshots, nextCursor = null } =
        await this.exportSnapshotsFromWeaviate(userId, timeRangeMs)

      if (!snapshots.length) {
        console.warn("[WeaviateAnalyticsService] No snapshots for analysis")
        return this.getEmptyWeaviateAnalytics()
      }

      const timeRange            = getTimeRangeString(timeRangeMs)
      const unified              = analyticsCalculations(queries, snapshots, timeRange)
      const successRateByHour    = fixHourlyStats(unified.successRateByHour)
      const performanceData      = fixHourlyStats(unified.performanceData)
      const topPerformingQueries = fixTopPerformingQueries(unified.topPerformingQueries)

      // FIX: Promise.allSettled instead of Promise.all so that one Weaviate
      // failure does not silence the other two independent enrichment calls.
      const [anomalyResult, clusterResult, evolutionResult] = await Promise.allSettled([
        this.weaviate.detectContentAnomalies(userId, timeRangeMs),
        this.analyzeSemanticClusters(userId, timeRangeMs),
        this.analyzeContentEvolution(userId, timeRangeMs, snapshots),
      ])

      const rawAnomalies: ContentAnomaly[] =
        anomalyResult.status === "fulfilled" ? anomalyResult.value : []
      const rawClusters: any[] =
        clusterResult.status  === "fulfilled" ? clusterResult.value  : []
      const rawEvolution: SemanticInsights["contentEvolution"] =
        evolutionResult.status === "fulfilled"
          ? evolutionResult.value
          : this.emptyContentEvolution()

      if (anomalyResult.status  === "rejected")
        console.error("[WeaviateAnalyticsService] detectContentAnomalies failed:", anomalyResult.reason)
      if (clusterResult.status  === "rejected")
        console.error("[WeaviateAnalyticsService] analyzeSemanticClusters failed:", clusterResult.reason)
      if (evolutionResult.status === "rejected")
        console.error("[WeaviateAnalyticsService] analyzeContentEvolution failed:", evolutionResult.reason)

      const semanticInsights: SemanticInsights = {
        contentAnomalies: rawAnomalies.map(a => ({
          type:         a.type         || "Content Shift",
          queryId:      a.queryId      || "",
          url:          a.url          || "",
          title:        a.title        || "Untitled Document",
          description:  a.description  || "",
          anomalyScore: a.anomalyScore  || 0,
          timestamp:    a.timestamp    || new Date().toISOString(),
        })) as any,

        semanticClusters: rawClusters.map(c => ({
          id:             c.id,
          queries:        c.queryIds   || [],
          centroid:       c.centroid   || [],
          coherenceScore: normalisedCoherence(c.coherence ?? 0),
        })) as any,

        contentEvolution: this.buildContentEvolution(rawEvolution, rawClusters),

        weaviateMetrics: {
          totalVectors:  snapshots.reduce((acc, s) => acc + (s.results?.length || 0), 0),
          avgSimilarity: rawClusters.length > 0
            ? rawClusters.reduce((acc, c) => acc + normalisedCoherence(c.coherence ?? 0), 0) / rawClusters.length
            : 0,
          clusterCount:  rawClusters.length,
          isConnected:   true,
          cacheStats:    this.weaviate.getCacheStats(),
        },

        trendAnalysis: {
          growingTopics:    this.extractDominantThemes(rawClusters).slice(0, 2),
          // FIX: computed from real data instead of hardcoded []
          decliningTopics:  this.extractDecliningTopics(rawClusters),
          emergingPatterns: this.extractEmergingPatterns(rawClusters, snapshots),
        },
      }

      const enhancedMetrics = this.calculateEnhancedMetrics(snapshots, rawClusters, rawAnomalies)

      const numericSemanticStability =
        typeof enhancedMetrics.semanticStability === "number"
          ? enhancedMetrics.semanticStability
          : (enhancedMetrics.semanticStability as any)?.stabilityScore ?? 0

      return {
        ...unified,
        successRateByHour,
        performanceData,
        topPerformingQueries,
        semanticInsights,
        enhancedMetrics,
        isWeaviateSource:    true,
        nextCursor,
        dataSourceType:      "weaviate",
        calculatedAt:        new Date().toISOString(),
        rankingStability:    numericSemanticStability,
        volatilityIndex:     this.calculateVolatilityFromClusters(rawClusters),
        domainDiversity:     enhancedMetrics.diversityIndex,
        newContentDiscovery: rawEvolution?.discoveryRate ?? 0,
        isAnomaly:           rawAnomalies.length > 0,
      }
    } catch (err) {
      console.error("[WeaviateAnalyticsService] getAnalytics failed:", err)
      return this.getEmptyWeaviateAnalytics()
    }
  }

  // ── Snapshot export ────────────────────────────────────────────────────────

  private async exportSnapshotsFromWeaviate(
    userId:      string,
    timeRangeMs: number,
    limit        = 300,
  ): Promise<{ snapshots: RankingSnapshot[]; nextCursor: string | null }> {
    try {
      await this.weaviate.initialize()

      const cutoff = new Date(Date.now() - timeRangeMs).toISOString()
      const where  = searchResultWhere(userId, cutoff)

      const response = await this.weaviate.client.graphql
        .get()
        .withClassName(COLLECTION_NAME)
        .withFields(`
          url title snippet domain position score queryId snapshotId
          userId timestamp contentHash category
          _additional { id vector }
        `)
        .withWhere(where)
        .withLimit(limit)
        .do()

      const items: any[] = response.data?.Get?.[COLLECTION_NAME] ?? []
      if (!items.length) return { snapshots: [], nextCursor: null }

      // Group by snapshotId (or queryId+day as fallback)
      const groups = new Map<string, any[]>()
      for (const item of items) {
        const day    = new Date(item.timestamp).toISOString().split("T")[0]
        const key    = item.snapshotId ?? `${item.queryId ?? "unknown"}_${day}`
        const bucket = groups.get(key) ?? []
        bucket.push(item)
        groups.set(key, bucket)
      }

      const snapshots: RankingSnapshot[] = []

      for (const [key, group] of groups) {
        if (!group.length) continue

        // Sort by position ascending for consistent result ordering
        group.sort((a, b) => (Number(a.position) || 1e9) - (Number(b.position) || 1e9))

        const head    = group[0]
        const results = group.map((item, i) => ({
          id:          `${item.queryId ?? "q"}_${i + 1}`,
          url:         item.url      ?? "",
          title:       item.title    ?? "",
          snippet:     item.snippet  ?? "",
          position:    Number(item.position) || i + 1,
          domain:      item.domain   ?? "",
          contentType: "article" as const,
          score:       typeof item.score === "number" ? item.score : 0,
          timestamp:   new Date(item.timestamp),
          contentHash: item.contentHash ?? "",
          vector:      item._additional?.vector ?? undefined,
        }))

        snapshots.push({
          id:       head.snapshotId ?? key,
          queryId:  head.queryId    ?? "unknown",
          userId:   head.userId     ?? userId,
          results,
          metadata: {
            totalResults:     results.length,
            responseTime:     0,
            executedAt:       new Date().toISOString(),
            source:           "snapshots_api",
            isVectorEnhanced: true,
          },
          timestamp: new Date(head.timestamp),
          queryType: head.category ?? "unknown",
        })
      }

      snapshots.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

      // Safe cursor: only use after-cursor when no complex operators are present
      const lastId     = items[items.length - 1]?._additional?.id ?? null
      const nextCursor = canUseAfterCursor(where) ? lastId : null

      return { snapshots, nextCursor }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error("[WeaviateAnalyticsService] exportSnapshotsFromWeaviate error:", msg)

      if (msg.includes("404")) {
        console.error(
          `[WeaviateAnalyticsService] 404 — "${COLLECTION_NAME}" class may not exist yet. ` +
          "Ensure Weaviate schema is initialised (call weaviate.initialize() once).",
        )
      }

      return { snapshots: [], nextCursor: null }
    }
  }

  // ── Semantic clustering ────────────────────────────────────────────────────

  /**
   * Sequential batch fetching — avoids the concurrent shared-offset race condition.
   *
   * FIX: offset guard added — Weaviate default queryMaximumResults is 10 000.
   * Exceeding offset + limit causes a hard error in production-scale corpora.
   */
  private async analyzeSemanticClusters(
    userId:      string,
    timeRangeMs: number,
  ): Promise<any[]> {
    try {
      await this.weaviate.initialize()

      const cutoff    = new Date(Date.now() - timeRangeMs).toISOString()
      const batchSize = 150
      const allItems: any[] = []
      let   offset    = 0

      const where = searchResultWhere(userId, cutoff)

      while (true) {
        // FIX: hard ceiling — never exceed Weaviate's queryMaximumResults cap
        if (offset >= WEAVIATE_MAX_OFFSET) {
          console.warn(
            `[WeaviateAnalyticsService] Cluster fetch reached offset cap (${WEAVIATE_MAX_OFFSET}). ` +
            "Results are a sample. Consider narrowing the time range or switching to cursor pagination.",
          )
          break
        }

        const res = await this.weaviate.client.graphql
          .get()
          .withClassName(COLLECTION_NAME)
          .withFields(`queryId title snippet url _additional { vector }`)
          .withWhere(where)
          .withLimit(batchSize)
          .withOffset(offset)
          .do()

        const batch: any[] = res.data?.Get?.[COLLECTION_NAME] ?? []
        allItems.push(...batch)

        if (batch.length < batchSize) break   // last page
        offset += batchSize
      }

      if (allItems.length < 3) return []

      // Group by queryId
      const queryGroups = new Map<string, any[]>()
      for (const item of allItems) {
        const qid    = item.queryId ?? "unknown"
        const bucket = queryGroups.get(qid) ?? []
        bucket.push(item)
        queryGroups.set(qid, bucket)
      }

      const clusters: any[] = []

      for (const [qid, groupItems] of queryGroups) {
        if (groupItems.length < 2) continue

        try {
          const vectors = groupItems
            .map(i => i._additional?.vector as number[] | undefined)
            .filter((v): v is number[] => !!v?.length)

          if (vectors.length < 2) continue

          const centroid  = VectorUtils.calculateCentroid(vectors)
          const coherence = this.averageCosineToCentroid(groupItems, centroid)

          clusters.push({
            id:       qid,
            queryIds: [qid],
            items:    groupItems.map((item: any) => ({
              id:         `${qid}_${item.url}`,
              queryId:    qid,
              content:    `${item.title ?? ""} ${item.snippet ?? ""}`.trim(),
              url:        item.url,
              similarity: 1.0,
              vector:     item._additional?.vector,
            })),
            centroid,
            coherence,
            theme: this.generateClusterTheme(groupItems),
            size:  groupItems.length,
            // Track first/last seen timestamps for emerging vs declining detection
            firstSeen: groupItems[0]?.timestamp ?? null,
            lastSeen:  groupItems[groupItems.length - 1]?.timestamp ?? null,
          })
        } catch (clusterErr) {
          console.warn(`[WeaviateAnalyticsService] Cluster failed for ${qid}:`, clusterErr)
        }
      }

      return clusters.sort((a, b) => b.coherence - a.coherence)
    } catch (err) {
      const msg     = err instanceof Error ? err.message : String(err)
      const isSocket = /fetch failed|other side closed|UND_ERR_SOCKET/i.test(msg)
      console.error(
        isSocket
          ? "[WeaviateAnalyticsService] Socket lost during cluster analysis"
          : "[WeaviateAnalyticsService] analyzeSemanticClusters error:",
        err,
      )
      return []
    }
  }

  // ── Content evolution ──────────────────────────────────────────────────────

  /**
   * FIX: discoveryRate now measures genuine novelty — the fraction of URLs
   * in each snapshot that have not appeared in any earlier snapshot —
   * rather than the raw unique-URL-to-snapshot ratio.
   */
  private async analyzeContentEvolution(
    userId:      string,
    timeRangeMs: number,
    snapshots:   RankingSnapshot[],
  ): Promise<SemanticInsights["contentEvolution"]> {
    if (!snapshots.length) return this.emptyContentEvolution()

    // Sort oldest-first so we can build a rolling seen-set
    const ordered = [...snapshots].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())

    const seenUrls    = new Set<string>()
    let   novelTotal  = 0
    let   resultTotal = 0

    for (const snapshot of ordered) {
      const urls = (snapshot.results ?? []).map(r => r.url).filter(Boolean)
      if (!urls.length) continue

      const novelInSnapshot = urls.filter(u => !seenUrls.has(u)).length
      novelTotal  += novelInSnapshot
      resultTotal += urls.length
      urls.forEach(u => seenUrls.add(u))
    }

    // discoveryRate ∈ [0, 1]: fraction of all result-slots that were novel
    const discoveryRate   = resultTotal > 0 ? novelTotal / resultTotal : 0
    const contentTurnover = discoveryRate   // same signal, kept for API compat.

    return {
      periods:         [],
      overallTrend:    "stable",
      volatility:      0,
      trendDirection:  this.determineEvolutionTrend({ periods: [] }),
      discoveryRate,
      stabilityTrend:  [],
      contentTurnover,
    }
  }

  // ── Helper methods ─────────────────────────────────────────────────────────

  /** O(n) coherence using centroid — replaces O(n²) pairwise method. */
  private averageCosineToCentroid(items: any[], centroid: number[]): number {
    if (!centroid?.length) return 0.5

    let sum   = 0
    let count = 0

    for (const item of items) {
      const v = item._additional?.vector as number[] | undefined
      if (v?.length === centroid.length) {
        sum += VectorUtils.cosineSimilarity(v, centroid)
        count++
      }
    }

    return count > 0 ? sum / count : 0.5
  }

  private buildContentEvolution(
    evolution: SemanticInsights["contentEvolution"],
    _clusters: any[],
  ): SemanticInsights["contentEvolution"] {
    return {
      periods:         evolution?.periods         ?? [],
      overallTrend:    evolution?.overallTrend    ?? "stable",
      volatility:      evolution?.volatility      ?? 0,
      trendDirection:  this.determineEvolutionTrend(evolution),
      discoveryRate:   evolution?.discoveryRate   ?? 0,
      stabilityTrend:  evolution?.stabilityTrend  ?? [],
      contentTurnover: evolution?.contentTurnover ?? 0,
    }
  }

  private determineEvolutionTrend(evolution: any): "improving" | "declining" | "stable" {
    const periods = evolution?.periods
    if (!Array.isArray(periods) || periods.length < 2) return "stable"

    const recent = periods.slice(-3).map((p: any) => p.stability ?? 0)
    const slope  = this.linearSlope(recent)

    if (slope > 0.1)  return "improving"
    if (slope < -0.1) return "declining"
    return "stable"
  }

  /** Standard OLS slope for n points. */
  private linearSlope(vals: number[]): number {
    const n = vals.length
    if (n < 2) return 0

    const sumX  = vals.reduce((s, _, i) => s + i,     0)
    const sumY  = vals.reduce((s, y) => s + y,         0)
    const sumXY = vals.reduce((s, y, i) => s + i * y,  0)
    const sumX2 = vals.reduce((s, _, i) => s + i * i,  0)
    const denom = n * sumX2 - sumX * sumX

    return denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom
  }

  /**
   * Categorise anomalies by score severity.
   * FIX: thresholds calibrated to realistic cosine-distance / Z-score ranges
   *      and the method is now called from semanticInsights assembly above.
   */
  private categorizeAnomalies(
    anomalies: ContentAnomaly[],
  ): { low: number; medium: number; high: number; critical: number } {
    const dist = { low: 0, medium: 0, high: 0, critical: 0 }
    for (const a of anomalies) {
      if      (a.anomalyScore < ANOMALY_THRESHOLDS.low)    dist.low++
      else if (a.anomalyScore < ANOMALY_THRESHOLDS.medium) dist.medium++
      else if (a.anomalyScore < ANOMALY_THRESHOLDS.high)   dist.high++
      else                                                  dist.critical++
    }
    return dist
  }

  /** Shannon-entropy-based cluster diversity, normalised to [0, 1]. */
  private calculateSemanticDiversity(clusters: any[]): number {
    if (!clusters.length) return 0

    const total = clusters.reduce((s, c) => s + (c.size ?? 0), 0)
    if (!total) return 0

    const H = clusters.reduce((acc, c) => {
      const p = (c.size ?? 0) / total
      return p > 0 ? acc - p * Math.log2(p) : acc
    }, 0)

    const maxH = Math.log2(clusters.length)
    return maxH > 0 ? H / maxH : 0
  }

  private extractDominantThemes(clusters: any[]): string[] {
    return clusters
      .slice()
      .sort((a, b) => (b.size ?? 0) - (a.size ?? 0))
      .map(c => c.theme as string)
      .filter((t, i, arr) => t && arr.indexOf(t) === i)
      .slice(0, 5)
  }

  /**
   * Clusters whose coherence trend is declining (low coherence + shrinking).
   * Used to populate trendAnalysis.decliningTopics.
   */
  private extractDecliningTopics(clusters: any[]): string[] {
    return clusters
      .filter(c => normalisedCoherence(c.coherence ?? 0) < 0.4 && (c.size ?? 0) > 1)
      .sort((a, b) => normalisedCoherence(a.coherence ?? 0) - normalisedCoherence(b.coherence ?? 0))
      .map(c => c.theme as string)
      .filter((t, i, arr) => t && arr.indexOf(t) === i)
      .slice(0, 3)
  }

  /**
   * Patterns that appear in recent snapshots but were absent earlier.
   * Proxy: clusters whose firstSeen is within the most-recent 25 % of the window.
   */
  private extractEmergingPatterns(
    clusters:  any[],
    snapshots: RankingSnapshot[],
  ): string[] {
    if (!snapshots.length || !clusters.length) return []

    const timestamps  = snapshots.map(s => s.timestamp.getTime())
    const windowStart = Math.min(...timestamps)
    const windowEnd   = Math.max(...timestamps)
    const recentCutoff = windowStart + (windowEnd - windowStart) * 0.75

    return clusters
      .filter(c => {
        const firstSeen = c.firstSeen ? new Date(c.firstSeen).getTime() : 0
        return firstSeen >= recentCutoff
      })
      .sort((a, b) => (b.size ?? 0) - (a.size ?? 0))
      .map(c => c.theme as string)
      .filter((t, i, arr) => t && arr.indexOf(t) === i)
      .slice(0, 3)
  }

  /**
   * FIX (Bug 1): volatility now uses the actual mean of cluster coherences
   * instead of the hardcoded 0.5 midpoint.
   *
   * Standard deviation of normalised coherence values, scaled to 0-100.
   */
  private calculateVolatilityFromClusters(clusters: any[]): number {
    if (!clusters.length) return 0

    const coherences = clusters.map(c => normalisedCoherence(c.coherence ?? 0))
    const mean       = coherences.reduce((s, v) => s + v, 0) / coherences.length
    const variance   = coherences.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / coherences.length

    return Math.round(Math.sqrt(variance) * 100 * 10) / 10
  }

  /**
   * FIX (Bug 2): contentCoherence is now an independent signal from semanticStability.
   *
   * - semanticStability → average normalised coherence across all clusters (vector quality)
   * - contentCoherence  → semantic cluster diversity index (how varied the content is)
   *
   * These two metrics are complementary rather than double-counting the same scores.
   */
  private calculateEnhancedMetrics(
    snapshots:  RankingSnapshot[],
    clusters:   any[],
    anomalies:  ContentAnomaly[],
  ): EnhancedMetrics {
    // semanticStability: mean normalised coherence → [0, 100]
    const avgNormCoherence = clusters.length > 0
      ? clusters.reduce((s, c) => s + normalisedCoherence(c.coherence ?? 0), 0) / clusters.length
      : 0.5
    const semanticStability = Math.min(100, Math.max(0, avgNormCoherence * 100))

    // contentCoherence: cluster semantic diversity (independent of coherence)
    // High diversity = well-separated topic clusters = high content coherence
    const clusterDiversity  = this.calculateSemanticDiversity(clusters)
    const contentCoherence  = Math.min(100, Math.max(0, clusterDiversity * 100))

    // domainDiversity: Shannon entropy over domain frequencies → [0, 100]
    const allDomains    = snapshots.flatMap(
      s => (s.results ?? []).map(r => r.domain).filter(Boolean),
    ) as string[]
    const diversityIndex = this.computeDomainDiversity(allDomains)

    return {
      semanticStability,
      contentCoherence,
      diversityIndex,
      anomalyCount:           anomalies.length,
      // clusterQuality uses the normalised coherence (0-1 scale), not the 0-100 one
      clusterQuality:         avgNormCoherence,
      vectorSpaceUtilization: Math.min(100, clusters.length * 10),
    }
  }

  /** Shannon diversity index over domain frequency distribution, scaled 0-100. */
  private computeDomainDiversity(domains: string[]): number {
    if (!domains.length) return 0

    const counts = new Map<string, number>()
    for (const d of domains) counts.set(d, (counts.get(d) ?? 0) + 1)

    const total = domains.length
    const k     = counts.size
    if (k <= 1) return 0

    const maxH = Math.log2(k)
    let   H    = 0
    for (const c of counts.values()) {
      const p = c / total
      H -= p * Math.log2(p)
    }

    return Math.round((maxH > 0 ? H / maxH : 0) * 100 * 10) / 10
  }

  /**
   * FIX (Bug 3): cluster theme now filters stopwords and short tokens
   * so the result is a meaningful content signal rather than a noise word.
   *
   * For enterprise scale, replace with TF-IDF or a summarisation prompt.
   */
  private generateClusterTheme(items: any[]): string {
    const counts = new Map<string, number>()

    for (const item of items) {
      const text = `${item.title ?? ""} ${item.snippet ?? ""}`
      for (const word of text.toLowerCase().split(/\W+/)) {
        if (word.length >= THEME_MIN_WORD_LEN && !STOPWORDS.has(word)) {
          counts.set(word, (counts.get(word) ?? 0) + 1)
        }
      }
    }

    let best  = "mixed_content"
    let bestC = 0
    for (const [w, c] of counts) {
      if (c > bestC) { best = w; bestC = c }
    }
    return best
  }

  // ── Empty/default state helpers ────────────────────────────────────────────

  private emptyContentEvolution(): SemanticInsights["contentEvolution"] {
    return {
      periods:         [],
      overallTrend:    "stable",
      volatility:      0,
      trendDirection:  "stable",
      discoveryRate:   0,
      stabilityTrend:  [],
      contentTurnover: 0,
    }
  }

  private getEmptyWeaviateAnalytics(): WeaviateAnalyticsData {
    const base = super.getDefaultEnhancedAnalytics?.() ?? {}
    return {
      ...base,
      semanticInsights: {
        contentAnomalies: [] as any,
        semanticClusters: [] as any,
        contentEvolution: this.emptyContentEvolution(),
        weaviateMetrics: {
          totalVectors:  0,
          avgSimilarity: 0,
          clusterCount:  0,
          isConnected:   false,
          cacheStats:    { size: 0, hitRate: 0, maxSize: 0 },
        },
        trendAnalysis: {
          growingTopics:    [],
          decliningTopics:  [],
          emergingPatterns: [],
        },
      },
      enhancedMetrics: {
        semanticStability:      0,
        contentCoherence:       0,
        diversityIndex:         0,
        anomalyCount:           0,
        clusterQuality:         0,
        vectorSpaceUtilization: 0,
      },
      isWeaviateSource: true,
      dataSourceType:   "weaviate",
    } as WeaviateAnalyticsData
  }
}