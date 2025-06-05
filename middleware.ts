import { NextRequest, NextResponse } from "next/server"
import { jwtDecode } from "jwt-decode"

const PROTECTED_ROUTES = [
    '/',
    '/analytics',
    '/profile',
    '/compare',
    '/feedback',
    '/query-builder',
    '/export-data',
    '/clear-data',
    '/snapshots',
    '/settings',
    '/query-monitor'
  ]

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const needsAuth = PROTECTED_ROUTES.some((route) =>
    pathname.startsWith(route)
  )

  if (!needsAuth) return NextResponse.next()

  const jwt = request.cookies.get("appwrite_jwt")?.value
    || request.headers.get("authorization")?.replace("Bearer ", "")

  if (!jwt) {
    console.log("🚫 No JWT found. Redirecting to /auth")
    const loginUrl = new URL("/auth", request.url)
    loginUrl.searchParams.set("returnTo", pathname)
    return NextResponse.redirect(loginUrl)
  }

  try {
    const decoded: any = jwtDecode(jwt)
    const userId = decoded.userId || decoded.user_id || decoded.uid

    if (!userId) throw new Error("Invalid JWT payload")
    console.log("✅ JWT verified for user:", userId)

    return NextResponse.next()
  } catch (err) {
    console.log("🚫 Invalid JWT. Redirecting to /auth")
    const loginUrl = new URL("/auth", request.url)
    loginUrl.searchParams.set("returnTo", pathname)
    return NextResponse.redirect(loginUrl)
  }
}

export const config = {
  matcher: [
    '/',
    '/analytics',
    '/profile',
    '/compare',
    '/feedback',
    '/query-builder',
    '/export-data',
    '/clear-data',
    '/snapshots',
    '/settings',
    '/query-monitor'
  ],
}
