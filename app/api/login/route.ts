import { NextResponse } from "next/server"

export async function POST(req: Request) {
  const { email, password } = await req.json()

  try {
    // 1. Create session via Appwrite REST API
    const sessionRes = await fetch(
      `${process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT}/account/sessions/email`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Appwrite-Project": process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!,
        },
        body: JSON.stringify({ email, password }),
      }
    )
    if (!sessionRes.ok) throw new Error("Invalid credentials")

    // 2. Extract session cookie
    const setCookie = sessionRes.headers.get("set-cookie")
    if (!setCookie) throw new Error("No session cookie returned from Appwrite")

    // 3. Use session cookie to get JWT
    const jwtRes = await fetch(
      `${process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT}/account/jwt`,
      {
        method: "POST",
        headers: {
          "X-Appwrite-Project": process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!,
          Cookie: setCookie,
        },
      }
    )
    if (!jwtRes.ok) throw new Error("Failed to get JWT from Appwrite")
    const { jwt } = await jwtRes.json()
    if (!jwt) throw new Error("JWT generation failed")

    // 4. Set HttpOnly cookie (7 days)
    const res = NextResponse.json({ success: true })
    res.cookies.set("appwrite_jwt", jwt, {
      httpOnly: true,
      secure: true,
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
      sameSite: "strict",
    })
    return res
  } catch (err) {
    console.error("Login error:", err)
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
  }
}
