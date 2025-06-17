import { NextRequest, NextResponse, userAgent } from "next/server"

// Define which routes require auth and logging
const PROTECTED_ROUTES = [
  "/",
  "/analytics",
  "/profile",
  "/compare",
  "/feedback",
  "/query-builder",
  "/export-data",
  "/clear-data",
  "/snapshots",
  "/settings",
  "/query-monitor",
  "/api", // ✅ include API routes if needed
]

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const isProtected = PROTECTED_ROUTES.some((route) =>
    pathname.startsWith(route)
  )

  if (!isProtected) return NextResponse.next()

  // Extract IP from standard header
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"

  // Use Next.js userAgent helper
  const ua = userAgent(request)
  const userAgentInfo = {
    browser: ua.browser?.name || "unknown",
    version: ua.browser?.version || "unknown",
    deviceType: ua.device?.type || "desktop",
    os: ua.os?.name || "unknown",
    isBot: ua.isBot,
  }

  // Forward values as headers to downstream API routes
  const response = NextResponse.next()
  response.headers.set("x-real-ip", ip)
  response.headers.set("x-user-agent", JSON.stringify(userAgentInfo))

  return response
}

export const config = {
  matcher: [
    "/",
    "/(analytics|profile|compare|feedback|query-builder|export-data|clear-data|snapshots|settings|query-monitor)(.*)?",
    "/api/(.*)", // optional: protect all APIs too
  ],
}
