import { type NextRequest, NextResponse } from "next/server"
import { withEnhancedSecurity } from "@/lib/middleware/security/security-middleware"
import type { SecurityContext } from "@/types/type"

async function triggerScheduledQueries(
  request: NextRequest,
  context: SecurityContext
) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error("[SchedulerTrigger] CRON_SECRET is not configured")
    return NextResponse.json({ error: "Manual scheduling is not configured" }, { status: 503 })
  }

  try {
    const configuredOrigin = process.env.APP_URL
      ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : request.nextUrl.origin)
    const cronUrl = new URL("/api/cron/process-scheduled", configuredOrigin)
    if (!["http:", "https:"].includes(cronUrl.protocol) || cronUrl.username || cronUrl.password) {
      throw new Error("Invalid application origin")
    }

    // Keep the cron secret server-side. The authenticated browser calls this
    // route, which then invokes the existing secret-protected cron endpoint.
    const response = await fetch(cronUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${secret}`,
        "x-trigger-user-id": context.user.$id,
      },
      cache: "no-store",
    })
    const result: unknown = await response.json().catch(() => ({
      error: "Scheduled processing returned an invalid response",
    }))

    return NextResponse.json(result, { status: response.status })
  } catch (error) {
    console.error("[SchedulerTrigger] Manual trigger failed:", error)
    return NextResponse.json({ error: "Failed to trigger scheduled processing" }, { status: 502 })
  }
}

export const POST = withEnhancedSecurity(triggerScheduledQueries, {
  allowedMethods: ["POST"],
  rateLimit: { maxRequests: 2, windowMs: 5 * 60 * 1000 },
  logAttempts: true,
})
