// app/api/cron/process-scheduled/route.ts
//
// Scheduled query execution. Triggered by an external scheduler:
//   - Vercel Cron (recommended — see vercel.json snippet below)
//   - Or any cron service hitting this URL with the CRON_SECRET header
//
// ─── Vercel Cron setup ─────────────────────────────────────────────────────
// 1. Set CRON_SECRET in your environment variables (generate with
//    `openssl rand -hex 32`).
// 2. Add to vercel.json:
//      {
//        "crons": [{ "path": "/api/cron/process-scheduled", "schedule": "*/30 * * * *" }]
//      }
//    Vercel automatically sends `Authorization: Bearer $CRON_SECRET` on
//    cron-triggered requests when CRON_SECRET is set.
// 3. Note: */30 (every 30 min) requires a Pro plan on Vercel — Hobby plan
//    cron jobs run at most once per day. For Hobby, use an external cron
//    service (cron-job.org, GitHub Actions scheduled workflow, etc.)
//    hitting this URL with the Authorization header on your desired interval.
//
// ─── Manual trigger (testing) ──────────────────────────────────────────────
//   curl -X GET https://yourapp.com/api/cron/process-scheduled \
//        -H "Authorization: Bearer $CRON_SECRET"

import { NextRequest, NextResponse } from "next/server"
import { databaseService } from "@/app/services/database/database-service"
import { databases, DATABASE_ID, COLLECTIONS } from "@/app/server/appwrite/appwrite-server"
import { Query } from "node-appwrite"
import { ExaClient } from "@/app/server/exa/exa-client"
import { createHash } from "crypto"
import type { QueryConfig, SearchResult } from "@/types/type"

// ─── Constants ────────────────────────────────────────────────────────────────

// Cap per invocation — keeps the route within serverless function time limits.
// Most-overdue queries are processed first; remainder picked up next run.
const MAX_QUERIES_PER_RUN = 30
const BATCH_SIZE          = 3
const BATCH_DELAY_MS      = 500

// ─── Weaviate singleton (same lazy pattern as run/route.ts) ───────────────────

let _weaviateService: import("@/app/services/weaviate/weaviate-service").WeaviateService | null = null

async function getWeaviateService() {
  if (!_weaviateService) {
    const { WeaviateService } = await import("@/app/services/weaviate/weaviate-service")
    _weaviateService = new WeaviateService()
  }
  return _weaviateService
}

// ─── Content type mapping (shared with run/route.ts) ─────────────────────────

const EXA_TYPE_MAP: Record<string, SearchResult["contentType"]> = {
  pdf: "pdf", tweet: "tweet", github: "github",
  news: "news", word: "word", article: "article",
}

function mapContentType(raw: string | undefined): SearchResult["contentType"] {
  return EXA_TYPE_MAP[raw?.toLowerCase() ?? ""] ?? "article"
}

// ─── Error formatting ──────────────────────────────────────────────────────────

function formatError(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === "string") return err
  try { return JSON.stringify(err) } catch { return String(err) }
}

// ─── Due-query check ────────────────────────────────────────────────────────
// Same logic as use-queries-store.ts getDueQueries — kept in sync manually.

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

/** Sort most-overdue first: never-run (no lastRun) comes first, then oldest lastRun. */
function overdueSortKey(query: QueryConfig): number {
  return query.lastRun ? new Date(query.lastRun).getTime() : 0
}

// ─── Auth check ────────────────────────────────────────────────────────────────

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error("[Cron] CRON_SECRET not set — rejecting all requests")
    return false
  }
  const auth = request.headers.get("authorization")
  return auth === `Bearer ${secret}`
}

// ─── Single query execution (mirrors run/route.ts executeQuery) ──────────────

async function executeOneQuery(
  query:  QueryConfig,
  apiKey: string
): Promise<{ queryId: string; status: "success" | "error"; snapshotId?: string; error?: string }> {
  try {
    const filters   = query.filters ?? {}
    const exaClient = new ExaClient(apiKey)
    const startTime = Date.now()

    const exaResults = await exaClient.search({
      query:          query.query,
      category:       query.category,
      includeDomains: filters.includeDomains,
      excludeDomains: filters.excludeDomains,
      startDate:      filters.startDate,
      endDate:        filters.endDate,
      numResults:     filters.numResults,
    })


    const mappedResults: SearchResult[] = (exaResults?.results ?? []).map((r: any, idx: number) => {
      const title   = r.title   ?? ""
      const snippet = r.snippet ?? r.summary ?? ""
      const url     = r.url     ?? ""
      const fulltext = r.text    ?? r.fullText ?? ""
      let domain    = r.domain  ?? ""
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
    const {responseTime} = exaResults

    const snapshot = await databaseService.snapshotService.createSnapshot({
      queryId:  query.id,
      userId:   query.userId,
      results:  mappedResults,
      metadata: {
        totalResults:  mappedResults.length,
        responseTime: responseTime,
        executedAt:    new Date().toISOString(),
        executionType: "scheduled",
        source:        "cron_scheduler",
      },
      timestamp: new Date(),
    })

    // Weaviate sync — fire-and-forget, non-critical
    getWeaviateService()
      .then(w => w.initialize().then(() => w.syncSnapshot(snapshot)))
      .catch(err => console.error(
        `[Cron] Weaviate sync failed (non-critical) for ${snapshot.id}: ${formatError(err)}`
      ))

    await databaseService.queryService.updateQuery(query.id, { lastRun: new Date() })

    return { queryId: query.id, status: "success", snapshotId: snapshot.id }
  } catch (err) {
    console.error(`[Cron] Query ${query.id} failed:`, formatError(err))
    return { queryId: query.id, status: "error", error: formatError(err) }
  }
}

// ─── GET/POST handler ──────────────────────────────────────────────────────────

async function handler(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const startTime = Date.now()
  console.log("[Cron] Starting scheduled query processing...")

  try {
    // ── Find all due queries across all users ──────────────────────────────
    const scheduled = await databaseService.queryService.getAllScheduledQueries()
    const now  = Date.now()
    let due = scheduled.filter(q => isQueryDue(q, now))

    console.log(`[Cron] ${scheduled.length} scheduled, ${due.length} due`)

    if (due.length === 0) {
      return NextResponse.json({
        success: true, message: "No queries due",
        processed: 0, succeeded: 0, failed: 0, skipped: 0,
        timestamp: new Date().toISOString(),
      })
    }

    // ── Cap and prioritise most-overdue first ───────────────────────────────
    due = due
      .sort((a, b) => overdueSortKey(a) - overdueSortKey(b))
      .slice(0, MAX_QUERIES_PER_RUN)

    if (scheduled.filter(q => isQueryDue(q, now)).length > MAX_QUERIES_PER_RUN) {
      console.warn(
        `[Cron] More than ${MAX_QUERIES_PER_RUN} queries due — processing the ` +
        `most overdue ${MAX_QUERIES_PER_RUN}; remainder will run next invocation.`
      )
    }

    // ── Fetch each user's API key once (cached per run) ─────────────────────
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

    // ── Execute in batches ───────────────────────────────────────────────────
    const results: Array<{ queryId: string; status: string; snapshotId?: string; error?: string }> = []
    let skipped = 0

    for (let i = 0; i < due.length; i += BATCH_SIZE) {
      const batch = due.slice(i, i + BATCH_SIZE)

      const batchResults = await Promise.allSettled(
        batch.map(async query => {
          const apiKey = await getApiKey(query.userId)
          if (!apiKey) {
            skipped++
            console.warn(`[Cron] Skipping query ${query.id} — user ${query.userId} has no API key`)
            return { queryId: query.id, status: "skipped" as const }
          }
          return executeOneQuery(query, apiKey)
        })
      )

      for (const r of batchResults) {
        if (r.status === "fulfilled") {
          results.push(r.value)
        } else {
          results.push({ queryId: "unknown", status: "error", error: formatError(r.reason) })
        }
      }

      if (i + BATCH_SIZE < due.length) {
        await new Promise(res => setTimeout(res, BATCH_DELAY_MS))
      }
    }

    const succeeded = results.filter(r => r.status === "success").length
    const failed    = results.filter(r => r.status === "error").length

    console.log(
      `[Cron] Done in ${Date.now() - startTime}ms — ` +
      `${succeeded} succeeded, ${failed} failed, ${skipped} skipped`
    )

    return NextResponse.json({
      success:   true,
      processed: due.length,
      succeeded,
      failed,
      skipped,
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error("[Cron] Unexpected error:", formatError(err))
    return NextResponse.json(
      { success: false, error: "Scheduled processing failed" },
      { status: 500 }
    )
  }
}

// Vercel Cron sends GET; support POST too for manual/external triggers
export const GET  = handler
export const POST = handler