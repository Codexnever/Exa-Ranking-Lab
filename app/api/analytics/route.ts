// app/api/analytics/route.ts
import { type NextRequest, NextResponse } from "next/server"
import { AnalyticsService } from "@/app/services/appwrite/analytics-service"
import { getCurrentUser } from "@/lib/middleware/authentication/auth"
import { calculateTimeRangeMs } from "@/app/logic/analyticsLogic"

// ─── Service singleton ────────────────────────────────────────────────────────
// Stateless service — safe to share across requests in a single process.
const analyticsService = new AnalyticsService(false)

// ─── Allowed time ranges ──────────────────────────────────────────────────────
const VALID_TIME_RANGES = new Set(["7d", "30d", "90d", "1y"])

// ─── Response shaping ─────────────────────────────────────────────────────────
/**
 * Strip filteredSnapshots from the analytics response before sending to client.
 *
 * filteredSnapshots is the full RankingSnapshot[] array used internally for
 * calculations — it can be thousands of entries × large result arrays =
 * potentially several MB per response. The client stores only uses the
 * computed metrics (rankingTrendData, topPerformingQueries, etc.), never
 * the raw snapshots from this endpoint.
 */
function stripRawData(analytics: Record<string, unknown>): Record<string, unknown> {
  const { filteredSnapshots: _, ...rest } = analytics
  return rest
}

// ─── GET /api/analytics ───────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    // ✅ Auth inside try/catch — handles Appwrite/network errors
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = request.nextUrl

    // ✅ Validate timeRange against known values — reject arbitrary strings
    const rawRange  = searchParams.get("timeRange") ?? "30d"
    const timeRange = VALID_TIME_RANGES.has(rawRange) ? rawRange : "30d"
    const timeRangeMs = calculateTimeRangeMs(timeRange)

    const analytics = await analyticsService.getAnalytics(user.$id, timeRangeMs)

    // ✅ Strip filteredSnapshots — large raw array the client never needs
    const response = stripRawData(analytics as unknown as Record<string, unknown>)

    return NextResponse.json(response, {
      headers: {
        // Analytics data is expensive to compute and changes at most every
        // few minutes. Allow short-lived caching but revalidate in background.
        // Remove this header if real-time accuracy is required.
        "Cache-Control": "private, max-age=60, stale-while-revalidate=30",
      },
    })
  } catch (err) {
    console.error("[GET /api/analytics] Failed:", err)
    // ✅ No internal error details exposed to client
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 })
  }
}