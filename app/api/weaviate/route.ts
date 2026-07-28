// app/api/weaviate/route.ts
import { NextRequest, NextResponse } from "next/server"
import { WeaviateAnalyticsService } from "@/app/services/weaviate/analytics/weaviate-analytics-service"
import { getCurrentUser } from "@/lib/middleware/authentication/auth"
import type { QueryConfig } from "@/types/type"

// ─── Weaviate singletons ──────────────────────────────────────────────────────
// Lazy-loaded once per process — avoids recreating per request and ensures
// the embedding cache and connection state are shared across all requests.

let _analyticsService: WeaviateAnalyticsService | null = null

async function getAnalyticsService(): Promise<WeaviateAnalyticsService> {
  if (!_analyticsService) {
    const { WeaviateService } = await import("@/app/services/weaviate/weaviate-service")
    const weaviate = new WeaviateService()
    _analyticsService = new WeaviateAnalyticsService(false, weaviate)
  }
  return _analyticsService
}

// ─── Rate limiting ────────────────────────────────────────────────────────────
// ⚠️  In-process Map — does not persist across serverless instances.
//    For production cross-instance rate limiting use Redis/Upstash.

const MAX_REQUESTS   = 100
const WINDOW_MS      = 60 * 60 * 1000   // 1 hour
const MAX_TIME_RANGE = 365 * 24 * 60 * 60 * 1000
const MIN_TIME_RANGE = 60 * 60 * 1000   // 1 hour minimum

interface RateLimitEntry { count: number; resetTime: number }
const rateLimitMap = new Map<string, RateLimitEntry>()

function checkRateLimit(key: string): boolean {
  const now  = Date.now()
  const slot = rateLimitMap.get(key)

  // ✅ Prune expired entry inline — prevents unbounded memory growth
  if (!slot || now > slot.resetTime) {
    rateLimitMap.set(key, { count: 1, resetTime: now + WINDOW_MS })
    return true
  }
  if (slot.count >= MAX_REQUESTS) return false
  slot.count++
  return true
}

// ─── CORS origin ──────────────────────────────────────────────────────────────
// ✅ Restrict to your actual origin — not wildcard
const ALLOWED_ORIGIN = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

// ─── POST /api/weaviate ───────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const startTime = Date.now()   // ✅ Capture before any async work

  try {
    // ✅ Auth check — userId must come from the session, not the request body
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })

    // Rate limit by authenticated userId (more meaningful than IP)
    if (!checkRateLimit(user.$id)) {
      return NextResponse.json(
        { success: false, error: "Rate limit exceeded. Try again later." },
        { status: 429 }
      )
    }

    // ✅ Proper JSON parse error handling
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 })
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: "Request body must be a JSON object" }, { status: 400 })
    }

    const b = body as Record<string, unknown>

    // ✅ timeRangeMs validated — type check, min, and max
    let timeRangeMs = MAX_TIME_RANGE   // default: 1 year
    if (b.timeRangeMs !== undefined) {
      if (typeof b.timeRangeMs !== "number" || !isFinite(b.timeRangeMs)) {
        return NextResponse.json({ success: false, error: "'timeRangeMs' must be a number" }, { status: 400 })
      }
      if (b.timeRangeMs < MIN_TIME_RANGE || b.timeRangeMs > MAX_TIME_RANGE) {
        return NextResponse.json(
          { success: false, error: `'timeRangeMs' must be between ${MIN_TIME_RANGE} and ${MAX_TIME_RANGE}` },
          { status: 400 }
        )
      }
      timeRangeMs = b.timeRangeMs
    }

    // ✅ queries validated as array — not cast blindly
    const queries: QueryConfig[] = Array.isArray(b.queries) ? b.queries as QueryConfig[] : []

    console.log(`[Weaviate] Analytics for user: ${user.$id}, timeRange: ${timeRangeMs}ms`)

    // ✅ Singleton — no new instance per request
    const analyticsService = await getAnalyticsService()

    // ✅ userId always from auth session — never from request body
    const analytics = await analyticsService.getAnalytics(user.$id, timeRangeMs, queries)

    return NextResponse.json({
      success:          true,
      data:             analytics,
      timestamp:        new Date().toISOString(),
      processingTimeMs: Date.now() - startTime,   // ✅ correct calculation
    })
  } catch (err) {
    console.error("[Weaviate] POST failed:", err)
    // ✅ No stack trace or internal message exposed to client
    return NextResponse.json(
      { success: false, error: "Failed to retrieve analytics" },
      { status: 500 }
    )
  }
}

// ─── GET /api/weaviate (health check) ────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    //  Auth required even for health check
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })

    //  Uses singleton — isWeaviateConnected() reflects actual connection state
    const analyticsService = await getAnalyticsService()
    const isConnected = (analyticsService as any).weaviate?.isWeaviateConnected?.() ?? false

    return NextResponse.json({
      success:           true,
      status:            "healthy",
      weaviateConnected: isConnected,
      timestamp:         new Date().toISOString(),
    })
  } catch (err) {
    console.error("[Weaviate] GET health check failed:", err)
    return NextResponse.json(
      { success: false, error: "Service unavailable" },
      { status: 503 }
    )
  }
}

// ─── OPTIONS (preflight) ──────────────────────────────────────────────────────

export async function OPTIONS() {
  // ✅ Restricted to known origin — not wildcard (*)
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin":  ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age":       "86400",  // cache preflight for 24h
    },
  })
}