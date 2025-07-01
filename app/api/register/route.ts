import { NextResponse } from "next/server"
import { account } from "@/lib/appwrite"
import { cookies } from "next/headers"

export async function POST(req: Request) {
  const { email, password, name } = await req.json()

  try {
    // Create account
    await account.create("unique()", email, password, name)

    // Create session
    await account.createEmailPasswordSession(email, password)

    // Generate JWT
    const { jwt } = await account.createJWT()
    if (!jwt) throw new Error("JWT generation failed")

    // Set HttpOnly cookie
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
    console.error("Register error:", err)
    return NextResponse.json({ error: "Registration failed" }, { status: 400 })
  }
}
