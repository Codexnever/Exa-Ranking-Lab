"use client"

import { useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useAuth } from "@/lib/middleware/authentication/auth-context"

/**
 * AuthRedirect — rendered inside the /auth page.
 *
 * If the user is already authenticated when they land on /auth,
 * redirect them away immediately (e.g. back-button after login).
 *
 * Rules:
 * - Wait for `initializing` to be false before deciding anything.
 *   Acting on `user` while initializing=true causes a flash redirect
 *   because user starts as null before the session check completes.
 * - Never redirect while initializing — that's the race condition.
 */
export function AuthRedirect() {
  const { user, initializing } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    // Only act once we KNOW auth state for certain
    if (initializing) return
    if (!user) return

    const returnTo = searchParams.get("returnTo") || "/query-builder"
    router.replace(returnTo)
  }, [initializing, user, router, searchParams])

  return null
}