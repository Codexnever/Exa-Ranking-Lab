// app/api/analytics/algorithm-events/route.ts
import { type NextRequest, NextResponse } from "next/server"
import { withEnhancedSecurity } from "@/lib/middleware/security/security-middleware"
import { AlgorithmUpdateDetector } from "@/app/services/AlgorithmUpdateDetector"
import type { SecurityContext } from "@/types/type"

async function getAlgorithmEventsHandler(
  request: NextRequest,
  context: SecurityContext
) {
  const userId = context.user.$id

  try {
    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "10"), 50)

    const events = await AlgorithmUpdateDetector.getRecentEvents(userId, limit)

    return NextResponse.json(events)
  } catch (err) {
    console.error("[AlgorithmEvents] GET failed:", err)
    return NextResponse.json([], { status: 200 }) // silent — panel just shows empty
  }
}

export const GET = withEnhancedSecurity(getAlgorithmEventsHandler, {
  allowedMethods: ["GET"],
  logAttempts: false,
})