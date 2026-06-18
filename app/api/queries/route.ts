// app/api/queries/route.ts
import { type NextRequest, NextResponse } from "next/server"
import { databaseService } from "@/app/services/database/database-service"
import { getCurrentUser } from "@/lib/middleware/authentication/auth"
import type { ExaCategory } from "@/types/type"

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse and validate the request body for POST /api/queries.
 *
 * Returns the validated fields or throws with a user-facing message.
 * Strips protected fields (id, createdAt, userId) so the service layer
 * controls those — callers cannot inject them.
 */
function parseCreateBody(body: unknown): {
  name:      string
  query:     string
  category:  ExaCategory
  filters:   Record<string, unknown>
  schedule:  { enabled: boolean; frequency: "daily" | "hourly" | "weekly"; times?: string[] }
  tags:      string[]
} {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw Object.assign(new Error("Request body must be a JSON object"), { status: 400 })
  }

  const b = body as Record<string, unknown>

  // Required fields
  if (typeof b.name !== "string" || !b.name.trim()) {
    throw Object.assign(new Error("'name' is required"), { status: 400 })
  }
  if (typeof b.query !== "string" || !b.query.trim()) {
    throw Object.assign(new Error("'query' is required"), { status: 400 })
  }

  const validCategories: ExaCategory[] = [
    "company", "research paper", "news", "pdf", "github",
    "tweet", "personal site", "linkedin profile", "financial report",
  ]
  if (!validCategories.includes(b.category as ExaCategory)) {
    throw Object.assign(new Error(`'category' must be one of: ${validCategories.join(", ")}`), { status: 400 })
  }

  const schedule: { enabled: boolean; frequency: "daily" | "hourly" | "weekly"; times?: string[] | undefined } = {
    enabled: false,
    frequency: "daily",
    times: undefined,
  }
  if (b.schedule && typeof b.schedule === "object" && !Array.isArray(b.schedule)) {
    const s = b.schedule as Record<string, unknown>
    schedule.enabled = typeof s.enabled === "boolean" ? s.enabled : false
    schedule.frequency = s.frequency === "hourly" || s.frequency === "weekly" || s.frequency === "daily"
      ? s.frequency
      : "daily"
    if (Array.isArray(s.times)) {
      schedule.times = (s.times as unknown[]).filter(t => typeof t === "string")
    }
  }

  return {
    name:     (b.name     as string).trim(),
    query:    (b.query    as string).trim(),
    category: b.category  as ExaCategory,
    // ✅ Only pass known safe fields — strip id, createdAt, userId, unknown fields
    filters:  (b.filters  && typeof b.filters  === "object" && !Array.isArray(b.filters))
                ? b.filters  as Record<string, unknown>
                : {},
    schedule,
    tags:     Array.isArray(b.tags)
                ? (b.tags as unknown[]).filter(t => typeof t === "string").slice(0, 10)
                : [],
  }
}

/**
 * Parse x-user-agent header set by middleware.
 * Returns a safe default on any parse failure.
 */
function parseUserAgent(raw: string | null) {
  const defaults = {
    browser:    "unknown",
    version:    "unknown",
    deviceType: "unknown",
    os:         "unknown",
    isBot:      false,
  }

  if (!raw) return defaults

  try {
    const parsed = JSON.parse(raw)
    return {
      browser:    typeof parsed.browser    === "string"  ? parsed.browser    : defaults.browser,
      version:    typeof parsed.version    === "string"  ? parsed.version    : defaults.version,
      deviceType: typeof parsed.deviceType === "string"  ? parsed.deviceType : defaults.deviceType,
      os:         typeof parsed.os         === "string"  ? parsed.os         : defaults.os,
      isBot:      typeof parsed.isBot      === "boolean" ? parsed.isBot      : defaults.isBot,
    }
  } catch {
    return defaults
  }
}

// ─── GET /api/queries ─────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    // ✅ getCurrentUser() inside try/catch — handles Appwrite/network errors
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const queries = await databaseService.queryService.getQueries(user.$id)
    return NextResponse.json(queries)
  } catch (err) {
    console.error("[GET /api/queries] Failed:", err)
    return NextResponse.json({ error: "Failed to fetch queries" }, { status: 500 })
  }
}

// ─── POST /api/queries ────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // ✅ Auth inside try/catch
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // ✅ Separate JSON parse error (400) from service errors (500)
    let rawBody: unknown
    try {
      rawBody = await request.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    // ✅ Validate and strip protected fields — id, createdAt, userId cannot be injected
    let validated: ReturnType<typeof parseCreateBody>
    try {
      validated = parseCreateBody(rawBody)
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: err.status ?? 400 })
    }

    const query = await databaseService.queryService.createQuery({
      ...validated,
      userId: user.$id,   // always from auth, never from body
    })

    // Access log — trim to essential fields, not full query object
    const ip            = request.headers.get("x-real-ip") ?? "unknown"
    const userAgentInfo = parseUserAgent(request.headers.get("x-user-agent"))

    await databaseService.accessLogService.logAccess(
      user.$id,
      "create_query",
      { queryId: query.id, name: query.name, category: query.category },
      ip,
      userAgentInfo
    )

    return NextResponse.json(query, { status: 201 })
  } catch (err) {
    console.error("[POST /api/queries] Failed:", err)
    return NextResponse.json({ error: "Failed to create query" }, { status: 500 })
  }
}