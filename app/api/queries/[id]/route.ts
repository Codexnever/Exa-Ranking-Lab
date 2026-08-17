// app/api/queries/[id]/route.ts
import { type NextRequest, NextResponse } from "next/server"
import { databaseService } from "@/app/services/database/database-service"
import { getCurrentUser } from "@/lib/middleware/authentication/auth"
import type { ExaCategory, QueryConfig } from "@/types/type"

// ─── Shared helpers ───────────────────────────────────────────────────────────

/**
 * Parse x-user-agent header set by middleware.
 * Returns safe defaults on any parse failure — never throws.
 */
function parseUserAgent(raw: string | null) {
  const defaults = {
    browser: "unknown", version: "unknown",
    deviceType: "unknown", os: "unknown", isBot: false,
  }
  if (!raw) return defaults
  try {
    const p = JSON.parse(raw)
    return {
      browser:    typeof p.browser    === "string"  ? p.browser    : defaults.browser,
      version:    typeof p.version    === "string"  ? p.version    : defaults.version,
      deviceType: typeof p.deviceType === "string"  ? p.deviceType : defaults.deviceType,
      os:         typeof p.os         === "string"  ? p.os         : defaults.os,
      isBot:      typeof p.isBot      === "boolean" ? p.isBot      : defaults.isBot,
    }
  } catch { return defaults }
}

/**
 * Allowlist for PATCH body — only fields a caller is permitted to update.
 * Strips id, createdAt, userId and any unknown keys.
 */
function parsePatchBody(body: unknown): Partial<{
  name:      string
  query:     string
  category:  ExaCategory
  filters:   Record<string, unknown>
  schedule:  { enabled: boolean; frequency: "hourly" | "daily" | "weekly"; times?: string[] }
  tags:      string[]
  lastRun:   string
}> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw Object.assign(new Error("Request body must be a JSON object"), { status: 400 })
  }

  const b      = body as Record<string, unknown>
  const result: Record<string, unknown> = {}

  const validCategories: ExaCategory[] = [
    "company", "research_paper", "news", "pdf", "github",
    "tweet", "personal_site", "linkedin_profile", "financial_report",
  ]

  if (b.name !== undefined) {
    if (typeof b.name !== "string" || !b.name.trim())
      throw Object.assign(new Error("'name' must be a non-empty string"), { status: 400 })
    result.name = b.name.trim()
  }

  if (b.query !== undefined) {
    if (typeof b.query !== "string" || !b.query.trim())
      throw Object.assign(new Error("'query' must be a non-empty string"), { status: 400 })
    result.query = b.query.trim()
  }

  if (b.category !== undefined) {
    if (!validCategories.includes(b.category as ExaCategory))
      throw Object.assign(
        new Error(`'category' must be one of: ${validCategories.join(", ")}`),
        { status: 400 }
      )
    result.category = b.category
  }

  if (b.filters  !== undefined && typeof b.filters  === "object" && !Array.isArray(b.filters))
    result.filters = b.filters as Record<string, unknown>

  if (b.schedule !== undefined) {
    if (typeof b.schedule !== "object" || Array.isArray(b.schedule)) {
      throw Object.assign(new Error("'schedule' must be an object"), { status: 400 })
    }

    const scheduleRecord = b.schedule as Record<string, unknown>
    const frequency = scheduleRecord.frequency
    const times = scheduleRecord.times

    if (typeof scheduleRecord.enabled !== "boolean"
      || typeof frequency !== "string"
      || !["hourly", "daily", "weekly"].includes(frequency)
      || (times !== undefined && (!Array.isArray(times) || times.some(t => typeof t !== "string")))) {
      throw Object.assign(new Error("'schedule' must be a valid schedule object"), { status: 400 })
    }

    result.schedule = {
      enabled: scheduleRecord.enabled,
      frequency: frequency as "hourly" | "daily" | "weekly",
      ...(Array.isArray(times) ? { times: times as string[] } : {}),
    }
  }

  if (b.tags !== undefined) {
    result.tags = Array.isArray(b.tags)
      ? (b.tags as unknown[]).filter(t => typeof t === "string").slice(0, 10)
      : []
  }

  if (b.lastRun !== undefined && typeof b.lastRun === "string") {
    result.lastRun = new Date(b.lastRun)
  }

  if (Object.keys(result).length === 0) {
    throw Object.assign(new Error("No valid fields to update"), { status: 400 })
  }

  return result as ReturnType<typeof parsePatchBody>
}

// ─── GET /api/queries/[id] ────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    // ✅ getCurrentUser inside try/catch — handles Appwrite/network errors
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const query = await databaseService.queryService.getQuery(id)

    // ✅ Return 404 for both "not found" and "wrong owner" — don't leak existence
    if (!query || query.userId !== user.$id) {
      return NextResponse.json({ error: "Query not found" }, { status: 404 })
    }

    return NextResponse.json(query)
  } catch (err) {
    console.error("[GET /api/queries/[id]] Failed:", err)
    return NextResponse.json({ error: "Failed to fetch query" }, { status: 500 })
  }
}

// ─── PATCH /api/queries/[id] ──────────────────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    // Auth inside try/catch
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Verify ownership before parsing body (fail fast)
    const existing = await databaseService.queryService.getQuery(id)
    if (!existing || existing.userId !== user.$id) {
      return NextResponse.json({ error: "Query not found" }, { status: 404 })
    }

    // Separate JSON parse error (400) from service errors (500)
    let rawBody: unknown
    try {
      rawBody = await request.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    //  Allowlist — strips id, createdAt, userId, unknown fields
    let validated: ReturnType<typeof parsePatchBody>
    try {
      validated = parsePatchBody(rawBody)
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: err.status ?? 400 })
    }

    const updated = await databaseService.queryService.updateQuery(id, validated as Partial<QueryConfig>)
    return NextResponse.json(updated)
  } catch (err) {
    console.error("[PATCH /api/queries/[id]] Failed:", err)
    return NextResponse.json({ error: "Failed to update query" }, { status: 500 })
  }
}

// ─── DELETE /api/queries/[id] ─────────────────────────────────────────────────

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    // ✅ Auth inside try/catch
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const query = await databaseService.queryService.getQuery(id)
    if (!query || query.userId !== user.$id) {
      return NextResponse.json({ error: "Query not found" }, { status: 404 })
    }

    const ip            = request.headers.get("x-real-ip") ?? "unknown"
    // ✅ parseUserAgent never throws — malformed header gets safe defaults
    const userAgentInfo = parseUserAgent(request.headers.get("x-user-agent"))

    const success = await databaseService.queryService.deleteQuery(id, {
      userId:    user.$id,
      ipAddress: ip,
      userAgent: userAgentInfo,
    })

    if (!success) {
      return NextResponse.json({ error: "Failed to delete query" }, { status: 500 })
    }

    // ✅ Trimmed access log — no full query object
    await databaseService.accessLogService.logAccess(
      user.$id,
      "delete_query",
      { queryId: id, name: query.name },
      ip,
      userAgentInfo
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[DELETE /api/queries/[id]] Failed:", err)
    return NextResponse.json({ error: "Failed to delete query" }, { status: 500 })
  }
}
