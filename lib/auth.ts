import { users } from "@/lib/appwrite-server"
import { jwtDecode } from "jwt-decode"
import { NextRequest } from "next/server"

export async function getCurrentUser(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization") || ""
    const cookieHeader = request.headers.get("cookie") || ""

    let jwt = ""
    if (authHeader.startsWith("Bearer ")) {
      jwt = authHeader.replace("Bearer ", "").trim()
    } else {
      const cookies = new Map(
        cookieHeader.split(";").map((c) => {
          const [k, ...v] = c.trim().split("=")
          return [k, decodeURIComponent(v.join("="))]
        })
      )
      jwt = cookies.get("appwrite_jwt") || ""
    }

    if (!jwt) return null

    const decoded: any = jwtDecode(jwt)
    const userId = decoded.userId || decoded.user_id || decoded.uid

    if (!userId) return null

    const user = await users.get(userId)
    return user
  } catch (err) {
    return null
  }
}
