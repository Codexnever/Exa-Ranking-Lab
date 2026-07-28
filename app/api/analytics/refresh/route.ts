// app/api/analytics/refresh/route.ts
import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/middleware/authentication/auth"
import { databaseService } from "@/app/services/database/database-service"
import { ExaClient } from "@/app/server/exa/exa-client"
import { databases, DATABASE_ID, COLLECTIONS } from "@/app/server/appwrite/appwrite"
import { Query } from "appwrite"
import { createHash } from "crypto"
import type { SearchResult } from "@/types/type"
// ─── Constants ────────────────────────────────────────────────────────────────

const BATCH_SIZE       = 3    // concurrent Exa calls per batch
const MAX_QUERY_IDS    = 50   // cap on explicit queryIds to prevent abuse
const RATE_LIMIT_MS    = 5 * 60 * 1000  // 5 minutes between full refreshes per user

// ─── Per-user rate limiting (in-process best-effort) ─────────────────────────
// ⚠️  In-process Map — does not deduplicate across serverless instances.
//    For production cross-instance limiting use Redis/Upstash.
const lastRefresh = new Map<string, number>()

// ─── Content type mapping (shared with run/route.ts) ─────────────────────────

const EXA_TYPE_MAP: Record<string, SearchResult["contentType"]> = {
  pdf: "pdf", tweet: "tweet", github: "github",
  news: "news", word: "word", article: "article",
}

function mapContentType(raw: string | undefined): SearchResult["contentType"] {
  return EXA_TYPE_MAP[raw?.toLowerCase() ?? ""] ?? "article"
}

// ─── POST /api/analytics/refresh ─────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // ── Rate limiting ───────────────────────────────────────────────────────
    const last = lastRefresh.get(user.$id) ?? 0
    const wait = RATE_LIMIT_MS - (Date.now() - last)
    if (wait > 0) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded",
          message: `Please wait ${Math.ceil(wait / 1000)}s before refreshing again`,
          retryAfterMs: wait,
        },
        { status: 429 }
      )
    }

    // ── Parse body ──────────────────────────────────────────────────────────
    let body: Record<string, unknown> = {}
    try {
      const parsed = await request.json()
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        body = parsed as Record<string, unknown>
      }
    } catch { /* no body or bad JSON — all fields optional */ }

    // ✅ Validate queryIds — must be array of strings, capped at MAX_QUERY_IDS
    const rawIds       = body.queryIds
    const includeInactive = body.includeInactive === true  // ✅ strict boolean, not truthy

    const explicitIds: string[] | null =
      Array.isArray(rawIds)
        ? rawIds
            .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
            .slice(0, MAX_QUERY_IDS)
        : null

    // ── Fetch API key ───────────────────────────────────────────────────────
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

    // ── Resolve queries to run ──────────────────────────────────────────────
    let queries
    if (explicitIds?.length) {
      // ✅ Cap already applied; fetch in parallel with ownership check
      const fetched = await Promise.all(
        explicitIds.map(id => databaseService.queryService.getQuery(id))
      )
      // Filter nulls and enforce ownership — never run another user's queries
      queries = fetched.filter(
        (q): q is NonNullable<typeof q> => q !== null && q.userId === user.$id
      )
    } else {
      const all = await databaseService.queryService.getQueries(user.$id)
      // ✅ Removed dead isActive check — QueryConfig has no isActive field
      queries = includeInactive ? all : all
    }

    if (queries.length === 0) {
      return NextResponse.json({
        success: true, message: "No queries to execute",
        executed: 0, snapshots: [],
      })
    }

    console.log(`[AnalyticsRefresh] Executing ${queries.length} queries for user: ${user.$id}`)

    // ── Mark rate limit BEFORE executing (prevent concurrent storms) ───────
    lastRefresh.set(user.$id, Date.now())

    // ── Execute in batches ──────────────────────────────────────────────────
    const exaClient = new ExaClient(apiKey)
    const results:  any[] = []
    const errors:   any[] = []

    for (let i = 0; i < queries.length; i += BATCH_SIZE) {
      const batch = queries.slice(i, i + BATCH_SIZE)

      const settled = await Promise.allSettled(
        batch.map(async query => {
          const startTime = Date.now()

          console.log(`[AnalyticsRefresh] Query: ${query.id} "${query.query}"`)

          const exaResults = await exaClient.search({
            query:          query.query,
            category:       query.category,
            includeDomains: query.filters?.includeDomains,
            excludeDomains: query.filters?.excludeDomains,
            startDate:      query.filters?.startDate,
            endDate:        query.filters?.endDate,
            numResults:     query.filters?.numResults ?? 50,
          })


          // ✅ Spread first, explicit fields last — position/id never overridden
          const mappedResults: SearchResult[] = (exaResults?.results ?? []).map(
            (r: any, idx: number) => {
              const title   = r.title   ?? ""
              const snippet = r.snippet ?? r.summary ?? ""
              const url     = r.url     ?? ""
              const fulltext = r.text    ?? r.fullText ?? ""

              let domain = r.domain ?? ""
              if (!domain && url) {
                try { domain = new URL(url).hostname } catch { /* malformed */ }
              }

              const contentHash = createHash("sha256").update(`${title}|${snippet}|${fulltext.slice(0, 5000)}|${url}`, "utf8")
                .digest("hex")

              return {
                ...r,
                id:          r.id ?? `${query.id}_${idx}`,
                position:    idx + 1,
                domain,
                contentType: mapContentType(r.type),  // ✅ no "auto"
                title,
                snippet,
                url,
                contentHash,
                timestamp:   new Date(),
                score:       typeof r.score === "number" ? r.score : 0,
              } as SearchResult
            }
          )
    const { responseTime } = exaResults

          const snapshot = await databaseService.snapshotService.createSnapshot({
            queryId:  query.id,
            userId:   user.$id,
            results:  mappedResults,
            metadata: {
              totalResults:  mappedResults.length,
              responseTime: responseTime,
              executedAt:    new Date().toISOString(),
              executionType: "manual",
              source:        "analytics_refresh_api",
            },
            timestamp: new Date(),
          })

          console.log(`[AnalyticsRefresh] Snapshot created: ${snapshot.id} (${mappedResults.length} results)`)

          return {
            queryId:      query.id,
            queryName:    query.name,
            snapshotId:   snapshot.id,
            resultsCount: mappedResults.length,
            responseTime: responseTime,
            success:      true,
          }
        })
      )

      settled.forEach((r, idx) => {
        const q = batch[idx]
        if (r.status === "fulfilled") {
          results.push(r.value)
        } else {
          // ✅ Log full error server-side; return sanitized message to client
          console.error(`[AnalyticsRefresh] Query ${q.id} failed:`, r.reason)
          errors.push({
            queryId:   q.id,
            queryName: q.name,
            // Expose only user-actionable Exa errors; hide internal details
            error: r.reason instanceof Error && r.reason.message.includes("Exa")
              ? r.reason.message
              : "Execution failed",
          })
        }
      })
    }

    console.log(`[AnalyticsRefresh] Done: ${results.length} ok, ${errors.length} failed`)

    return NextResponse.json({
      success:    true,
      executed:   queries.length,
      successful: results.length,
      failed:     errors.length,
      snapshots:  results,
      errors:     errors.length > 0 ? errors : undefined,
      timestamp:  new Date().toISOString(),
    })

  } catch (err) {
    console.error("[AnalyticsRefresh] Unexpected error:", err)
    // ✅ No internal error details exposed to client
    return NextResponse.json(
      { success: false, error: "Failed to refresh analytics" },
      { status: 500 }
    )
  }
}