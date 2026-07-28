// app/api/snapshots/route.ts
import { type NextRequest, NextResponse } from "next/server"
import { databaseService } from "@/app/services/database/database-service"
import { getCurrentUser } from "@/lib/middleware/authentication/auth"

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_LIMIT = 100
const MIN_LIMIT     = 1
const MAX_LIMIT     = 1000

// ─── Shared helpers ───────────────────────────────────────────────────────────

/** Parse and clamp the ?limit= query param. Returns a safe integer. */
function parseLimit(raw: string | null): number {
  if (!raw) return DEFAULT_LIMIT
  const n = parseInt(raw, 10)
  if (isNaN(n)) return DEFAULT_LIMIT
  return Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, n))
}

/**
 * Parse x-user-agent header set by middleware.
 * Never throws — returns safe defaults on any failure.
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

// ─── GET /api/snapshots ───────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const queryId = searchParams.get("queryId") ?? undefined

    // ✅ userId ALWAYS comes from auth token — never from query string
    //    Accepting ?userId= from the client would let any user read
    //    another user's snapshots by passing their ID.
    const userId = user.$id

    // ✅ Validated and clamped limit — never NaN, never negative, never huge
    const limit = parseLimit(searchParams.get("limit"))

    console.log("[Snapshots API] GET:", { queryId, userId, limit })

    const snapshots = await databaseService.snapshotService.getSnapshots(
      queryId,
      userId,
      limit
    )
    // ✅ Removed redundant sort — getSnapshots already applies orderDesc("timestamp")

    console.log(`[Snapshots API] Returning ${snapshots.length} snapshots`)
    return NextResponse.json(snapshots)
  } catch (err) {
    console.error("[GET /api/snapshots] Failed:", err)
    // ✅ No internal details exposed to client
    return NextResponse.json({ error: "Failed to fetch snapshots" }, { status: 500 })
  }
}

// ─── POST /api/snapshots ──────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // ✅ Separate JSON parse error (400) from server errors (500)
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Request body must be a JSON object" }, { status: 400 })
    }

    const b = body as Record<string, unknown>

    // ✅ Validate queryId — required and must belong to this user
    if (typeof b.queryId !== "string" || !b.queryId.trim()) {
      return NextResponse.json({ error: "'queryId' is required" }, { status: 400 })
    }

    const ownedQuery = await databaseService.queryService.getQuery(b.queryId)
    if (!ownedQuery || ownedQuery.userId !== user.$id) {
      // 404 — don't reveal whether the query exists at all
      return NextResponse.json({ error: "Query not found" }, { status: 404 })
    }

    // ✅ Validate results — must be an array
    if (!Array.isArray(b.results)) {
      return NextResponse.json({ error: "'results' must be an array" }, { status: 400 })
    }

    console.log(`[Snapshots API] Manual snapshot by user: ${user.$id}, query: ${b.queryId}`)

    const providedMetadata = typeof b.metadata === "object" && b.metadata !== null ? b.metadata as Record<string, unknown> : {}
    const responseTime = typeof providedMetadata.responseTime === "number" ? providedMetadata.responseTime : 0

    const newSnapshot = await databaseService.snapshotService.createSnapshot({
      queryId:   b.queryId,
      results:   b.results,
      // ✅ userId always from auth — never from body
      userId:    user.$id,
      timestamp: new Date(),
      metadata: {
        // Safe merge of caller-provided metadata with required overrides
        ...providedMetadata,
        totalResults:  (b.results as unknown[]).length,
        responseTime,
        executedAt:    new Date().toISOString(),
        executionType: "manual",
        source:        "snapshots_api",
      },
    })

    console.log(`[Snapshots API] Snapshot created: ${newSnapshot.id}`)

    // ✅ Trimmed access log — no full snapshot object with all results
    const ip            = request.headers.get("x-real-ip") ?? "unknown"
    const userAgentInfo = parseUserAgent(request.headers.get("x-user-agent"))

    await databaseService.accessLogService.logAccess(
      user.$id,
      "create_snapshot",
      { snapshotId: newSnapshot.id, queryId: newSnapshot.queryId },
      ip,
      userAgentInfo
    )

    // ✅ 201 Created
    return NextResponse.json(newSnapshot, { status: 201 })
  } catch (err) {
    console.error("[POST /api/snapshots] Failed:", err)
    // ✅ No internal details exposed to client
    return NextResponse.json({ error: "Failed to create snapshot" }, { status: 500 })
  }
}