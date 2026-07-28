// lib/services/AlgorithmUpdateDetector.ts
//
// Detects Google/Exa algorithm updates by finding coordinated drift
// across multiple queries in the same category within a 24-hour window.
//
// Key insight: random drift is uncorrelated. Algorithm updates cause
// correlated drift across many queries simultaneously. If ≥60% of
// your tracked "news" queries all drift above threshold on the same day,
// that is not random — something systemic happened.
//
// INTEGRATION: call AlgorithmUpdateDetector.analyze() at the end of
// each cron batch, after drift analysis has run for all queries.

import type { DriftAnalysisResult } from "@/types/type"

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AlgorithmUpdateEvent {
  id:               string
  detectedAt:       Date
  category:         string
  affectedQueries:  Array<{
    queryId:    string
    queryName:  string
    driftScore: number
  }>
  driftRate:        number   // % of category queries that drifted
  avgDriftScore:    number   // average drift score of affected queries
  severity:         "minor" | "moderate" | "major"
  description:      string
}

export interface DetectionConfig {
  // What fraction of a category's queries must drift to trigger detection
  driftRateThreshold:    number   // default: 0.60 (60%)

  // Minimum drift score to count a query as "drifted"
  perQueryDriftThreshold: number  // default: 30

  // Minimum queries in a category to even attempt detection
  // (no false positives from categories with 1-2 queries)
  minQueriesInCategory:  number   // default: 3

  // Time window to group results for correlation (ms)
  correlationWindowMs:   number   // default: 24h
}

const DEFAULT_CONFIG: DetectionConfig = {
  driftRateThreshold:     0.60,
  perQueryDriftThreshold: 30,
  minQueriesInCategory:   3,
  correlationWindowMs:    24 * 60 * 60 * 1000,
}

// ─── AlgorithmUpdateDetector ─────────────────────────────────────────────────

export class AlgorithmUpdateDetector {
  private config: DetectionConfig

  constructor(config: Partial<DetectionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Main analysis entry point.
   * Groups results by category, applies correlation test,
   * returns any detected events (could be 0, 1, or multiple).
   */
  analyze(
    results:   DriftAnalysisResult[],
    queryMeta: Array<{ id: string; name: string; category: string }>
  ): AlgorithmUpdateEvent[] {
    if (!Array.isArray(results) || results.length === 0) return []

    // Build a lookup from queryId → category
    const categoryByQueryId = new Map(queryMeta.map(q => [q.id, q.category]))
    const nameByQueryId     = new Map(queryMeta.map(q => [q.id, q.name]))

    // Group results by category
    const byCategory = new Map<string, DriftAnalysisResult[]>()
    for (const result of results) {
      const category = categoryByQueryId.get(result.queryId) ?? "unknown"
      if (!byCategory.has(category)) byCategory.set(category, [])
      byCategory.get(category)!.push(result)
    }

    const events: AlgorithmUpdateEvent[] = []

    for (const [category, categoryResults] of byCategory) {
      if (categoryResults.length < this.config.minQueriesInCategory) continue

      const driftedResults = categoryResults.filter(
        r => (r.latestDrift ?? 0) >= this.config.perQueryDriftThreshold
      )

      const driftRate = driftedResults.length / categoryResults.length

      if (driftRate < this.config.driftRateThreshold) continue

      // Threshold crossed — this looks systemic
      const avgDriftScore = driftedResults.reduce(
        (sum, r) => sum + (r.latestDrift ?? 0), 0
      ) / driftedResults.length

      const severity = this.computeSeverity(driftRate, avgDriftScore)

      events.push({
        id:          `algo_update_${category}_${Date.now()}`,
        detectedAt:  new Date(),
        category,
        affectedQueries: driftedResults.map(r => ({
          queryId:    r.queryId,
          queryName:  nameByQueryId.get(r.queryId) ?? r.queryName,
          driftScore: r.latestDrift ?? 0,
        })),
        driftRate,
        avgDriftScore,
        severity,
        description: this.buildDescription(category, driftedResults.length, categoryResults.length, avgDriftScore, severity),
      })
    }

    return events
  }

  /**
   * Persist detected events to Appwrite for display in the UI.
   */
  async persistEvents(
    userId: string,
    events: AlgorithmUpdateEvent[]
  ): Promise<void> {
    if (events.length === 0) return

    try {
      const { databases, ID } = await import("@/app/server/appwrite/appwrite-server")

      for (const event of events) {
        await databases.createDocument(
          process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!,
          process.env.COLLECTION_ALGORITHM_EVENTS ?? "algorithm_events",
          ID.unique(),
          {
            userId,
            eventId:         event.id,
            category:        event.category,
            driftRate:       event.driftRate,
            avgDriftScore:   event.avgDriftScore,
            severity:        event.severity,
            description:     event.description,
            affectedCount:   event.affectedQueries.length,
            affectedQueries: JSON.stringify(event.affectedQueries),
            detectedAt:      event.detectedAt.toISOString(),
          }
        )
      }

      console.log(`[AlgorithmUpdateDetector] Persisted ${events.length} event(s)`)
    } catch (err) {
      console.error("[AlgorithmUpdateDetector] Failed to persist events:", err)
    }
  }

  /**
   * Returns recent events for a user — used by the UI to show
   * the "Algorithm Updates" panel in the Analytics page.
   */
  static async getRecentEvents(
    userId: string,
    limit = 10
  ): Promise<AlgorithmUpdateEvent[]> {
    try {
      const { databases } = await import("@/app/server/appwrite/appwrite-server")
      const { Query }     = await import("node-appwrite")

      const result = await databases.listDocuments(
        process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!,
        process.env.COLLECTION_ALGORITHM_EVENTS ?? "algorithm_events",
        [
          Query.equal("userId", userId),
          Query.orderDesc("detectedAt"),
          Query.limit(limit),
        ]
      )

      return result.documents.map(doc => ({
        id:              doc.eventId,
        detectedAt:      new Date(doc.detectedAt),
        category:        doc.category,
        affectedQueries: JSON.parse(doc.affectedQueries ?? "[]"),
        driftRate:       doc.driftRate,
        avgDriftScore:   doc.avgDriftScore,
        severity:        doc.severity,
        description:     doc.description,
      }))
    } catch {
      return []
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private computeSeverity(
    driftRate:      number,
    avgDriftScore:  number
  ): AlgorithmUpdateEvent["severity"] {
    if (driftRate >= 0.85 && avgDriftScore >= 60) return "major"
    if (driftRate >= 0.70 || avgDriftScore >= 50) return "moderate"
    return "minor"
  }

  private buildDescription(
    category:      string,
    driftedCount:  number,
    totalCount:    number,
    avgScore:      number,
    severity:      string
  ): string {
    const pct = Math.round((driftedCount / totalCount) * 100)
    return `${severity.charAt(0).toUpperCase() + severity.slice(1)} algorithm update detected in "${category}" category. ` +
           `${driftedCount} of ${totalCount} queries (${pct}%) drifted simultaneously ` +
           `with an average drift score of ${avgScore.toFixed(1)}. ` +
           `This pattern is consistent with a search engine algorithm change ` +
           `rather than random individual query drift.`
  }
}

export const algorithmUpdateDetector = new AlgorithmUpdateDetector()