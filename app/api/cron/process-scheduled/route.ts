// app/api/cron/process-scheduled/route.ts
import { NextRequest, NextResponse } from "next/server"
import { databaseService } from "@/app/services/database/database-service"
import { databases, DATABASE_ID, COLLECTIONS } from "@/app/server/appwrite/appwrite-server"
import { Query } from "node-appwrite"
import { ExaClient } from "@/app/server/exa/exa-client"
import { createHash } from "crypto"
import type { QueryConfig, SearchResult } from "@/types/type"

import { driftAlertService }       from "@/app/services/DriftAlertService"
import { algorithmUpdateDetector } from "@/lib/services/algorithm-detector"
import { analyzeDrift }             from "@/app/logic/driftAnalyzer"
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
    console.error("[Cron] ❌ CRON_SECRET env var not set — rejecting all requests")
    return false
  }
  const authHeader = request.headers.get("authorization")
  if (!authHeader) {
    console.error("[Cron] ❌ No Authorization header in request")
    return false
  }
  const matches = authHeader === `Bearer ${secret}`
  if (!matches) {
    console.error("[Cron] ❌ Authorization header does not match CRON_SECRET")
  }
  return matches
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
  console.log(`[Cron:Query] ▶ Starting query "${query.name}" (${query.id})`)

  try {
    const filters   = query.filters ?? {}
    const exaClient = new ExaClient(apiKey)

    console.log(`[Cron:Query] Calling Exa for "${query.name}" — numResults=${filters.numResults}, category=${query.category}`)

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
    console.log(`[Cron:Query] ✅ Exa returned ${exaResults?.results?.length ?? 0} results for "${query.name}" in ${searchTime ?? responseTime}ms`)

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

    const configHash  = computeConfigHash(query)
    const coverageGap = computeCoverageGap(filters.numResults ?? 50, mappedResults.length)

    console.log(`[Cron:Query] Coverage for "${query.name}": ${coverageGap.numReturned}/${coverageGap.numRequested} (${coverageGap.status}) | configHash=${configHash}`)

    console.log(`[Cron:Query] Creating snapshot for "${query.name}"...`)
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
        configHash,
        numRequested:   coverageGap.numRequested,
        numReturned:    coverageGap.numReturned,
        coverageGap:    coverageGap.gap,
        coverageRate:   parseFloat((coverageGap.gapRate * 100).toFixed(2)),
        coverageStatus: coverageGap.status,
      },
      timestamp: new Date(),
    })

    console.log(`[Cron:Query] ✅ Snapshot created: ${snapshot.id} for "${query.name}"`)

    // Weaviate sync — fire-and-forget
    getWeaviateService()
      .then(w => {
        console.log(`[Cron:Weaviate] Syncing snapshot ${snapshot.id} for "${query.name}"`)
        return w.initialize().then(() => w.syncSnapshot(snapshot))
      })
      .then(() => console.log(`[Cron:Weaviate] ✅ Sync complete for "${query.name}"`))
      .catch(err => console.error(`[Cron:Weaviate] ❌ Sync failed for "${query.name}": ${formatError(err)}`))

    await databaseService.queryService.updateQuery(query.id, { lastRun: new Date() })
    console.log(`[Cron:Query] ✅ Updated lastRun for "${query.name}"`)

    return { queryId: query.id, userId: query.userId, status: "success", snapshotId: snapshot.id }

  } catch (err) {
    console.error(`[Cron:Query] ❌ Failed "${query.name}" (${query.id}): ${formatError(err)}`)
    return { queryId: query.id, userId: query.userId, status: "error", error: formatError(err) }
  }
}

// ─── GET/POST handler ─────────────────────────────────────────────────────────

async function handler(request: NextRequest) {
  const runId     = Math.random().toString(36).slice(2, 8).toUpperCase()
  const startTime = Date.now()

  // ── STEP 1: Log that the route was actually hit ───────────────────────────
  console.log(`\n${"=".repeat(60)}`)
  console.log(`[Cron] 🚀 Route hit — runId=${runId}`)
  console.log(`[Cron] Method: ${request.method}`)
  console.log(`[Cron] URL: ${request.url}`)
  console.log(`[Cron] Time: ${new Date().toISOString()}`)
  console.log(`[Cron] Has Authorization header: ${!!request.headers.get("authorization")}`)
  console.log(`[Cron] CRON_SECRET set: ${!!process.env.CRON_SECRET}`)
  console.log(`[Cron] NODE_ENV: ${process.env.NODE_ENV}`)
  console.log(`${"=".repeat(60)}\n`)

  // ── STEP 2: Auth check ────────────────────────────────────────────────────
  if (!isAuthorized(request)) {
    console.error(`[Cron] ❌ Unauthorized — returning 401`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  console.log(`[Cron] ✅ Authorization passed`)

  try {
    // ── STEP 3: Fetch all scheduled queries ──────────────────────────────────
    console.log(`[Cron] Fetching all scheduled queries from Appwrite...`)
    const scheduled = await databaseService.queryService.getAllScheduledQueries()
    console.log(`[Cron] Total scheduled queries found: ${scheduled.length}`)

    if (scheduled.length > 0) {
      scheduled.forEach(q => {
        console.log(`[Cron]   • "${q.name}" (${q.id}) | enabled=${q.schedule?.enabled} | freq=${q.schedule?.frequency} | lastRun=${q.lastRun ?? "never"}`)
      })
    } else {
      console.log(`[Cron] ⚠️  No queries found with schedule.enabled=true in Appwrite`)
    }

    // ── STEP 4: Filter which are due ─────────────────────────────────────────
    const now = Date.now()
    let due   = scheduled.filter(q => isQueryDue(q, now))

    console.log(`\n[Cron] Due queries: ${due.length} of ${scheduled.length} scheduled`)
    if (due.length === 0 && scheduled.length > 0) {
      scheduled.forEach(q => {
        const lastRunMs  = q.lastRun ? new Date(q.lastRun).getTime() : 0
        const diffMins   = Math.floor((now - lastRunMs) / 60000)
        const freqNeeded = q.schedule?.frequency === "hourly" ? 60
          : q.schedule?.frequency === "daily"  ? 1440
          : q.schedule?.frequency === "weekly" ? 10080
          : 0
        console.log(`[Cron]   • "${q.name}": ran ${diffMins}min ago, needs ${freqNeeded}min interval → ${diffMins >= freqNeeded ? "DUE" : "not due yet"}`)
      })
    }

    if (due.length === 0) {
      console.log(`[Cron] No queries due this run. Returning early.`)
      return NextResponse.json({
        success: true,
        message: "No queries due",
        processed: 0, succeeded: 0, failed: 0, skipped: 0,
        runId,
        timestamp: new Date().toISOString(),
      })
    }

    due = due
      .sort((a, b) => overdueSortKey(a) - overdueSortKey(b))
      .slice(0, MAX_QUERIES_PER_RUN)

    console.log(`[Cron] Processing ${due.length} due queries (capped at ${MAX_QUERIES_PER_RUN})`)

    // ── STEP 5: API key cache ─────────────────────────────────────────────────
    const apiKeyCache = new Map<string, string | null>()

    async function getApiKey(userId: string): Promise<string | null> {
      if (apiKeyCache.has(userId)) return apiKeyCache.get(userId)!
      console.log(`[Cron] Fetching API key for userId=${userId}`)
      const settingsRes = await databases.listDocuments(
        DATABASE_ID, COLLECTIONS.SETTINGS, [Query.equal("userId", userId)]
      )
      const key = (settingsRes?.documents?.[0]?.apiKey as string | undefined) ?? null
      if (key) {
        console.log(`[Cron] ✅ API key found for userId=${userId}`)
      } else {
        console.warn(`[Cron] ⚠️  No API key found for userId=${userId} — queries will be skipped`)
      }
      apiKeyCache.set(userId, key)
      return key
    }

    // ── STEP 6: Execute batches ───────────────────────────────────────────────
    const results: Array<{
      queryId:    string
      userId:     string
      status:     string
      snapshotId?: string
      error?:      string
    }> = []
    let skipped = 0

    for (let i = 0; i < due.length; i += BATCH_SIZE) {
      const batch     = due.slice(i, i + BATCH_SIZE)
      const batchNum  = Math.floor(i / BATCH_SIZE) + 1
      const totalBatches = Math.ceil(due.length / BATCH_SIZE)

      console.log(`\n[Cron] --- Batch ${batchNum}/${totalBatches} (${batch.length} queries) ---`)

      const batchResults = await Promise.allSettled(
        batch.map(async query => {
          const apiKey = await getApiKey(query.userId)
          if (!apiKey) {
            skipped++
            console.warn(`[Cron] ⚠️  Skipping "${query.name}" — no API key`)
            return { queryId: query.id, userId: query.userId, status: "skipped" as const }
          }
          return executeOneQuery(query, apiKey)
        })
      )

      for (const r of batchResults) {
        if (r.status === "fulfilled") {
          results.push(r.value)
          if (r.value.status === "success") {
            console.log(`[Cron] ✅ Batch result: "${r.value.queryId}" succeeded → snapshot ${r.value.snapshotId}`)
          } else {
            console.log(`[Cron] ⚠️  Batch result: "${r.value.queryId}" ${r.value.status}${r.value.error ? ` — ${r.value.error}` : ""}`)
          }
        } else {
          console.error(`[Cron] ❌ Batch promise rejected: ${formatError(r.reason)}`)
          results.push({ queryId: "unknown", userId: "unknown", status: "error", error: formatError(r.reason) })
        }
      }

      if (i + BATCH_SIZE < due.length) {
        console.log(`[Cron] Waiting ${BATCH_DELAY_MS}ms before next batch...`)
        await new Promise(res => setTimeout(res, BATCH_DELAY_MS))
      }
    }

    const succeeded = results.filter(r => r.status === "success")
    const failed    = results.filter(r => r.status === "error")

    console.log(`\n[Cron] Execution complete — ${succeeded.length} succeeded, ${failed.length} failed, ${skipped} skipped`)

    // ── STEP 7: Post-processing (alerts + algorithm detection) ────────────────
    console.log(`[Cron] Starting post-processing (fire-and-forget)...`)

    const successByUser = new Map<string, string[]>()
    for (const r of succeeded) {
      if (!successByUser.has(r.userId)) successByUser.set(r.userId, [])
      successByUser.get(r.userId)!.push(r.queryId)
    }

    const queryMetaByUser = new Map<string, Array<{ id: string; name: string; category: string }>>()
    for (const q of due) {
      if (!queryMetaByUser.has(q.userId)) queryMetaByUser.set(q.userId, [])
      queryMetaByUser.get(q.userId)!.push({
        id:       q.id,
        name:     q.name,
        category: q.category ?? "unknown",
      })
    }

    for (const [userId, queryIds] of successByUser) {
      if (queryIds.length === 0) continue

      console.log(`[Cron:PostProcess] Running drift analysis for userId=${userId} (${queryIds.length} queries)`)

      Promise.allSettled(
        queryIds.map(async qid => {
          console.log(`[Cron:PostProcess] Fetching snapshots for queryId=${qid}`)
          const snapshots = await databaseService.snapshotService.getSnapshots(qid, userId)
          console.log(`[Cron:PostProcess] Found ${snapshots.length} snapshots for queryId=${qid}`)
          if (snapshots.length < 2) {
            console.log(`[Cron:PostProcess] Skipping drift analysis for ${qid} — need 2+ snapshots, have ${snapshots.length}`)
            return null
          }
          const query = due.find(q => q.id === qid)
          if (!query) return null
          console.log(`[Cron:PostProcess] Running analyzeDrift for "${query.name}"`)
          return analyzeDrift(qid, query.name, snapshots)
        })
      ).then(async driftSettled => {
        const driftResults = driftSettled
          .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled" && r.value !== null)
          .map(r => r.value)

        console.log(`[Cron:PostProcess] Drift analysis complete for userId=${userId} — ${driftResults.length} results`)

        if (driftResults.length === 0) {
          console.log(`[Cron:PostProcess] No drift results for userId=${userId} — skipping alerts`)
          return
        }

        // Drift alerts
        console.log(`[Cron:PostProcess] Checking drift alert thresholds for userId=${userId}`)
        const alertResult = await driftAlertService.checkAndAlert(userId, driftResults)
        console.log(`[Cron:PostProcess] Alerts fired: ${alertResult.alertsFired} | Errors: ${alertResult.errors.length}`)
        if (alertResult.errors.length > 0) {
          console.warn(`[Cron:PostProcess] Alert errors:`, alertResult.errors)
        }

        // Algorithm update detection
        console.log(`[Cron:PostProcess] Running algorithm update detection for userId=${userId}`)
        const queryMeta    = queryMetaByUser.get(userId) ?? []
        const updateEvents = await algorithmUpdateDetector.detect(driftResults, queryMeta, userId)
        console.log(`[Cron:PostProcess] Algorithm update events detected: ${updateEvents.length}`)

        if (updateEvents.length > 0) {
          updateEvents.forEach(e =>
            console.log(`[Cron:PostProcess]   • ${e.category} — ${e.severity} (${Math.round(e.metrics.driftRate * 100)}% drift rate, avg score ${e.metrics.avgDriftScore.toFixed(1)}, ${e.confidence.score}% confidence)`)
          )
          await algorithmUpdateDetector.persistEvents(userId, updateEvents)
          console.log(`[Cron:PostProcess] ✅ Persisted ${updateEvents.length} algorithm update event(s)`)
        }

      }).catch((err: unknown) => {
        console.error(`[Cron:PostProcess] ❌ Failed for userId=${userId}: ${formatError(err)}`)
      })
    }

    // ── STEP 8: Final summary ─────────────────────────────────────────────────
    const durationMs = Date.now() - startTime
    console.log(`\n${"=".repeat(60)}`)
    console.log(`[Cron] 🏁 Run ${runId} complete in ${durationMs}ms`)
    console.log(`[Cron] Processed: ${due.length} | Succeeded: ${succeeded.length} | Failed: ${failed.length} | Skipped: ${skipped}`)
    if (failed.length > 0) {
      failed.forEach(f => console.error(`[Cron]   ❌ ${f.queryId}: ${f.error}`))
    }
    console.log(`${"=".repeat(60)}\n`)

    return NextResponse.json({
      success:    true,
      runId,
      processed:  due.length,
      succeeded:  succeeded.length,
      failed:     failed.length,
      skipped,
      durationMs,
      timestamp:  new Date().toISOString(),
    })

  } catch (err) {
    const durationMs = Date.now() - startTime
    console.error(`[Cron] ❌ Unexpected top-level error after ${durationMs}ms: ${formatError(err)}`)
    return NextResponse.json(
      { success: false, error: "Scheduled processing failed", runId, durationMs },
      { status: 500 }
    )
  }
}

export const GET  = handler
export const POST = handler
