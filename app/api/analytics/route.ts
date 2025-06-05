// app/api/analytics/route.ts

import { type NextRequest, NextResponse } from "next/server"
import { databaseService } from "@/lib/database-service"
import { getCurrentUser } from "@/lib/auth"

export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const analytics = await databaseService.getAnalytics(user.$id)
    return NextResponse.json(analytics)
  } catch (error) {
    console.error("❌ Failed to fetch analytics:", error)
    return NextResponse.json(
      {
        error: "Failed to fetch analytics",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
