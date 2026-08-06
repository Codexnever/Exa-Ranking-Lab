// components/app-shell.tsx
"use client"

import type React from "react"
import { usePathname } from "next/navigation"
import { useAuth } from "@/lib/middleware/authentication/auth-context"
import Sidebar from "@/components/sidebar"
import Navbar from "@/components/navbar"
import { ErrorBoundary, type FallbackProps } from "react-error-boundary"
import { RealTimeProvider } from "@/monitoring/healthcheck/RealTimeProvider"
import { ConnectionHealthProvider } from "@/monitoring/healthcheck/ConnectionHealthProvider"

// Routes that render without the app chrome (Sidebar + Navbar).
// /auth shows a bare full-screen login form — no shell needed.
const SHELL_EXCLUDED_PATHS = ["/auth"]

function isShellExcluded(pathname: string): boolean {
  return SHELL_EXCLUDED_PATHS.some(p => pathname.startsWith(p))
}
if (typeof RealTimeProvider !== "function") 
  console.error("RealTimeProvider is:", RealTimeProvider)
if (typeof ConnectionHealthProvider !== "function") 
  console.error("ConnectionHealthProvider is:", ConnectionHealthProvider)
if (typeof Sidebar !== "function") 
  console.error("Sidebar is:", Sidebar)
if (typeof Navbar !== "function") 
  console.error("Navbar is:", Navbar)
if (typeof ErrorBoundary !== "function") 
  console.error("ErrorBoundary is:", ErrorBoundary)
// ─── Error fallback for real-time provider failures ────────────────
function RealTimeErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  const message = error instanceof Error ? error.message : "An unknown real-time error occurred"
  return (
    <div className="fixed top-4 right-4 max-w-md p-4 border-l-4 border-amber-400 bg-amber-50 rounded shadow-lg z-50">
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <svg className="h-5 w-5 text-amber-400" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <div className="ml-3">
          <h3 className="text-sm font-medium text-amber-800">Real-time Connection Issue</h3>
          <p className="mt-1 text-xs text-amber-700">{message}</p>
          <button
            onClick={resetErrorBoundary}
            className="mt-2 text-xs text-amber-800 underline hover:text-amber-900"
          >
            Retry Connection
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * AppShell — renders the app chrome (Sidebar + Navbar + real-time providers)
 * for authenticated pages. Renders children bare for public pages (/auth).
 *
 * This component always renders — the Sidebar/Navbar conditional is based
 * on the current pathname, not auth state. Auth state is handled by AuthGate
 * upstream, so by the time AppShell renders a protected route, user is
 * guaranteed to be non-null.
 *
 * Separation of concerns:
 *   AuthGate  → decides WHETHER to render (auth guard)
 *   AppShell  → decides HOW to render (with or without chrome)
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { user } = useAuth()

  // Public pages (/auth) — render children with no chrome
  if (isShellExcluded(pathname)) {
    return <>{children}</>
  }

  // Protected pages — render full app chrome with real-time providers
  // AuthGate guarantees user is non-null here, but we guard anyway for safety
  return (
    <ErrorBoundary
      FallbackComponent={RealTimeErrorFallback}
      onError={(error) => {
        console.error("[AppShell] Real-time error:", error)
      }}
      onReset={() => {
        // Hard reload as last resort for real-time connection failures
        window.location.reload()
      }}
    >
      <ConnectionHealthProvider>
        <RealTimeProvider>
          <div className="flex h-screen overflow-hidden bg-gray-50">
            <Sidebar />
            <div className="flex flex-col flex-1 overflow-hidden">
              {/* key on user.$id ensures Navbar fully re-mounts on user change */}
              <Navbar key={user?.$id ?? "authenticated"} />
              <main className="flex-1 overflow-y-auto bg-slate-50">
                <div className="p-6">
                  {children}
                </div>
              </main>
            </div>
          </div>
        </RealTimeProvider>
      </ConnectionHealthProvider>
    </ErrorBoundary>
  )
}
