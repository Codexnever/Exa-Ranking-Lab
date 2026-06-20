// app/api/queries/[id]/run/route.ts
import { type NextRequest, NextResponse } from "next/server"
import { databaseService } from "@/app/services/database/database-service"
import { databases, DATABASE_ID, COLLECTIONS, Query, ID } from "@/app/server/appwrite/appwrite-server"
import { ExaClient } from "@/app/server/exa/exa-client"
import { withEnhancedSecurity } from "@/lib/middleware/security/security-middleware"
import { createHash } from "crypto"
import type { SecurityContext, QueryConfig, SearchResult } from "@/types/type"

// ─── Weaviate singleton ────────────────────────────────────────────────────────

let _weaviateService: import("@/app/services/weaviate/weaviate-service").WeaviateService | null = null

async function getWeaviateService() {
  if (!_weaviateService) {
    const { WeaviateService } = await import("@/app/services/weaviate/weaviate-service")
    _weaviateService = new WeaviateService()
  }
  return _weaviateService
}

// ─── Concurrent execution dedup ───────────────────────────────────────────────
// Prevents duplicate parallel executions for the same user+query combination.
// TTL of 30 s: any execution running longer than this is assumed to have leaked.

const activeExecutions = new Map<string, { timestamp: number; promise: Promise<NextResponse> }>()
const EXECUTION_TTL_MS = 30_000

// ─── Content type mapping ─────────────────────────────────────────────────────

const EXA_TYPE_MAP: Record<string, SearchResult["contentType"]> = {
  pdf:     "pdf",
  tweet:   "tweet",
  github:  "github",
  news:    "news",
  word:    "word",
  article: "article",
}

function mapContentType(raw: string | undefined): SearchResult["contentType"] {
  return EXA_TYPE_MAP[raw?.toLowerCase() ?? ""] ?? "article"
}

// ─── Error formatting ─────────────────────────────────────────────────────────
//
// Extracts message/code/status from any error shape so logs show
// "[Gemini] 429: quota exceeded" or "[Weaviate] 429: USAGE_LIMIT_EXCEEDED"
// instead of a bare "429".

function formatSyncError(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === "string") return err
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>
    const parts: string[] = []
    if (e.message)   parts.push(String(e.message))
    if (e.code)      parts.push(`code=${e.code}`)
    if (e.status)    parts.push(`status=${e.status}`)
    if (e.errorCode) parts.push(`errorCode=${e.errorCode}`)
    if (parts.length) return parts.join(" | ")
    try { return JSON.stringify(e) } catch { return String(e) }
  }
  return String(err)
}

// ─── Route handler ────────────────────────────────────────────────────────────

export const POST = withEnhancedSecurity(
  async (
    request:     NextRequest,
    context:     SecurityContext,
    routeParams: { params: Promise<{ id: string }> }
  ) => {
    const { id: queryId } = await routeParams.params

    if (!queryId || typeof queryId !== "string") {
      return NextResponse.json({ error: "Invalid query ID" }, { status: 400 })
    }

    const query = await databaseService.queryService.getQuery(queryId)
    if (!query || query.userId !== context.user.$id) {
      return NextResponse.json({ error: "Query not found" }, { status: 404 })
    }

    const execKey  = `${context.user.$id}-${queryId}`
    const existing = activeExecutions.get(execKey)

    if (existing && Date.now() - existing.timestamp < EXECUTION_TTL_MS) {
      console.log(`[QueryRun] Joining existing execution for: ${queryId}`)
      try {
        return await existing.promise
      } catch {
        activeExecutions.delete(execKey)
      }
    }

    const promise = executeQuery(context.user, query, queryId)
    activeExecutions.set(execKey, { timestamp: Date.now(), promise })

    try {
      return await promise
    } finally {
      activeExecutions.delete(execKey)
    }
  },
  {
    rateLimit: {
      maxRequests: 10,
      windowMs:    60 * 1_000,
      onLimitReached: (userId: string) => {
        console.warn(`[RateLimit] User ${userId} exceeded query execution limit`)
      },
    },
    allowedMethods: ["POST"],
    logAttempts:    true,
  }
)

// ─── Core execution logic ─────────────────────────────────────────────────────

async function executeQuery(
  user:    { $id: string },
  query:   QueryConfig,
  queryId: string
): Promise<NextResponse> {
  try {
    const filters = query.filters ?? {}

    const settingsRes = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.SETTINGS,
      [Query.equal("userId", user.$id)]
    )

    const apiKey = settingsRes?.documents?.[0]?.apiKey as string | undefined
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing API key. Please add your Exa API key in Settings." },
        { status: 400 }
      )
    }

    const exaClient = new ExaClient(apiKey)

    console.log(`[QueryRun] Executing search for query: ${queryId}`)
console.log(
  "[QueryRun] Query filters:",
  JSON.stringify(filters, null, 2)
)

console.log(
  "[QueryRun] Sending to Exa:",
  JSON.stringify({
    results: filters.numResults,
    numResults: filters.numResults,
  }, null, 2)
)
    const exaResponse = await exaClient.search({
      query:          query.query,
      category:       query.category,
      results:        filters.numResults,
      includeDomains: filters.includeDomains,
      excludeDomains: filters.excludeDomains,
      startDate:      filters.startDate,
      endDate:        filters.endDate,
      numResults:     filters.numResults,
    })
console.log(`[QueryRun] Exa response received for query: ${queryId} exaResponse:${JSON.stringify(exaResponse)}`) 
    // FIX: Use searchTime (ms, server-side from Exa) as the canonical response
    //      time stored in snapshot metadata and returned to the client.
    //      Previous code measured wall-clock ms here independently, creating a
    //      second timing source that disagreed with exa-client's own measurement.
    //      responseTime (full RTT ms) is also available on exaResponse if needed
    //      for SLA monitoring, but searchTime is the right value for analytics.
    const { responseTime, searchTime } = exaResponse

    const mappedResults: SearchResult[] = (exaResponse.results ?? []).map(
      (r, idx) => {
        const title    = r.title    ?? ""
        const snippet  = r.snippet  ?? ""
        const url      = r.url      ?? ""
        const fulltext = r.fullText ?? ""

        let domain = ""
        if (url) {
          try { domain = new URL(url).hostname } catch { /* malformed URL */ }
        }

        const contentHash = createHash("sha256")
          .update(`${title}|${snippet}|${fulltext.slice(0, 5_000)}|${url}`, "utf8")
          .digest("hex")

        return {
          ...r,
          id:          `${queryId}_${idx}`,
          position:    idx + 1,
          domain,
          contentType: mapContentType((r as any).type),
          title,
          snippet,
          url,
          contentHash,
          timestamp:   new Date(),
          score:       typeof r.score === "number" ? r.score : 0,
        } as SearchResult
      }
    )

    console.log(
      `[QueryRun] ${mappedResults.length} results for query: ${queryId} ` +
      `(Exa searchTime: ${searchTime}ms, RTT: ${responseTime}ms)`
    )
//here wrong result came 
    const snapshot = await databaseService.snapshotService.createSnapshot({
      queryId:  query.id,
      userId:   user.$id,
      results:  mappedResults,
      metadata: {
        totalResults:  mappedResults.length,
        // searchTime is server-side ms from Exa; stored as-is for analytics accuracy
        responseTime:  responseTime,
        executedAt:    new Date().toISOString(),
        executionType: "manual",
        source:        "query_run_api",
        // Surface cost data for monitoring — zero-cost fields omitted downstream    
      },
      timestamp: new Date(),
    })

    console.log(`[QueryRun] Snapshot created: ${snapshot.id}`)

    // ── Weaviate sync (non-critical — never blocks response) ──────────────────
    //
    // Promise.then chaining (not await) so this runs after the response is sent.
    // WeaviateService has an internal circuit breaker (60 s cooldown after a
    // failed initialize()) so repeated 429s during a burst won't each trigger
    // a fresh failing network call.
    getWeaviateService()
      .then(w => w.initialize().then(() => w.syncSnapshot(snapshot)))
      .then(() => console.log(`[QueryRun] Weaviate sync complete: ${snapshot.id}`))
      .catch(err => {
        console.error(
          `[QueryRun] Weaviate sync failed (non-critical) for snapshot ${snapshot.id}: ` +
          formatSyncError(err)
        )
      })

    await databaseService.queryService.updateQuery(query.id, { lastRun: new Date() })

    return NextResponse.json({
      success:      true,
      results:      mappedResults,
      // Return both timings so the client can display the server-side figure
      // while the monitoring layer records full RTT separately
      searchTime: searchTime,
      responseTime: responseTime,
      totalResults: mappedResults.length,
      timestamp:    new Date().toISOString(),
      snapshotId:   snapshot.id,
      source:       "query_run_api",
      requestId:    exaResponse.requestId,
    })

  } catch (err) {
    console.error(`[QueryRun] Execution failed for query ${queryId}:`, formatSyncError(err))

    const message = err instanceof Error ? err.message : String(err)
    const isUserFacing =
      message.includes("Missing API key") ||
      message.includes("Exa API Error")   ||
      message.includes("Invalid query")

    return NextResponse.json(
      { error: isUserFacing ? message : "Search execution failed. Please try again." },
      { status: 500 }
    )
  }
}