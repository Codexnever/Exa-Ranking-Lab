// app/api/weaviate/calculate-coherence/route.ts
// NOTE: Folder was "calculate-coherance" — rename to "calculate-coherence"
import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/middleware/authentication/auth"
import { calculateUMassCoherence } from "@/lib/analytics-calculations"

const VALID_METHODS  = new Set(["umass", "cv", "npmi"])
const MAX_DOCUMENTS  = 500
const MAX_CONTENT_LEN = 10_000   // chars per document

export async function POST(request: NextRequest) {
  try {
    //  Auth required
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

    //  documents validated — array with item shape check + size cap
    if (!Array.isArray(b.documents)) {
      return NextResponse.json({ success: false, error: "'documents' must be an array" }, { status: 400 })
    }

    if (b.documents.length === 0) {
      return NextResponse.json({ success: false, error: "'documents' must not be empty" }, { status: 400 })
    }

    //  Filter valid items, cap size, truncate oversized content
    const documents = (b.documents as unknown[])
      .slice(0, MAX_DOCUMENTS)
      .filter(
        (d): d is { title: string; content: string; vector?: number[] } =>
          typeof d === "object" &&
          d !== null &&
          typeof (d as any).title   === "string" &&
          typeof (d as any).content === "string" &&
          (d as any).content.trim().length > 0
      )
      .map(d => ({
        ...d,
        // Truncate oversized fields to prevent abuse
        title:   d.title.slice(0, 500),
        content: d.content.slice(0, MAX_CONTENT_LEN),
      }))

    if (documents.length === 0) {
      return NextResponse.json(
        { success: false, error: "No valid documents. Each must have 'title' (string) and 'content' (non-empty string)" },
        { status: 400 }
      )
    }

    //  method validated against allowlist
    const rawMethod = typeof b.method === "string" ? b.method : "umass"
    const method    = VALID_METHODS.has(rawMethod)
      ? rawMethod as "umass" | "cv" | "npmi"
      : "umass"

    //  queryId optional — for logging only, not required
    const queryId = typeof b.queryId === "string" ? b.queryId.trim() : "unknown"

    console.log(
      `[CalculateCoherence] user=${user.$id}, query=${queryId}, ` +
      `docs=${documents.length}, method=${method}`
    )

    const result = calculateUMassCoherence(documents, method)

    return NextResponse.json({
      success:        true,
      data:           result,
      queryId,
      documentsUsed:  documents.length,
      documentsCapped: (b.documents as unknown[]).length > MAX_DOCUMENTS,
      method,
    })
  } catch (err) {
    console.error("[CalculateCoherence] Failed:", err)
    //  No internal error details exposed to client
    return NextResponse.json(
      { success: false, error: "Failed to calculate content coherence" },
      { status: 500 }
    )
  }
}