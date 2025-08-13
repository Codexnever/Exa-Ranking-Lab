// app/api/set-cookie/route.ts
import { NextResponse } from "next/server";
import { jwtDecode } from "jwt-decode";

interface DecodedJWT {
  exp?: number;
}

export async function POST(req: Request) {
  const { jwt } = await req.json();

   if (!jwt || typeof jwt !== 'string') {
      return NextResponse.json(
        { error: "Invalid JWT provided" }, 
        { status: 400 }
      );
    }

  // Validate JWT (basic check)
  try {
    const decoded = jwtDecode<DecodedJWT>(jwt);
    if (!decoded.exp || Date.now() / 1000 > decoded.exp) {
      return NextResponse.json({ error: "Invalid or expired JWT" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid JWT format" }, { status: 400 });
  }

  const res = NextResponse.json({ success: true });

  res.cookies.set({
    name: "appwrite_jwt",
    value: jwt,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production", // Secure in production
    path: "/",
    sameSite: "strict",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

  return res;
}
