"use client"

import { useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useAuth } from "@/lib/contexts/auth-context"

export function AuthRedirect() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!loading && user) {
      const returnTo = searchParams.get("returnTo") || "/query-builder"
      router.replace(returnTo)
    }
  }, [user, loading])

  return null
}
