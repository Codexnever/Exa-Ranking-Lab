// app/api/snapshots/analytics/route.ts
import { type NextRequest, NextResponse } from "next/server"
import { databaseService } from "@/app/services/database-service"
import { getCurrentUser } from "@/app/server/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const queryId = searchParams.get("queryId")
    const userId = searchParams.get("userId") || user.$id

    console.log(`[API] Fetching ALL snapshots for analytics: userId=${userId}`)

    // Fetch ALL snapshots for analytics (higher limit)
    const snapshots = await databaseService.snapshotService.getSnapshots(
      queryId || undefined,
      userId,
      1000 // High limit for analytics
    )

    console.log(`[API] Analytics snapshots: ${snapshots.length} total snapshots`)

    // Sort by newest first
    snapshots.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    return NextResponse.json(snapshots)
  } catch (error) {
    console.error("Failed to fetch analytics snapshots:", error)
    return NextResponse.json(
      {
        error: "Failed to fetch analytics snapshots",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
