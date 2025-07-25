// app/api/snapshots/paginated/route.ts
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
    const page = parseInt(searchParams.get("page") || "1")
    const limit = parseInt(searchParams.get("limit") || "20")
    const queryId = searchParams.get("queryId")
    const userId = searchParams.get("userId") || user.$id

    // Validate pagination parameters
    if (page < 1 || limit < 1 || limit > 100) {
      return NextResponse.json(
        { error: "Invalid pagination parameters" },
        { status: 400 }
      )
    }

    console.log(`[API] Fetching paginated snapshots: page=${page}, limit=${limit}, userId=${userId}`)

    const result = await databaseService.snapshotService.getSnapshotsPaginated(
      queryId || undefined,
      userId,
      page,
      limit
    )

    console.log(`[API] Paginated result: ${result.data.length} snapshots, page ${result.pagination.page}/${result.pagination.totalPages}`)

    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to fetch paginated snapshots:", error)
    return NextResponse.json(
      {
        error: "Failed to fetch paginated snapshots",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
