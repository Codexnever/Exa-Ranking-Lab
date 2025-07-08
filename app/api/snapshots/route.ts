import { type NextRequest, NextResponse } from "next/server"
import { databaseService } from "@/lib/database-service"
import { users } from "@/lib/appwrite-server"
import { getCurrentUser } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const queryId = searchParams.get("queryId")
    const userId = searchParams.get("userId")

    const snapshots = await databaseService.snapshotService.getSnapshots(queryId || undefined, userId || undefined)

    // Sort by newest first
    snapshots.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    return NextResponse.json(snapshots)
  } catch (error) {
    console.error("Failed to fetch snapshots:", error)
    return NextResponse.json(
      {
        error: "Failed to fetch snapshots",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    // 🔐 Validate JWT and get user
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // 🛠 Proceed to snapshot creation
    const snapshot = await request.json()
    const newSnapshot = await databaseService.snapshotService.createSnapshot({
      ...snapshot,
      userId: user.$id, // Attach correct user to snapshot
      timestamp: new Date(),
    })

    return NextResponse.json(newSnapshot)
  } catch (error) {
    console.error("Failed to create snapshot:", error)
    return NextResponse.json(
      {
        error: "Failed to create snapshot",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
