// app/api/snapshots/paginated/route.ts
import { type NextRequest, NextResponse } from "next/server"
import { databaseService } from "@/app/services/database/database-service"
import { getCurrentUser } from "@/lib/middleware/authentication/auth"

const MAX_LIMIT     = 100
const DEFAULT_LIMIT = 20
const DEFAULT_PAGE  = 1

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(request.url)

    // ✅ userId always from auth — never from query string
    const userId  = user.$id
    const queryId = searchParams.get("queryId") ?? undefined

    // ✅ Validated pagination params — NaN-safe, clamped
    const rawPage  = parseInt(searchParams.get("page")  ?? "", 10)
    const rawLimit = parseInt(searchParams.get("limit") ?? "", 10)

    const page  = isNaN(rawPage)  || rawPage  < 1 ? DEFAULT_PAGE  : rawPage
    const limit = isNaN(rawLimit) || rawLimit < 1 ? DEFAULT_LIMIT
                : rawLimit > MAX_LIMIT             ? MAX_LIMIT
                : rawLimit

    console.log(`[Snapshots/Paginated] page=${page}, limit=${limit}, userId=${userId}`)

    const result = await databaseService.snapshotService.getSnapshotsPaginated(
      queryId,
      userId,
      page,
      limit
    )

    console.log(
      `[Snapshots/Paginated] ${result.data.length} snapshots, ` +
      `page ${result.pagination.page}/${result.pagination.totalPages}`
    )

    return NextResponse.json(result)
  } catch (err) {
    console.error("[GET /api/snapshots/paginated] Failed:", err)
    // ✅ No internal error details exposed to client
    return NextResponse.json({ error: "Failed to fetch snapshots" }, { status: 500 })
  }
}