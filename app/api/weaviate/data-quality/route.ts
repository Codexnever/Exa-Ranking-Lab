// app/api/weaviate/data-quality/route.ts
import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/middleware/authentication/auth"
import { AppwriteAnalyticsService } from "@/app/services/appwrite/analytics/AppwriteAnalyticsService"

// ─── Singleton ────────────────────────────────────────────────────────────────
const analyticsService = new AppwriteAnalyticsService(false)

// ─── GET /api/weaviate/data-quality ──────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    //  Auth required — userId always from session
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })

    console.log(`[DataQuality] Assessing for user: ${user.$id}`)

    //  userId from auth session only — not from query string
    const analytics = await analyticsService.getAnalytics(user.$id)

    const dataQuality = analytics.dataQuality ?? {
      completeness: 0,
      accuracy:     0,
      consistency:  0,
      freshness:    0,
      validity:     0,
      anomalyCount: 0,
      assessedAt:   Date.now(),
    }

    //  Named key instead of spread — explicit response shape
    return NextResponse.json({ success: true, dataQuality })
  } catch (err) {
    console.error("[DataQuality] Failed:", err)
    //  No internal error details exposed to client
    return NextResponse.json(
      { success: false, error: "Failed to assess data quality" },
      { status: 500 }
    )
  }
}