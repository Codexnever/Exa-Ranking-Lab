// app/api/weaviate/similar-queries/route.ts
import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/middleware/authentication/auth"
import { databaseService } from "@/app/services/database/database-service"

// ─── Weaviate singleton ───────────────────────────────────────────────────────

let _weaviateService: import("@/app/services/weaviate/weaviate-service").WeaviateService | null = null

async function getWeaviateService() {
  if (!_weaviateService) {
    const { WeaviateService } = await import("@/app/services/weaviate/weaviate-service")
    _weaviateService = new WeaviateService()
  }
  return _weaviateService
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_LIMIT = 5
const MAX_LIMIT     = 20

// ─── GET /api/weaviate/similar-queries ───────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    // ✅ Auth required
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const queryId = searchParams.get("queryId")

    if (!queryId?.trim()) {
      return NextResponse.json({ error: "'queryId' is required" }, { status: 400 })
    }

    // ✅ Validate and clamp limit — NaN-safe
    const rawLimit = Number(searchParams.get("limit"))
    const limit    = isNaN(rawLimit) || rawLimit < 1
      ? DEFAULT_LIMIT
      : Math.min(rawLimit, MAX_LIMIT)

    // ✅ Verify ownership — user can only find similar queries for their own queries
    const query = await databaseService.queryService.getQuery(queryId)
    if (!query || query.userId !== user.$id) {
      // 404 — don't reveal whether the query exists at all
      return NextResponse.json({ error: "Query not found" }, { status: 404 })
    }

    // ✅ Singleton — no re-init on every request
    const weaviate = await getWeaviateService()
    await weaviate.initialize()

    const similar = await weaviate.findSimilarQueries(queryId, limit)

    return NextResponse.json({
      success:   true,
      similar,
      queryId,
      count:     similar.length,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error("[SimilarQueries] Failed:", err)
    // ✅ No internal error details exposed to client
    return NextResponse.json(
      { success: false, error: "Failed to fetch similar queries" },
      { status: 500 }
    )
  }
}