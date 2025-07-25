import { type NextRequest, NextResponse } from "next/server"
import { databaseService } from "@/app/services/database-service"
import { users } from "@/app/server/appwrite-server"
import { getCurrentUser } from "@/app/server/auth"; 


export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const queryId = searchParams.get("queryId")
    const userId = searchParams.get("userId")
    const limitParam = searchParams.get("limit")
    
    // ✅ Allow custom limit, default to 100
    const limit = limitParam ? parseInt(limitParam, 10) : 100
    
    console.log('[API] Fetching snapshots with params:', { queryId, userId, limit })

    const snapshots = await databaseService.snapshotService.getSnapshots(
      queryId || undefined, 
      userId || undefined,
      limit // ✅ Pass limit to service
    )
    
    console.log(`[API] Retrieved ${snapshots.length} snapshots from service`)

    // Sort by newest first (additional safety)
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

    // Access log
    const ip = request.headers.get("x-real-ip") || "unknown"
    const uaRaw = request.headers.get("x-user-agent") || "{}"
    let userAgentInfo: {
      browser: string;
      version: string;
      deviceType: string;
      os: string;
      isBot: boolean;
    } = {
      browser: "unknown",
      version: "unknown",
      deviceType: "unknown",
      os: "unknown",
      isBot: false,
    }
    try {
      const parsed = JSON.parse(uaRaw)
      userAgentInfo = {
        browser: parsed.browser || "unknown",
        version: parsed.version || "unknown",
        deviceType: parsed.deviceType || "unknown",
        os: parsed.os || "unknown",
        isBot: parsed.isBot || false,
      }
    } catch {}
    await databaseService.accessLogService.logAccess(
      user.$id,
      "create_snapshot",
      { snapshot: newSnapshot },
      ip,
      userAgentInfo
    )
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
