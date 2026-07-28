// app/api/weaviate/semantic-stability/route.ts
import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/middleware/authentication/auth"
import { calculateSemanticStability } from "@/app/services/appwrite/analytics-calculations"

const MAX_ITEMS = 500

export async function POST(request: NextRequest) {
  try {
    // ✅ Auth required
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 })
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: "Request body must be a JSON object" }, { status: 400 })
    }

    const b = body as Record<string, unknown>

    // ✅ timeSeriesData validated — array with item shape check
    if (!Array.isArray(b.timeSeriesData)) {
      return NextResponse.json(
        { success: false, error: "'timeSeriesData' must be an array" },
        { status: 400 }
      )
    }

    if (b.timeSeriesData.length < 2) {
      return NextResponse.json(
        { success: false, error: "'timeSeriesData' must contain at least 2 items" },
        { status: 400 }
      )
    }

    // ✅ Cap array size to prevent abuse
    const raw = b.timeSeriesData.slice(0, MAX_ITEMS) as unknown[]

    // ✅ Validate item shape — filter out malformed entries
    const timeSeriesData = raw.filter(
      (item): item is { timestamp: number; content: string; vectors?: number[][] } =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as any).timestamp === "number" &&
        typeof (item as any).content   === "string" &&
        (item as any).content.trim().length > 0
    )

    if (timeSeriesData.length < 2) {
      return NextResponse.json(
        { success: false, error: "At least 2 valid items (with 'timestamp' and 'content') are required" },
        { status: 400 }
      )
    }

    // ✅ queryId: optional, used for logging only — not required
    const queryId = typeof b.queryId === "string" ? b.queryId.trim() : "unknown"

    console.log(
      `[SemanticStability] user=${user.$id}, query=${queryId}, items=${timeSeriesData.length}`
    )

    const result = calculateSemanticStability(timeSeriesData)

    return NextResponse.json({
      success: true,
      result,          // ✅ Named key instead of spreading — explicit shape
      queryId,
      itemsProcessed: timeSeriesData.length,
      itemsCapped:    raw.length < (b.timeSeriesData as unknown[]).length,
    })
  } catch (err) {
    console.error("[SemanticStability] Failed:", err)
    // ✅ No internal error details exposed to client
    return NextResponse.json(
      { success: false, error: "Failed to calculate semantic stability" },
      { status: 500 }
    )
  }
}