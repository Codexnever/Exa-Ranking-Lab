// app/api/analytics/route.ts
import { type NextRequest, NextResponse } from "next/server"
import { AnalyticsService } from "@/app/logic/analytics-service"
import { getCurrentUser } from "@/lib/middleware/authentication/auth"
import { calculateTimeRangeMs } from "@/app/logic/analyticsLogic"

// Reuse the stateless analytics service across requests.
const analyticsService = new AnalyticsService(false)

// Supported analytics time ranges.
const VALID_TIME_RANGES = new Set(["7d", "30d", "90d", "1y"])

/**
 * Removes raw snapshot data from the analytics response.
 *
 * `filteredSnapshots` is used internally for calculations and may contain
 * thousands of snapshots with large result arrays. The client only needs
 * the computed analytics metrics, so returning the raw snapshots would
 * unnecessarily increase the response size.
 */
function stripRawData(
  analytics: Record<string, unknown>,
): Record<string, unknown> {
  const { filteredSnapshots: _, ...rest } = analytics
  return rest
}

export async function GET(request: NextRequest) {
  try {
    // Authenticate the request before loading analytics data.
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = request.nextUrl

    // Fall back to the default range when an unsupported value is provided.
    const rawRange = searchParams.get("timeRange") ?? "30d"
    const timeRange = VALID_TIME_RANGES.has(rawRange) ? rawRange : "30d"
    const timeRangeMs = calculateTimeRangeMs(timeRange)

    const analytics = await analyticsService.getAnalytics(
      user.$id,
      timeRangeMs,
    )

    // Raw snapshots are not required by the analytics client.
    const response = stripRawData(
      analytics as unknown as Record<string, unknown>,
    )

    return NextResponse.json(response, {
      headers: {
        // Analytics can be briefly cached because the underlying data does not
        // normally change between consecutive requests.
        "Cache-Control": "private, max-age=60, stale-while-revalidate=30",
      },
    })
  } catch (err) {
    console.error("[GET /api/analytics] Failed:", err)

    return NextResponse.json(
      { error: "Failed to fetch analytics" },
      { status: 500 },
    )
  }
}