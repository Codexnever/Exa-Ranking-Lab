"use client"

import { useAuth } from "@/lib/middleware/authentication/auth-context"
import { useRouter, usePathname } from "next/navigation"
import { useEffect } from "react"

// Routes that never require authentication.
// Everything else is treated as protected.
const PUBLIC_PATHS = ["/auth"]

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(p => pathname.startsWith(p))
}

// ─── Loading screen ────────────────────────────────────────────────────────────
// Shown while the initial session check runs (~200-300ms on first load,
// instant on subsequent navigations since AuthProvider is already mounted).
function AppLoading() {
  return (
    <div className="h-screen w-full flex items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="h-12 w-12 rounded-md bg-blue-600 flex items-center justify-center">
            <span className="text-white font-bold text-xl">E</span>
          </div>
          <div className="absolute inset-0 h-12 w-12 rounded-md bg-blue-600 animate-pulse opacity-75" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-gray-900">Loading Exa Ranking Lab</p>
          <p className="text-xs text-gray-500 mt-1">Verifying session...</p>
        </div>
      </div>
    </div>
  )
}

/**
 * AuthGate — single gate for the entire app, placed in root layout.
 *
 * Behaviour by route type:
 *
 * PUBLIC paths (/auth):
 *   - Always render immediately, no spinner, no redirect.
 *   - AuthRedirect inside /auth handles the inverse (logged-in → redirect away).
 *
 * PROTECTED paths (everything else):
 *   - initializing=true  → show AppLoading spinner (session check in-flight)
 *   - initializing=false, no user → redirect to /auth (unauthenticated)
 *   - initializing=false, user    → render children (authenticated)
 *
 * Why usePathname instead of per-layout AuthGate:
 *   Single component in root layout means you can never accidentally forget
 *   to add AuthGate to a new protected route.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, initializing } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  const isPublic = isPublicPath(pathname)

  useEffect(() => {
    // Never redirect on public pages
    if (isPublic) return
    // Never redirect while auth state is still being determined
    if (initializing) return
    // Auth confirmed: no user → redirect to /auth with returnTo
    if (!user) {
      const returnTo = encodeURIComponent(pathname)
      router.replace(`/auth?returnTo=${returnTo}`)
    }
  }, [isPublic, initializing, user, router, pathname])

  // ── Public paths: always render freely ──────────────────────────────────
  // /auth renders without any shell (no Sidebar/Navbar) — that's handled
  // by the conditional in AppShell below, not here.
  if (isPublic) return <>{children}</>

  // ── Protected paths ──────────────────────────────────────────────────────
  // Block render until we know auth state for certain
  if (initializing) return <AppLoading />

  // Auth settled, no user — render nothing while redirect fires
  if (!user) return null

  // Auth confirmed — safe to render
  return <>{children}</>
}