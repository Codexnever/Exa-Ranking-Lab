// lib/use-secureApi.ts
"use client"

import { useState, useCallback } from "react"
import { apiClient } from "@/lib/api/secure-client"
import { toast } from "sonner"

interface UseSecureApiOptions {
  showErrorToast?:  boolean
  showSuccessToast?: boolean
  successMessage?:  string
}

export function useSecureApi(options: UseSecureApiOptions = {}) {
  // ✅ Destructure to primitives so useCallback deps are stable.
  //    Inline object `useSecureApi({ showErrorToast: true })` creates a new
  //    object reference every render — using the object as a dep would
  //    invalidate useCallback on every render, defeating memoisation.
  const {
    showErrorToast  = true,
    showSuccessToast = false,
    successMessage,
  } = options

  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  // ✅ clearError wrapped in useCallback — stable reference
  const clearError = useCallback(() => setError(null), [])

  const call = useCallback(async <T = any,>(
    method:   "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    endpoint: string,
    data?:    unknown
    // SecureApiClient parses JSON/text and returns the caller's requested type.
  ): Promise<T> => {
    setLoading(true)
    setError(null)

    try {
      let result: T

      switch (method) {
        case "GET":
          result = await apiClient.get<T>(endpoint)
          break
        case "POST":
          result = await apiClient.post<T>(endpoint, data)
          break
        case "PUT":
          result = await apiClient.put<T>(endpoint, data)
          break
        case "PATCH":
          result = await apiClient.patch<T>(endpoint, data)
          break
        case "DELETE":
          result = await apiClient.delete<T>(endpoint)
          break
        default:
          throw new Error(`Unsupported HTTP method: ${method}`)
      }

      if (showSuccessToast && successMessage) {
        toast.success(successMessage)
      }

      return result
    } catch (err) {
      // ✅ Distinguish network errors (fetch failed) from API errors
      //    and show appropriate user-facing messages
      const raw     = err instanceof Error ? err.message : "Unknown error"
      const isNetwork = raw.toLowerCase().includes("failed to fetch") ||
                        raw.toLowerCase().includes("networkerror")

      const userMessage = isNetwork
        ? "Network error — please check your connection"
        : "Something went wrong. Please try again."

      setError(userMessage)

      if (showErrorToast) {
        toast.error(userMessage)
      }

      throw err   // re-throw so callers can handle specific cases
    } finally {
      setLoading(false)
    }
  }, [showErrorToast, showSuccessToast, successMessage])  // ✅ stable primitive deps

  // ── Convenience wrappers ───────────────────────────────────────────────────
  const get   = useCallback((endpoint: string) =>
    call("GET", endpoint), [call])

  const post  = useCallback((endpoint: string, data?: unknown) =>
    call("POST", endpoint, data), [call])

  const put   = useCallback((endpoint: string, data?: unknown) =>
    call("PUT", endpoint, data), [call])

  const patch = useCallback((endpoint: string, data?: unknown) =>
    call("PATCH", endpoint, data), [call])

  const del   = useCallback((endpoint: string) =>
    call("DELETE", endpoint), [call])

  return {
    call,
    get,
    post,
    put,
    patch,
    delete:     del,
    loading,
    error,
    clearError,
  }
}
