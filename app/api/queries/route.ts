import { type NextRequest, NextResponse } from "next/server"
import { databaseService } from "@/lib/database-service"
import { getCurrentUser} from "@/lib/auth"

export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const queries = await databaseService.queryService.getQueries(user.$id)
    return NextResponse.json(queries)
  } catch (err) {
    console.error("❌ Failed to fetch queries:", err)
    return NextResponse.json({ error: "Failed to fetch queries" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request)
  console.log("[POST /api/queries] User:", user)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = await request.json()
    const query = await databaseService.queryService.createQuery({ ...body, userId: user.$id })
    return NextResponse.json(query)
  } catch (err) {
    console.error("❌ Failed to create query:", err)
    return NextResponse.json({ error: "Failed to create query" }, { status: 500 })
  }
}
