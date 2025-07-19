import { type NextRequest, NextResponse } from "next/server"
import { databaseService } from "@/app/services/database-service"
import { getCurrentUser} from "@/app/server/auth"

export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
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
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = await request.json()
    const query = await databaseService.queryService.createQuery({ ...body, userId: user.$id })
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
      "create_query",
      { query },
      ip,
      userAgentInfo
    )
    return NextResponse.json(query)
  } catch (err) {
    console.error("❌ Failed to create query:", err)
    return NextResponse.json({ error: "Failed to create query" }, { status: 500 })
  }
}
