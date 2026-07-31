// app/api/cron/process-scheduled/route.ts
import { NextRequest, NextResponse } from "next/server"
import { databaseService } from "@/app/services/database/database-service"
import { databases, DATABASE_ID, COLLECTIONS } from "@/app/server/appwrite/appwrite-server"
import { Query } from "node-appwrite"
import { ExaClient } from "@/app/server/exa/exa-client"
import { createHash } from "crypto"
import type { QueryConfig, SearchResult } from "@/types/type"

//  NEW: all three post-processing services
import { driftAlertService } from "@/app/services/DriftAlertService"
import { algorithmUpdateDetector } from "@/app/services/AlgorithmUpdateDetector"
import { analyzeDrift } from "@/app/logic/driftAnalyzer"
import {
  computeConfigHash,
  computeCoverageGap,
} from "@/utils/coverage-and-versioning"

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_QUERIES_PER_RUN = 30
const BATCH_SIZE          = 3
const BATCH_DELAY_MS      = 500

// ─── Weaviate singleton ───────────────────────────────────────────────────────

let _weaviateService: import("@/app/services/weaviate/weaviate-service").WeaviateService | null = null

async function getWeaviateService() {
  if (!_weaviateService) {
    const { WeaviateService } = await import("@/app/services/weaviate/weaviate-service")
    _weaviateService = new WeaviateService()
  }
  return _weaviateService
}

// ─── Content type mapping ─────────────────────────────────────────────────────

const EXA_TYPE_MAP: Record<string, SearchResult["contentType"]> = {
  pdf: "pdf", tweet: "tweet", github: "github",
  news: "news", word: "word", article: "article",
}

function mapContentType(raw: string | undefined): SearchResult["contentType"] {
  return EXA_TYPE_MAP[raw?.toLowerCase() ?? ""] ?? "article"
}

// ─── Error formatting ─────────────────────────────────────────────────────────

function formatError(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === "string") return err
  try { return JSON.stringify(err) } catch { return String(err) }
}

// ─── Due-query check ──────────────────────────────────────────────────────────

function isQueryDue(query: QueryConfig, now: number): boolean {
  if (!query.schedule?.enabled) return false
  if (!query.lastRun) return true
  const diff = now - new Date(query.lastRun).getTime()
  switch (query.schedule.frequency) {
    case "hourly": return diff >= 60 * 60 * 1000
    case "daily":  return diff >= 24 * 60 * 60 * 1000
    case "weekly": return diff >= 7 * 24 * 60 * 60 * 1000
    default:       return false
  }
}

function overdueSortKey(query: QueryConfig): number {
  return query.lastRun ? new Date(query.lastRun).getTime() : 0
}

// ─── Auth check ───────────────────────────────────────────────────────────────

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error("[Cron] CRON_SECRET not set — rejecting all requests")
    return false
  }
  return request.headers.get("authorization") === `Bearer ${secret}`
}

// ─── Single query execution ───────────────────────────────────────────────────

async function executeOneQuery(
  query:  QueryConfig,
  apiKey: string
): Promise<{
  queryId:    string
  userId:     string
  status:     "success" | "error" | "skipped"
  snapshotId?: string
  error?:      string
}> {
  try {
    const filters    = query.filters ?? {}
    const exaClient  = new ExaClient(apiKey)

    const exaResults = await exaClient.search({
      query:          query.query,
      category:       query.category,
      includeDomains: filters.includeDomains,
      excludeDomains: filters.excludeDomains,
      startDate:      filters.startDate,
      endDate:        filters.endDate,
      numResults:     filters.numResults,
    })

    const { responseTime, searchTime } = exaResults

    const mappedResults: SearchResult[] = (exaResults?.results ?? []).map((r: any, idx: number) => {
      const title    = r.title   ?? ""
      const snippet  = r.snippet ?? r.summary ?? ""
      const url      = r.url     ?? ""
      const fulltext = r.text    ?? r.fullText ?? ""
      let   domain   = r.domain  ?? ""
      if (!domain && url) {
        try { domain = new URL(url).hostname } catch { /* malformed */ }
      }
      const contentHash = createHash("sha256")
        .update(`${title}|${snippet}|${fulltext.slice(0, 5000)}|${url}`, "utf8")
        .digest("hex")

      return {
        ...r,
        id:          r.id ?? `${query.id}_${idx}`,
        position:    idx + 1,
        domain,
        contentType: mapContentType(r.type),
        title, snippet, url, contentHash,
        timestamp: new Date(),
        score:     typeof r.score === "number" ? r.score : 0,
      } as SearchResult
    })

    // ✅ NEW: config hash + coverage gap
    const configHash  = computeConfigHash(query)
    const coverageGap = computeCoverageGap(filters.numResults ?? 50, mappedResults.length)

    if (coverageGap.status !== "full") {
      console.warn(
        `[Cron] Coverage gap for ${query.id}: ` +
        `${coverageGap.numReturned}/${coverageGap.numRequested} (${coverageGap.status})`
      )
    }

    const snapshot = await databaseService.snapshotService.createSnapshot({
      queryId:  query.id,
      userId:   query.userId,
      results:  mappedResults,
      metadata: {
        totalResults:   mappedResults.length,
        responseTime:   searchTime ?? responseTime,
        executedAt:     new Date().toISOString(),
        executionType:  "scheduled",
        source:         "cron_scheduler",
        // ✅ NEW
        configHash,
        numRequested:   coverageGap.numRequested,
        numReturned:    coverageGap.numReturned,
        coverageGap:    coverageGap.gap,
        coverageRate:   parseFloat((coverageGap.gapRate * 100).toFixed(2)),
        coverageStatus: coverageGap.status,
      },
      timestamp: new Date(),
    })

    // Weaviate sync — fire-and-forget
    getWeaviateService()
      .then(w => w.initialize().then(() => w.syncSnapshot(snapshot)))
      .catch(err => console.error(
        `[Cron] Weaviate sync failed for ${snapshot.id}: ${formatError(err)}`
      ))

    await databaseService.queryService.updateQuery(query.id, { lastRun: new Date() })

    return { queryId: query.id, userId: query.userId, status: "success", snapshotId: snapshot.id }
  } catch (err) {
    console.error(`[Cron] Query ${query.id} failed:`, formatError(err))
    return { queryId: query.id, userId: query.userId, status: "error", error: formatError(err) }
  }
}

// ─── GET/POST handler ─────────────────────────────────────────────────────────

async function handler(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const startTime = Date.now()
  console.log("[Cron] Starting scheduled query processing...")

  try {
    const scheduled = await databaseService.queryService.getAllScheduledQueries()
    const now       = Date.now()
    let   due       = scheduled.filter(q => isQueryDue(q, now))

    console.log(`[Cron] ${scheduled.length} scheduled, ${due.length} due`)

    if (due.length === 0) {
      return NextResponse.json({
        success: true, message: "No queries due",
        processed: 0, succeeded: 0, failed: 0, skipped: 0,
        timestamp: new Date().toISOString(),
      })
    }

    due = due
      .sort((a, b) => overdueSortKey(a) - overdueSortKey(b))
      .slice(0, MAX_QUERIES_PER_RUN)

    // ── API key cache ──────────────────────────────────────────────────────
    const apiKeyCache = new Map<string, string | null>()

    async function getApiKey(userId: string): Promise<string | null> {
      if (apiKeyCache.has(userId)) return apiKeyCache.get(userId)!
      const settingsRes = await databases.listDocuments(
        DATABASE_ID, COLLECTIONS.SETTINGS, [Query.equal("userId", userId)]
      )
      const key = (settingsRes?.documents?.[0]?.apiKey as string | undefined) ?? null
      apiKeyCache.set(userId, key)
      return key
    }

    // ── Execute in batches ─────────────────────────────────────────────────
    const results: Array<{
      queryId:    string
      userId:     string
      status:     string
      snapshotId?: string
      error?:      string
    }> = []
    let skipped = 0

    for (let i = 0; i < due.length; i += BATCH_SIZE) {
      const batch = due.slice(i, i + BATCH_SIZE)

      const batchResults = await Promise.allSettled(
        batch.map(async query => {
          const apiKey = await getApiKey(query.userId)
          if (!apiKey) {
            skipped++
            console.warn(`[Cron] Skipping ${query.id} — no API key for user ${query.userId}`)
            return { queryId: query.id, userId: query.userId, status: "skipped" as const }
          }
          return executeOneQuery(query, apiKey)
        })
      )

      for (const r of batchResults) {
        if (r.status === "fulfilled") {
          results.push(r.value)
        } else {
          results.push({ queryId: "unknown", userId: "unknown", status: "error", error: formatError(r.reason) })
        }
      }

      if (i + BATCH_SIZE < due.length) {
        await new Promise(res => setTimeout(res, BATCH_DELAY_MS))
      }
    }

    const succeeded = results.filter(r => r.status === "success")
    const failed    = results.filter(r => r.status === "error")

    // ✅ NEW: POST-PROCESSING — drift alerts + algorithm update detection
    // Group successful results by userId so we process per-user
    const successByUser = new Map<string, string[]>()
    for (const r of succeeded) {
      if (!successByUser.has(r.userId)) successByUser.set(r.userId, [])
      successByUser.get(r.userId)!.push(r.queryId)
    }

    // Build queryMeta lookup for AlgorithmUpdateDetector (needs category)
    const queryMetaByUser = new Map<string, Array<{ id: string; name: string; category: string }>>()
    for (const q of due) {
      if (!queryMetaByUser.has(q.userId)) queryMetaByUser.set(q.userId, [])
      queryMetaByUser.get(q.userId)!.push({
        id:       q.id,
        name:     q.name,
        category: q.category ?? "unknown",
      })
    }

    // Run per-user post-processing (fire-and-forget — never blocks response)
    for (const [userId, queryIds] of successByUser) {
      if (queryIds.length === 0) continue

      Promise.allSettled(
        queryIds.map(async qid => {
          // Fetch the query's snapshots and run drift analysis
          const snapshots = await databaseService.snapshotService.getSnapshots(qid, userId)
          if (snapshots.length < 2) return null
          const query = due.find(q => q.id === qid)
          if (!query) return null
          return analyzeDrift(qid, query.name, snapshots)
        })
      ).then(async driftSettled => {
        const driftResults = driftSettled
          .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled" && r.value !== null)
          .map(r => r.value)

        if (driftResults.length === 0) return

        // ✅ Fire drift threshold alerts
        const alertResult = await driftAlertService.checkAndAlert(userId, driftResults)
        if (alertResult.alertsFired > 0) {
          console.log(`[Cron] Drift alerts fired for user ${userId}: ${alertResult.alertsFired}`)
        }
        if (alertResult.errors.length > 0) {
          console.warn(`[Cron] Alert errors for user ${userId}:`, alertResult.errors)
        }

        // ✅ Detect algorithm updates
        const queryMeta = queryMetaByUser.get(userId) ?? []
        const updateEvents = algorithmUpdateDetector.analyze(driftResults, queryMeta)

        if (updateEvents.length > 0) {
          console.log(
            `[Cron] Algorithm update events detected for user ${userId}: ` +
            updateEvents.map(e => `${e.category}(${e.severity})`).join(", ")
          )
          await algorithmUpdateDetector.persistEvents(userId, updateEvents)
        }
      }).catch(err => {
        console.error(`[Cron] Post-processing failed for user ${userId}:`, formatError(err))
      })
    }
    // ── END post-processing ────────────────────────────────────────────────

    console.log(
      `[Cron] Done in ${Date.now() - startTime}ms — ` +
      `${succeeded.length} succeeded, ${failed.length} failed, ${skipped} skipped`
    )

    return NextResponse.json({
      success:    true,
      processed:  due.length,
      succeeded:  succeeded.length,
      failed:     failed.length,
      skipped,
      durationMs: Date.now() - startTime,
      timestamp:  new Date().toISOString(),
    })

  } catch (err) {
    console.error("[Cron] Unexpected error:", formatError(err))
    return NextResponse.json(
      { success: false, error: "Scheduled processing failed" },
      { status: 500 }
    )
  }
}

export const GET  = handler
export const POST = handler