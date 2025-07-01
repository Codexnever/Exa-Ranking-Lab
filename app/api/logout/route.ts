import { NextResponse } from "next/server"

export async function POST() {
  // Remove the appwrite_jwt cookie
  const res = NextResponse.json({ success: true })
  res.cookies.set("appwrite_jwt", "", {
    httpOnly: true,
    secure: true,
    path: "/",
    maxAge: 0,
    sameSite: "strict",
  })
  return res
}
