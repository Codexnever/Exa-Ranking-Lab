import { type NextRequest, NextResponse } from "next/server"
import { databaseService } from "@/lib/database-service"
import { users } from "@/lib/appwrite-server"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const queryId = searchParams.get("queryId")

    const snapshots = await databaseService.getSnapshots(queryId || undefined)

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
    // 🔐 Validate JWT
    const authHeader = request.headers.get("authorization")
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const jwt = authHeader.split("Bearer ")[1].trim()

    let user
    try {
      const response = await fetch(`${process.env.APPWRITE_ENDPOINT}/v1/account/jwt`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Appwrite-Project": process.env.APPWRITE_PROJECT_ID!,
          "X-Appwrite-Key": process.env.APPWRITE_API_KEY!,
          Authorization: `Bearer ${jwt}`,
        },
      })

      if (!response.ok) throw new Error("Invalid JWT")

      user = await response.json()
      console.log("✅ JWT verified for user:", user.$id)
    } catch (err) {
      console.error("[JWT Verification Error]", err)
      return NextResponse.json({ error: "Invalid JWT" }, { status: 401 })
    }

    // 🛠 Proceed to snapshot creation
    const snapshot = await request.json()
    const newSnapshot = await databaseService.createSnapshot({
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
