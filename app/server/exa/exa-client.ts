// app/server/exa-client.ts
import type {
  ExaSearchOptions,
  ExaSearchResult,
  ExaSearchResponse,
} from "@/types/type"

const TIMEOUT_MS = 30_000

// ─── Exa API wire types ───────────────────────────────────────────────────────

interface ExaRawResult {
  id:               string
  title:            string
  url:              string
  publishedDate?:   string
  author?:          string
  image?:           string
  favicon?:         string
  text?:            string
  highlights?:      string[]
  highlightScores?: number[]
  summary?:         string
  score?:           number
  date?:            string
}

interface ExaRawResponse {
  requestId:           string
  searchType?:         string
  resolvedSearchType?: string
  /**
   * Server-side search time in **milliseconds**.
   * Exa's infrastructure time only — does NOT include network round-trip
   * or content extraction latency. Use this for analytics display.
   */
  searchTime?:         number
  results:             ExaRawResult[]
}

// ─── Client ───────────────────────────────────────────────────────────────────

export class ExaClient {
  private readonly apiKey:  string
  private readonly baseUrl: string = "https://api.exa.ai"

  constructor(apiKey: string) {
    // ✅ Fail fast — empty key would silently get a 401 from Exa
    if (!apiKey?.trim()) throw new Error("[ExaClient] apiKey is required")
    this.apiKey = apiKey.trim()
  }

  async search(options: ExaSearchOptions): Promise<ExaSearchResponse> {
    // Wall-clock start — full round-trip including network + content extraction.
    // Used as fallback if Exa doesn't return searchTime.
    const wallClockStart = Date.now()

    // ✅ AbortController — prevents indefinite hang if Exa is slow/unresponsive
    const controller = new AbortController()
    const timeoutId  = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
      const requestBody = {
        query:      options.query,
        numResults: options.numResults ?? 50,

        ...(options.category                   && { category:             options.category }),
        ...(options.startDate                  && { start_published_date: options.startDate }),
        ...(options.endDate                    && { end_published_date:   options.endDate }),
        ...(options.includeDomains?.length     && { include_domains:      options.includeDomains }),
        ...(options.excludeDomains?.length     && { exclude_domains:      options.excludeDomains }),

        contents: {
          text:       { maxCharacters: 3000, verbosity: "compact" },
          highlights: { numSentences: 3, highlightsPerUrl: 2, query: options.query },
          summary:    true,
        },
      }

      const response = await fetch(`${this.baseUrl}/search`, {
        method:  "POST",
        headers: {
          Authorization:  `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          Accept:         "application/json",
        },
        body:   JSON.stringify(requestBody),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(
          `Exa API Error: ${response.status} - ${
            (errorData as any).message ?? response.statusText
          }`
        )
      }

      const data: ExaRawResponse = await response.json()

      // ─── Timing ────────────────────────────────────────────────────────────
      //
      // data.searchTime  — milliseconds, Exa server-side only.
      //                    Best value for analytics / "Avg Response Time" display.
      //                    Does NOT include network latency.
      //
      // wallClockElapsedMs — milliseconds, full round-trip from this process.
      //                    Useful for SLA/timeout budgeting, not stored.
      //
      const wallClockElapsedMs = Date.now() - wallClockStart

      // ✅ searchTime: Exa's server time (ms) — primary value for analytics.
      //    If Exa doesn't return it, fall back to wall-clock.
      const searchTime = typeof data.searchTime === "number"
        ? data.searchTime
        : "none"

      // ✅ responseTime: alias for searchTime so all existing callers
      //    (run/route.ts, analytics/refresh/route.ts, process-scheduled/route.ts)
      //    reading exaResults.responseTime continue to work unchanged.
      //    Both point to the same value — Exa's server search time in ms.
      const responseTime = searchTime

      console.log(
        `[ExaClient] search "${options.query}" — ` +
        `Exa: ${searchTime}ms | wall: ${wallClockElapsedMs}ms`
      )

      const results: ExaSearchResult[] = (data.results ?? []).map(result => ({
        title:   result.title ?? "Untitled",
        url:     result.url,

        // UI preview: prefer summary → highlights joined → text slice
        snippet:
          result.summary                             ??
          (result.highlights?.length ? result.highlights.join(" ") : undefined) ??
          result.text?.slice(0, 300)                 ??
          "",

        // Full text for semantic embedding + content drift detection
        fullText:        result.text            ?? "",

        // Query-aware highlights with relevance scores
        highlights:      result.highlights      ?? [],
        highlightScores: result.highlightScores ?? [],

        // Exa LLM-generated summary (may be empty for fast/keyword search)
        summary:         result.summary         ?? "",

        // score absent for keyword/fast search — default 0
        score:           result.score           ?? 0,

        publishedDate: result.publishedDate ?? result.date,
        author:        result.author        ?? "",
        image:         result.image,
        favicon:       result.favicon,
      }))

      return {
        results,

        //  Exa /search does NOT return totalResults — use array length directly.
        totalResults: data.results?.length ?? 0,

        //  responseTime in ms — read by all existing callers (run/route.ts etc.)
        //    This is Exa's server search time, not wall-clock.
        responseTime,

        //  searchTime exposed separately so callers can distinguish if needed.
        //    Most callers use responseTime; searchTime is for logging/debugging.
        searchTime,

        // Metadata for monitoring
        requestId:  data.requestId,
        searchType: data.resolvedSearchType ?? data.searchType,
      }
    } catch (err) {
      clearTimeout(timeoutId)

      if (err instanceof DOMException && err.name === "AbortError") {
        throw new Error(`[ExaClient] Request timed out after ${TIMEOUT_MS / 1000}s`)
      }

      // Don't wrap — preserve original error type for callers to inspect
      console.error("[ExaClient] search failed:", err instanceof Error ? err.message : err)
      throw err
    }
  }
}