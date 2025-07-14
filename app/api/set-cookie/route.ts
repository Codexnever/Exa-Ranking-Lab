import { NextResponse } from "next/server"
import { cookies } from 'next/headers'

export async function POST(req: Request) {
  const { jwt } = await req.json()

  if (!jwt) {
    return NextResponse.json({ error: "Missing JWT" }, { status: 400 })
  }

  const res = NextResponse.json({ success: true })

  res.cookies.set({
    name: "appwrite_jwt",
    value: jwt,
    httpOnly: true,
    secure: true,
    path: "/",
    sameSite: "strict",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  })

  return res
}
