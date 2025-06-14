// app/api/export-data/route.ts

import { type NextRequest, NextResponse } from "next/server"
import { databaseService } from "@/lib/database-service"
import { getCurrentUser } from "@/lib/auth"

export async function GET(request: NextRequest) {
  // Authenticate user via JWT
  const user = await getCurrentUser(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get("type")
    const id = searchParams.get("id")

    if (!type) {
      return NextResponse.json({ error: "Export type is required" }, { status: 400 })
    }

    let data: any

    switch (type) {
      case "snapshot": {
        if (!id) {
          return NextResponse.json({ error: "Snapshot ID is required" }, { status: 400 })
        }

        data = await databaseService.getSnapshot(id)
        if (!data) {
          return NextResponse.json({ error: "Snapshot not found" }, { status: 404 })
        }
        if (data.userId !== user.$id) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 })
        }
        break
      }

      case "query": {
        if (!id) {
          return NextResponse.json({ error: "Query ID is required" }, { status: 400 })
        }

        const query = await databaseService.getQuery(id)
        if (!query) {
          return NextResponse.json({ error: "Query not found" }, { status: 404 })
        }
        if (query.userId !== user.$id) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 })
        }

        // Fetch all snapshots belonging to this query and user
        const snapshots = await databaseService.getSnapshots(id, user.$id)

        data = {
          query,
          snapshots,
        }
        break
      }

      case "analytics": {
        // Export analytics only for the logged-in user
        data = await databaseService.getAnalytics(user.$id)
        break
      }

      case "all": {
        // Export all user data for full backup/export
        const [queries, snapshots, feedback, analytics] = await Promise.all([
          databaseService.getQueries(user.$id),
          databaseService.getSnapshots(undefined, user.$id),
          databaseService.getFeedback(),
          databaseService.getAnalytics(user.$id),
        ])
        data = { queries, snapshots, feedback, analytics }
        break
      }

      default:
        return NextResponse.json({ error: "Invalid export type" }, { status: 400 })
    }

    // Wrap export data with metadata for traceability
    const exportData = {
      type,
      exportedAt: new Date().toISOString(),
      data,
    }

    return NextResponse.json(exportData)
  } catch (error) {
    console.error("Failed to export data:", error)
    return NextResponse.json(
      {
        error: "Failed to export data",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
