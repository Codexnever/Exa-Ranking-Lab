// app/api/analytics/algorithm-events/route.ts
import { type NextRequest, NextResponse } from "next/server"
import { withEnhancedSecurity } from "@/lib/middleware/security/security-middleware"
import { AlgorithmUpdateDetector } from "@/lib/services/algorithm-detector"
import type { SecurityContext } from "@/types/type"

async function getAlgorithmEventsHandler(
  request: NextRequest,
  context: SecurityContext
) {
  const userId = context.user.$id

  try {
    const { searchParams } = new URL(request.url)
    const parsedLimit = Number.parseInt(searchParams.get("limit") ?? "10", 10)
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(50, Math.max(1, parsedLimit))
      : 10

    const events = await AlgorithmUpdateDetector.getRecentEvents(userId, limit)

    return NextResponse.json(events)
  } catch (err) {
    console.error("[AlgorithmEvents] GET failed:", err)
    return NextResponse.json({ error: "Failed to load algorithm update events" }, { status: 500 })
  }
}

export const GET = withEnhancedSecurity(getAlgorithmEventsHandler, {
  allowedMethods: ["GET"],
  logAttempts: false,
})
