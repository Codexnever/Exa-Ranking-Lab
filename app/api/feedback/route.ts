// app/api/feedback/route.ts

import { type NextRequest, NextResponse } from "next/server"
import { databaseService } from "@/lib/database-service"
import { getCurrentUser } from "@/lib/auth"

export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const queryId = searchParams.get("queryId")

    const feedback = await databaseService.getFeedback(queryId || user.$id)
    return NextResponse.json(feedback)
  } catch (error) {
    console.error("❌ Failed to fetch feedback:", error)
    return NextResponse.json({ error: "Failed to fetch feedback" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()

    const feedback = await databaseService.createFeedback({
      ...body,
      userId: user.$id,
    })

    return NextResponse.json(feedback)
  } catch (error) {
    console.error("❌ Failed to create feedback:", error)
    return NextResponse.json({ error: "Failed to create feedback" }, { status: 500 })
  }
}
