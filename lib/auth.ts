// lib/auth.ts
import { users } from "@/lib/appwrite-server"
import { jwtDecode } from "jwt-decode"
import { NextRequest } from "next/server"

export async function getCurrentUser(request: NextRequest) {
  try {
    const cookieHeader = request.headers.get("cookie") || ""
    if (!cookieHeader) return null

    const cookies = Object.fromEntries(
      cookieHeader.split(";").map((c) => {
        const [key, ...v] = c.trim().split("=")
        return [key, decodeURIComponent(v.join("="))]
      })
    )

    const jwt = cookies["appwrite_jwt"]
    if (!jwt) return null

    const decoded: any = jwtDecode(jwt)

    // Optional: check expiry
    if (!decoded.exp || Date.now() / 1000 > decoded.exp) {
      console.warn("[getCurrentUser] JWT expired or invalid.")
      return null
    }

    const userId = decoded.userId || decoded.user_id || decoded.uid
    if (!userId) return null

    const user = await users.get(userId)
    return user
  } catch (err) {
    console.error("[getCurrentUser] Failed:", err)
    return null
  }
}
