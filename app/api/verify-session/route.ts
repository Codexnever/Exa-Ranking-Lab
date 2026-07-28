// app/api/verify-session/route.ts
import { NextRequest, NextResponse } from "next/server"
import { Client, Account } from "appwrite"
import { cookies } from "next/headers"

// force-dynamic ensures Next.js never statically caches this route
export const dynamic = "force-dynamic"

// ─── Per-request Appwrite client factory ──────────────────────────────────────
//
// ✅ NEVER call setJWT() on a shared/singleton client.
//    Appwrite's client is stateful — setJWT() mutates internal headers.
//    In a concurrent serverless environment two requests sharing one client
//    will race: Request A sets JWT_A → Request B sets JWT_B → Request A
//    calls account.get() but now authenticates as B's user.
//
//    Solution: create a fresh Client + Account per request.
//    Client construction is cheap (no network call) so this is safe.

function createAccountForJwt(jwt: string): Account {
  const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT ?? "https://cloud.appwrite.io/v1")
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID ?? "")
    .setJWT(jwt)           // scoped to this instance only
  return new Account(client)
}

// ─── Known Appwrite auth error patterns ───────────────────────────────────────

const AUTH_ERROR_PATTERNS = [
  "jwt",
  "unauthorized",
  "missing scope",
  "invalid credentials",
  "user not found",
  "session not found",
]

function isAuthError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
  return AUTH_ERROR_PATTERNS.some(p => msg.includes(p))
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const raw = cookieStore.get("appwrite_jwt")?.value

    // ✅ Trim + length check — rejects empty string that would pass `!raw`
    const jwt = raw?.trim()
    if (!jwt || jwt.length < 10) {
      return NextResponse.json(
        { error: "No session" },
        {
          status: 401,
          headers: { "Cache-Control": "no-store" },
        }
      )
    }

    // ✅ Fresh per-request Account — no shared state mutation
    const account = createAccountForJwt(jwt)
    const user    = await account.get()

    // ✅ Return only what AuthContext needs — don't leak Appwrite internals
    //    (labels, passwordUpdate timestamp, mfa factors, etc.)
    const safeUser = {
      $id:    user.$id,
      name:   user.name,
      email:  user.email,
      prefs:  user.prefs,
    }

    return NextResponse.json(safeUser, {
      status: 200,
      headers: {
        // ✅ Prevent CDN / proxy caching of auth responses
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    })
  } catch (err) {
    // ✅ Log unexpected errors (Appwrite down, network failure) but not
    //    normal auth failures (expired JWT, invalid token) — those are
    //    expected and would spam the logs on every logged-out page load
    if (!isAuthError(err)) {
      console.error("[verify-session] Unexpected error:", err)
    }

    return NextResponse.json(
      { error: "Unauthorized" },
      {
        status: 401,
        headers: { "Cache-Control": "no-store" },
      }
    )
  }
}