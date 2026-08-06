// lib/api/secure-client.ts
"use client"

// ─── Alignment with use-secureApi.ts ─────────────────────────────────────────
// makeRequest throws on non-2xx responses and returns parsed JSON/text.
// use-secureApi wraps this and surfaces errors as toasts.
// Callers that need .ok / .status should check the thrown error instead.

const SLOW_REQUEST_MS = 2_000
const TIMEOUT_MS      = 30_000   // 30s timeout for all requests

class SecureApiClient {
  private readonly baseURL: string

  constructor(baseURL = "/api") {
    this.baseURL = baseURL.replace(/\/+$/, "")
  }

  // ── Request builder ─────────────────────────────────────────────────────────

  private async makeRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = endpoint.startsWith("http")
      ? endpoint
      : `${this.baseURL}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`

    const method    = options.method ?? "GET"
    const startTime = Date.now()

    //  AbortController timeout — fetch never hangs indefinitely
    const controller = new AbortController()
    const timeoutId  = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
      const headers = new Headers(options.headers)
      headers.set("X-Requested-With", "XMLHttpRequest")

      if (options.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json")
      }

      //  credentials:'include' sends the httpOnly cookie automatically.
      //    No need to read document.cookie and send JWT as a header
      //    (which would require the cookie to be non-httpOnly = less secure).
      const response = await fetch(url, {
        ...options,
        headers,
        credentials: "include",
        signal:      controller.signal,
      })

      clearTimeout(timeoutId)

      const duration = Date.now() - startTime
      if (duration > SLOW_REQUEST_MS) {
        console.warn(`[SecureClient] Slow request: ${method} ${endpoint} (${duration}ms)`)
      }

      // ── Error handling ────────────────────────────────────────────────────

      if (response.status === 401) {
        //  Throw instead of hard redirect — auth-context handles navigation
        //    via router.replace() + startTransition, not window.location.href
        throw new Error("Authentication required")
      }

      if (response.status === 403) {
        const body = await response.json().catch(() => ({}))
        throw new Error((body as any).error ?? "Access forbidden")
      }

      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After")
        const wait       = retryAfter ? `${retryAfter} seconds` : "a moment"
        throw new Error(`Rate limit exceeded. Please wait ${wait} and try again.`)
      }

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error((body as any).error ?? `HTTP ${response.status}: ${response.statusText}`)
      }

      // ── Parse response ────────────────────────────────────────────────────
      const contentType = response.headers.get("Content-Type") ?? ""
      if (contentType.includes("application/json")) {
        return response.json() as Promise<T>
      }
      return response.text() as Promise<T>
    } catch (err) {
      clearTimeout(timeoutId)

      // AbortController fired — fetch timed out
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new Error(`Request timed out after ${TIMEOUT_MS / 1000}s`)
      }

      // Network failure (no response)
      if (err instanceof TypeError && err.message.includes("fetch")) {
        throw new Error("Network error. Please check your connection.")
      }

      throw err
    }
  }

  // ── Public methods ──────────────────────────────────────────────────────────

  async get<T>(endpoint: string): Promise<T> {
    return this.makeRequest<T>(endpoint, { method: "GET" })
  }

  async post<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.makeRequest<T>(endpoint, {
      method: "POST",
      body:   data !== undefined ? JSON.stringify(data) : undefined,
    })
  }

  async put<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.makeRequest<T>(endpoint, {
      method: "PUT",
      body:   data !== undefined ? JSON.stringify(data) : undefined,
    })
  }

  async patch<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.makeRequest<T>(endpoint, {
      method: "PATCH",
      body:   data !== undefined ? JSON.stringify(data) : undefined,
    })
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.makeRequest<T>(endpoint, { method: "DELETE" })
  }
}

export const apiClient = new SecureApiClient()
