// app/api/weaviate/search/route.ts
import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/middleware/authentication/auth"

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

const DEFAULT_LIMIT     = 20
const MAX_LIMIT         = 100
const DEFAULT_THRESHOLD = 0.7
const MIN_THRESHOLD     = 0.0
const MAX_THRESHOLD     = 1.0

// ─── GET /api/weaviate/search ─────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    //  Auth required — userId always from session, never query string
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const query = searchParams.get("q")?.trim()

    if (!query) {
      return NextResponse.json(
        { error: "Missing required parameter: 'q'" },
        { status: 400 }
      )
    }

    //  limit — NaN-safe, clamped
    const rawLimit = Number(searchParams.get("limit"))
    const limit    = isNaN(rawLimit) || rawLimit < 1
      ? DEFAULT_LIMIT
      : Math.min(rawLimit, MAX_LIMIT)

    //  threshold — NaN-safe, clamped to [0, 1]
    const rawThreshold = Number(searchParams.get("threshold"))
    const threshold    = isNaN(rawThreshold)
      ? DEFAULT_THRESHOLD
      : Math.min(MAX_THRESHOLD, Math.max(MIN_THRESHOLD, rawThreshold))

    console.log(
      `[WeaviateSearch] user=${user.$id}, q="${query}", limit=${limit}, threshold=${threshold}`
    )

    //  Singleton — userId always from auth session
    const weaviate = await getWeaviateService()
    await weaviate.initialize()

    const results = await weaviate.semanticSearch(query, user.$id, limit, threshold)

    return NextResponse.json({
      success:   true,
      results,
      query,
      count:     results.length,
      timestamp: new Date().toISOString(),
      //  userId not echoed back — no need to expose it in the response
    })
  } catch (err) {
    console.error("[WeaviateSearch] Failed:", err)
    //  No internal error details exposed to client
    return NextResponse.json(
      { success: false, error: "Failed to perform semantic search" },
      { status: 500 }
    )
  }
}