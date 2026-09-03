// app/api/weaviate/semantic-analytics/route.ts
import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/middleware/authentication/auth"

// ─── Singletons ───────────────────────────────────────────────────────────────

let _enhancedService: import("@/app/services/weaviate/analytics/enhanced-analytics-service").EnhancedAnalyticsService | null = null

async function getEnhancedService() {
  if (!_enhancedService) {
    const { WeaviateService }          = await import("@/app/services/weaviate/weaviate-service")
    const { EnhancedAnalyticsService } = await import("@/app/services/weaviate/analytics/enhanced-analytics-service")
    _enhancedService = new EnhancedAnalyticsService(false, new WeaviateService())
  }
  return _enhancedService
}

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_TIME_RANGES: Record<string, number> = {
  "7d":  7   * 24 * 60 * 60 * 1000,
  "30d": 30  * 24 * 60 * 60 * 1000,
  "90d": 90  * 24 * 60 * 60 * 1000,
  "1y":  365 * 24 * 60 * 60 * 1000,
}

// ─── Response shaping ─────────────────────────────────────────────────────────

/** Strip raw snapshot array — same pattern as analytics/route.ts */
function stripRawData(data: Record<string, unknown>): Record<string, unknown> {
  const { filteredSnapshots: _, ...rest } = data
  return rest
}

// ─── GET /api/weaviate/semantic-analytics ─────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    //  Auth required — userId always from session
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(request.url)

    //  timeRange validated against known values
    const rawRange   = searchParams.get("timeRange") ?? "30d"
    const timeRangeMs = VALID_TIME_RANGES[rawRange] ?? VALID_TIME_RANGES["30d"]

    //  cursor and limit removed — EnhancedAnalyticsService.getSemanticAnalytics
    //    doesn't accept either param. Remove dead variables rather than pass
    //    unused values that imply pagination support that isn't implemented.

    console.log(`[SemanticAnalytics] user=${user.$id}, timeRange=${rawRange}`)

    //  Singleton — no re-init on every request
    const analyticsService = await getEnhancedService()

    //  userId always from auth session — not from query string
    const analyticsData = await analyticsService.getSemanticAnalytics(
      user.$id,
      timeRangeMs
    )

    //  Strip filteredSnapshots — large raw array the client never needs
    const response = stripRawData(analyticsData as unknown as Record<string, unknown>)

    return NextResponse.json({
      success:    true,
      data:       response,
      nextCursor: analyticsData.nextCursor ?? null,
      timeRange:  rawRange,
      timestamp:  new Date().toISOString(),
    })
  } catch (err) {
    console.error("[SemanticAnalytics] Failed:", err)
    //  No internal error details exposed to client
    return NextResponse.json(
      { success: false, error: "Failed to fetch semantic analytics" },
      { status: 500 }
    )
  }
}