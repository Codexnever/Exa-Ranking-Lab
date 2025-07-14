// app/api/verify-session/route.ts
import { NextRequest, NextResponse } from "next/server"
import { account } from "@/app/server/appwrite"
import { cookies } from "next/headers"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const jwt = cookieStore.get("appwrite_jwt")?.value
    if (!jwt) return NextResponse.json({ error: "No session" }, { status: 401 })

    // Set JWT to client instance
    account.client.setJWT(jwt)

    // This will fail if JWT is expired or invalid
    const user = await account.get()

    return NextResponse.json(user)
  } catch (err) {
    console.error("[verify-session] Error:", err)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}
