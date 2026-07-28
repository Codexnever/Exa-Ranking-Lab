// app/api/snapshots/analytics/route.ts
import { type NextRequest, NextResponse } from "next/server"
import { databaseService } from "@/app/services/database/database-service"
import { getCurrentUser } from "@/lib/middleware/authentication/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const queryId = searchParams.get("queryId") ?? undefined

    // ✅ userId always from auth — never from query string
    const userId = user.$id

    console.log(`[Snapshots/Analytics] Fetching for userId=${userId}, queryId=${queryId ?? "all"}`)

    const snapshots = await databaseService.snapshotService.getSnapshots(
      queryId,
      userId,
      1000  // High limit for analytics — getSnapshots warns if truncated
    )
    // ✅ Removed redundant sort — getSnapshots already applies orderDesc("timestamp")

    console.log(`[Snapshots/Analytics] Returning ${snapshots.length} snapshots`)
    return NextResponse.json(snapshots)
  } catch (err) {
    console.error("[GET /api/snapshots/analytics] Failed:", err)
    // ✅ No internal error details exposed to client
    return NextResponse.json({ error: "Failed to fetch analytics snapshots" }, { status: 500 })
  }
}