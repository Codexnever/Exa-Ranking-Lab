// scripts/process-scheduled.ts
//
// Runs the same scheduled-query processing as app/api/cron/process-scheduled/route.ts,
// but as a plain Node script invoked directly from GitHub Actions — not through an
// HTTP call to Vercel. This exists because Vercel's Hobby plan hard-caps serverless
// functions at 10s (even for cron-triggered ones), which is nowhere near enough time
// to process a real batch of queries. GitHub Actions jobs get up to 6 hours by default.
//
// The /api/cron/process-scheduled route itself is kept for the dashboard's manual
// "run now" trigger, where a single user's queries comfortably finish under 10s.
//
// Run locally with: npx tsx scripts/process-scheduled.ts

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
import { WeaviateService } from "@/app/services/weaviate/weaviate-service"

// ─── Constants ────────────────────────────────────────────────────────────────
// No serverless timeout here, so these can be generous. Still capped so one run
// can't run away and process your entire backlog if something upstream is slow —
// tune based on how long a single query round-trip actually takes you.

const MAX_QUERIES_PER_RUN = 200
const BATCH_SIZE          = 5
const BATCH_DELAY_MS      = 250

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

// ─── Weaviate singleton ───────────────────────────────────────────────────────

let _weaviateService: WeaviateService | null = null

async function getWeaviateService() {
  if (!_weaviateService) _weaviateService = new WeaviateService()
  return _weaviateService
}

// ─── Single query execution (unchanged from route.ts) ─────────────────────────

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
    console.log(`[Cron:Query]  Exa returned ${exaResults?.results?.length ?? 0} results for "${query.name}" in ${searchTime ?? responseTime}ms`)

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

    const snapshot = await databaseService.snapshotService.createSnapshot({
      queryId:  query.id,
      userId:   query.userId,
      results:  mappedResults,
      metadata: {
        totalResults:   mappedResults.length,
        responseTime:   searchTime ?? responseTime,
        executedAt:     new Date().toISOString(),
        executionType:  "scheduled",
        source:         "github_actions_cron",
        configHash,
        numRequested:   coverageGap.numRequested,
        numReturned:    coverageGap.numReturned,
        coverageGap:    coverageGap.gap,
        coverageRate:   parseFloat((coverageGap.gapRate * 100).toFixed(2)),
        coverageStatus: coverageGap.status,
      },
      timestamp: new Date(),
    })

    console.log(`[Cron:Query] Snapshot created: ${snapshot.id} for "${query.name}"`)

    try {
      console.log(`[Cron:Weaviate] Syncing snapshot ${snapshot.id} for "${query.name}"`)
      const w = await getWeaviateService()
      await w.initialize()
      await w.syncSnapshot(snapshot)
      console.log(`[Cron:Weaviate]  Sync complete for "${query.name}"`)
    } catch (err) {
      console.error(`[Cron:Weaviate] ❌ Sync failed for "${query.name}": ${formatError(err)}`)
    }

    await databaseService.queryService.updateQuery(query.id, { lastRun: new Date() })
    console.log(`[Cron:Query]  Updated lastRun for "${query.name}"`)

    return { queryId: query.id, userId: query.userId, status: "success", snapshotId: snapshot.id }

  } catch (err) {
    console.error(`[Cron:Query] Failed "${query.name}" (${query.id}): ${formatError(err)}`)
    return { queryId: query.id, userId: query.userId, status: "error", error: formatError(err) }
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const runId     = Math.random().toString(36).slice(2, 8).toUpperCase()
  const startTime = Date.now()

  console.log(`\n${"=".repeat(60)}`)
  console.log(`[Cron] 🚀 GitHub Actions run — runId=${runId}`)
  console.log(`[Cron] Time: ${new Date().toISOString()}`)
  console.log(`${"=".repeat(60)}\n`)

  console.log(`[Cron] Fetching all scheduled queries from Appwrite...`)
  const scheduled = await databaseService.queryService.getAllScheduledQueries()
  console.log(`[Cron] Total scheduled queries found: ${scheduled.length}`)

  const now = Date.now()
  let due = scheduled.filter(q => isQueryDue(q, now))
  console.log(`[Cron] Due queries: ${due.length} of ${scheduled.length} scheduled`)

  if (due.length === 0) {
    console.log(`[Cron] No queries due this run.`)
    return
  }

  due = due
    .sort((a, b) => overdueSortKey(a) - overdueSortKey(b))
    .slice(0, MAX_QUERIES_PER_RUN)

  console.log(`[Cron] Processing ${due.length} due queries (capped at ${MAX_QUERIES_PER_RUN})`)

  const apiKeyCache = new Map<string, string | null>()
  async function getApiKey(userId: string): Promise<string | null> {
    if (apiKeyCache.has(userId)) return apiKeyCache.get(userId)!
    const settingsRes = await databases.listDocuments(
      DATABASE_ID, COLLECTIONS.SETTINGS, [Query.equal("userId", userId)]
    )
    const key = (settingsRes?.documents?.[0]?.apiKey as string | undefined) ?? null
    if (!key) console.warn(`[Cron] ⚠️  No API key found for userId=${userId} — queries will be skipped`)
    apiKeyCache.set(userId, key)
    return key
  }

  const results: Array<{ queryId: string; userId: string; status: string; snapshotId?: string; error?: string }> = []
  let skipped = 0

  for (let i = 0; i < due.length; i += BATCH_SIZE) {
    const batch = due.slice(i, i + BATCH_SIZE)
    console.log(`\n[Cron] --- Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(due.length / BATCH_SIZE)} ---`)

    const batchResults = await Promise.allSettled(
      batch.map(async query => {
        const apiKey = await getApiKey(query.userId)
        if (!apiKey) {
          skipped++
          return { queryId: query.id, userId: query.userId, status: "skipped" as const }
        }
        return executeOneQuery(query, apiKey)
      })
    )

    for (const r of batchResults) {
      if (r.status === "fulfilled") {
        results.push(r.value)
      } else {
        console.error(`[Cron] ❌ Batch promise rejected: ${formatError(r.reason)}`)
        results.push({ queryId: "unknown", userId: "unknown", status: "error", error: formatError(r.reason) })
      }
    }

    if (i + BATCH_SIZE < due.length) {
      await new Promise(res => setTimeout(res, BATCH_DELAY_MS))
    }
  }

  const succeeded = results.filter(r => r.status === "success")
  const failed    = results.filter(r => r.status === "error")

  console.log(`\n[Cron] Execution complete — ${succeeded.length} succeeded, ${failed.length} failed, ${skipped} skipped`)

  // ── Post-processing (alerts + algorithm detection) — same as route.ts ───────
  const successByUser = new Map<string, string[]>()
  for (const r of succeeded) {
    if (!successByUser.has(r.userId)) successByUser.set(r.userId, [])
    successByUser.get(r.userId)!.push(r.queryId)
  }

  const queryMetaByUser = new Map<string, Array<{ id: string; name: string; category: string }>>()
  for (const q of due) {
    if (!queryMetaByUser.has(q.userId)) queryMetaByUser.set(q.userId, [])
    queryMetaByUser.get(q.userId)!.push({ id: q.id, name: q.name, category: q.category ?? "unknown" })
  }

  for (const [userId, queryIds] of successByUser) {
    if (queryIds.length === 0) continue
    try {
      const driftSettled = await Promise.allSettled(
        queryIds.map(async qid => {
          const snapshots = await databaseService.snapshotService.getSnapshots(qid, userId)
          if (snapshots.length < 2) return null
          const query = due.find(q => q.id === qid)
          if (!query) return null
          return analyzeDrift(qid, query.name, snapshots)
        })
      )
      const driftResults = driftSettled
        .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled" && r.value !== null)
        .map(r => r.value)

      if (driftResults.length === 0) continue

      const alertResult = await driftAlertService.checkAndAlert(userId, driftResults)
      console.log(`[Cron:PostProcess] Alerts fired: ${alertResult.alertsFired} for userId=${userId}`)

      const queryMeta    = queryMetaByUser.get(userId) ?? []
      const updateEvents = await algorithmUpdateDetector.detect(driftResults, queryMeta, userId)
      if (updateEvents.length > 0) {
        await algorithmUpdateDetector.persistEvents(userId, updateEvents)
        console.log(`[Cron:PostProcess] ✅ Persisted ${updateEvents.length} algorithm update event(s) for userId=${userId}`)
      }
    } catch (err) {
      console.error(`[Cron:PostProcess] ❌ Failed for userId=${userId}: ${formatError(err)}`)
    }
  }

  const durationMs = Date.now() - startTime
  console.log(`\n${"=".repeat(60)}`)
  console.log(`[Cron] 🏁 Run ${runId} complete in ${durationMs}ms`)
  console.log(`[Cron] Processed: ${due.length} | Succeeded: ${succeeded.length} | Failed: ${failed.length} | Skipped: ${skipped}`)
  console.log(`${"=".repeat(60)}\n`)

  // Fail the Actions job loudly if every single due query errored — a partial
  // failure still exits 0 so one bad query doesn't mask the rest of the run.
  if (due.length > 0 && failed.length === due.length) {
    console.error(`[Cron] All ${due.length} due queries failed.`)
    process.exitCode = 1
  }
}

main().catch(err => {
  console.error(`[Cron] ❌ Unexpected top-level error: ${formatError(err)}`)
  process.exitCode = 1
})