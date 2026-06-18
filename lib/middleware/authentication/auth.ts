// app/server/auth.ts
import { cookies } from "next/headers"
import { Client, Account } from "appwrite"
import type { Models } from "appwrite"

// ─── Per-request Appwrite client factory ──────────────────────────────────────
//
//  NEVER call setJWT() on the shared `account` singleton from appwrite.ts.
//    That client is stateful — setJWT() mutates internal headers.
//    Two concurrent requests sharing one client race:
//      Request A sets jwt_A → Request B sets jwt_B →
//      Request A calls account.get() but now authenticates as B.
//
//    Solution: create a fresh Client + Account per call.
//    Client construction is cheap (no network call).

function createAccountForJwt(jwt: string): Account {
  const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT ?? "https://cloud.appwrite.io/v1")
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID ?? "")
    .setJWT(jwt)
  return new Account(client)
}

// ─── Known Appwrite auth error patterns ───────────────────────────────────────

const AUTH_ERROR_PATTERNS = [
  "jwt", "unauthorized", "missing scope",
  "invalid credentials", "user not found", "session not found",
]

function isAuthError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
  return AUTH_ERROR_PATTERNS.some(p => msg.includes(p))
}

// ─── getCurrentUser ───────────────────────────────────────────────────────────

export async function getCurrentUser(): Promise<Models.User<Models.Preferences> | null> {
  try {
    const cookieStore = await cookies()
    const raw = cookieStore.get("appwrite_jwt")?.value

    //  Trim + minimum length check — rejects empty string
    const jwt = raw?.trim()
    if (!jwt || jwt.length < 10) return null

    //  No local jwtDecode() — it only decodes, never verifies the signature.
    //    A crafted JWT with any exp would pass a local decode check.
    //    Appwrite's account.get() is the actual authority — it rejects expired
    //    or tampered tokens server-side. Skip the local decode entirely.

    //  Per-request Account — isolated JWT, no shared state mutation
    const account = createAccountForJwt(jwt)
    const user    = await account.get()

    return user
  } catch (err) {
    // Log unexpected errors (Appwrite down, network failure) but not
    // normal auth failures (expired JWT, invalid token) — those are
    // expected on every logged-out request and would spam logs
    if (!isAuthError(err)) {
      console.error("[getCurrentUser] Unexpected error:", err)
    }
    return null
  }
}