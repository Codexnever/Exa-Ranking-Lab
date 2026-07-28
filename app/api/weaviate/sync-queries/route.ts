// app/api/weaviate/sync-queries/route.ts
import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/middleware/authentication/auth"
import { databaseService } from "@/app/services/database/database-service"
import type { SimilarQuery } from "@/app/services/weaviate/weaviate-service"

// ─── Weaviate singleton ───────────────────────────────────────────────────────

let _weaviateService: import("@/app/services/weaviate/weaviate-service").WeaviateService | null = null

async function getWeaviateService() {
  if (!_weaviateService) {
    const { WeaviateService } = await import("@/app/services/weaviate/weaviate-service")
    _weaviateService = new WeaviateService()
  }
  return _weaviateService
}

// ─── CORS ─────────────────────────────────────────────────────────────────────

const ALLOWED_ORIGIN = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

// ─── POST /api/weaviate/sync-queries ─────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    //  Auth required — userId always from session
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    // Body is optional — no body means sync all queries for the authenticated user
    let maxQueries = 100

    const contentType = request.headers.get("content-type") ?? ""
    if (contentType.includes("application/json")) {
      let raw: unknown
      try { raw = await request.json() } catch {
        return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 })
      }
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        const b = raw as Record<string, unknown>
        if (typeof b.maxQueries === "number" && b.maxQueries > 0) {
          maxQueries = Math.min(500, b.maxQueries)
        }
      }
    }

    console.log(`[SyncQueries] Starting sync for user: ${user.$id}, max: ${maxQueries}`)

    // ✅ Use QueryService (with proper field mapping + category reverse-map)
    //    instead of databases.listDocuments with raw Appwrite field names
    const allQueries = await databaseService.queryService.getQueries(user.$id)
    const queries    = allQueries.slice(0, maxQueries)

    if (queries.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No queries found to sync",
        synced: 0, skipped: 0, errors: 0, totalQueries: 0,
      })
    }

    console.log(`[SyncQueries] Syncing ${queries.length} queries`)

    // ✅ Initialise Weaviate once before the batch loop
    const weaviate = await getWeaviateService()
    await weaviate.initialize()

    let syncedCount  = 0
    let errorCount   = 0
    const errorIds:  string[] = []

    const BATCH_SIZE    = 10
    const BATCH_DELAY   = 100

    for (let i = 0; i < queries.length; i += BATCH_SIZE) {
      const batch = queries.slice(i, i + BATCH_SIZE)

      const results = await Promise.allSettled(
        batch.map(async query => {
          // ✅ Map QueryConfig → SimilarQuery (correct field names)
          const weaviateQuery: SimilarQuery = {
            id:        query.id,
            name:      query.name,
            query:     query.query,
            category:  query.category,
            userId:    user.$id,           // always from auth
            createdAt: new Date(query.createdAt),
            lastRun:   query.lastRun ? new Date(query.lastRun) : undefined,
            similarity: 0,
          }

          // ✅ Actual sync — not a TODO no-op
          await weaviate.syncQuery(weaviateQuery)
          console.log(`[SyncQueries] Synced: ${query.id} (${query.name})`)
        })
      )

      results.forEach((r, idx) => {
        if (r.status === "fulfilled") {
          syncedCount++
        } else {
          errorCount++
          errorIds.push(batch[idx].id)
          // ✅ Log full error server-side, never send to client
          console.error(`[SyncQueries] Failed ${batch[idx].id}:`, r.reason)
        }
      })

      if (i + BATCH_SIZE < queries.length) {
        await new Promise(r => setTimeout(r, BATCH_DELAY))
      }
    }

    console.log(`[SyncQueries] Done — synced: ${syncedCount}, errors: ${errorCount}`)

    return NextResponse.json({
      success:      true,
      message:      `Sync complete. ${syncedCount} synced, ${errorCount} failed.`,
      synced:       syncedCount,
      skipped:      0,
      errors:       errorCount,
      totalQueries: queries.length,
      // ✅ No error messages in response — just IDs so client can retry
      failedIds:    errorIds.length > 0 ? errorIds : undefined,
      timestamp:    new Date().toISOString(),
    })
  } catch (err) {
    console.error("[SyncQueries] Unexpected error:", err)
    // ✅ No internal error details exposed to client
    return NextResponse.json(
      { success: false, error: "Sync operation failed" },
      { status: 500 }
    )
  }
}

// ─── OPTIONS ──────────────────────────────────────────────────────────────────

export async function OPTIONS() {
  // ✅ Restricted origin — not wildcard
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin":  ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age":       "86400",
    },
  })
}