import { NextRequest, NextResponse, userAgent } from "next/server"

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
]

const PUBLIC_API_ROUTES = [
  "/api/register",
  "/api/logout",
  "/api/verify-session",
  "/api/set-cookie",
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const jwt = request.cookies.get("appwrite_jwt")?.value

  if (PUBLIC_API_ROUTES.includes(pathname)) {
    return NextResponse.next()
  }

  if (pathname.startsWith("/auth") && jwt) {
    return NextResponse.redirect(new URL("/query-builder", request.url))
  }

  const isProtected = PROTECTED_ROUTES.some(route => pathname.startsWith(route))
  if (!isProtected) return NextResponse.next()

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  const ua = userAgent(request)
  const userAgentInfo = {
    browser: ua.browser?.name || "unknown",
    version: ua.browser?.version || "unknown",
    deviceType: ua.device?.type || "desktop",
    os: ua.os?.name || "unknown",
    isBot: ua.isBot,
  }

  const response = NextResponse.next()
  response.headers.set("x-real-ip", ip)
  response.headers.set("x-user-agent", JSON.stringify(userAgentInfo))

  if (!jwt && !pathname.startsWith("/auth")) {
    const loginUrl = new URL("/auth", request.url)
    loginUrl.searchParams.set("returnTo", pathname)
    return NextResponse.redirect(loginUrl)
  }
  
  if (userAgentInfo.isBot) {
  return new NextResponse("Bots not allowed", { status: 403 })
}

  return response
}

export const config = {
  matcher: [
    "/",
    "/(analytics|profile|compare|feedback|query-builder|export-data|clear-data|snapshots|settings|query-monitor)(.*)?",
    "/api/:path*",
  ],
}
