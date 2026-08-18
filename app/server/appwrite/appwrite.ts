// app/server/appwrite.ts
"use client"
// ^^^^ This module is client-side only.
// `databases` is also imported by server-side API routes for direct Appwrite
// document operations — that is safe because the Databases client does not
// carry per-user auth state (unlike Account which uses setJWT).
// login/register/logout/getCurrentAccount are client-only and should never
// be called from API route handlers.

import { Client, Account, Databases, Storage, Functions } from "appwrite"

// ─── Startup config validation ────────────────────────────────────────────────
//  Fail fast with a clear message rather than cryptic Appwrite errors later.
// Only validates in browser context — env vars are available at build time
// for server-side usage.

if (typeof window !== "undefined") {
  const required: Record<string, string | undefined> = {
    NEXT_PUBLIC_APPWRITE_ENDPOINT:    process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT,
    NEXT_PUBLIC_APPWRITE_PROJECT_ID:  process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID,
    NEXT_PUBLIC_APPWRITE_DATABASE_ID: process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID,
  }
  const missing = Object.entries(required)
    .filter(([, v]) => !v)
    .map(([k]) => k)
  if (missing.length > 0) {
    console.error(
      `[Appwrite] Missing required environment variables: ${missing.join(", ")}. ` +
      "Check your .env.local file."
    )
  }
}

// ─── Shared client ────────────────────────────────────────────────────────────

const client = new Client()
  .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
  .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!)

export const account   = new Account(client)
export const databases = new Databases(client)
export const storage   = new Storage(client)
export const functions = new Functions(client)
export { client }

// ─── Config ───────────────────────────────────────────────────────────────────

export const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!

export const COLLECTIONS = {
  USERS:         process.env.COLLECTION_USERS!,
  QUERIES:       process.env.COLLECTION_QUERIES!,
  SNAPSHOTS:     process.env.COLLECTION_SNAPSHOTS!,
  FEEDBACK:      process.env.COLLECTION_FEEDBACK!,
  ANALYTICS:     process.env.COLLECTION_ANALYTICS!,
  NOTIFICATIONS: process.env.COLLECTION_NOTIFICATIONS!,
  ACCESS_LOGS:   process.env.NEXT_PUBLIC_COLLECTION_ACCESS_LOGS!,
  API_USAGE:     process.env.COLLECTION_API_USAGE!,
  SETTINGS:      process.env.NEXT_PUBLIC_COLLECTION_SETTINGS!,
  EVALUATION_DATASETS: process.env.COLLECTION_EVALUATION_DATASETS!,
  EVALUATION_QUERIES: process.env.COLLECTION_EVALUATION_QUERIES!,
  RELEVANCE_JUDGMENTS: process.env.COLLECTION_RELEVANCE_JUDGMENTS!,
  EVALUATION_RUNS: process.env.COLLECTION_EVALUATION_RUNS!,
  EVALUATION_RUN_QUERIES: process.env.COLLECTION_EVALUATION_RUN_QUERIES!,
  EVALUATION_STAGE_TRACES: process.env.COLLECTION_EVALUATION_STAGE_TRACES!,
  EVALUATION_STAGE_TRACE_DOCUMENTS: process.env.COLLECTION_EVALUATION_STAGE_TRACE_DOCUMENTS!,
}

// ─── Retry helper ─────────────────────────────────────────────────────────────

async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  delayMs    = 1000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation()
    } catch (err: any) {
      const isRetryable =
        err?.code === 502 || err?.code === 503 || err?.code === 504 ||
        err?.message?.includes("502") ||
        err?.message?.includes("Failed to fetch") ||
        err?.message?.includes("Network") ||
        err?.message?.includes("timeout")

      if (i === maxRetries - 1 || !isRetryable) throw err
      console.warn(`[Appwrite] Retry ${i + 1}/${maxRetries}:`, err?.message)
      await new Promise(r => setTimeout(r, delayMs * (i + 1)))
    }
  }
  throw new Error("[Appwrite] Max retries exceeded")
}

// ─── Auth functions (client-side only) ───────────────────────────────────────

export async function login(email: string, password: string) {
  try {
    // Clear any existing session first
    await account.deleteSession("current").catch(() => {})

    const session = await retryOperation(
      () => account.createEmailPasswordSession(email, password),
      3,
      1000
    )

    const jwtRes = await account.createJWT()
    const jwt    = jwtRes.jwt
    if (!jwt) throw new Error("JWT not generated after login")

    const res = await fetch("/api/set-cookie", {
      method:      "POST",
      headers:     { "Content-Type": "application/json" },
      credentials: "include",
      body:        JSON.stringify({ jwt }),
    })
    if (!res.ok) throw new Error("Failed to set session cookie")

    // ✅ Log only safe session metadata — never the full session object
    //    which contains providerAccessToken and other credentials
    console.log("[Appwrite] Login successful:", {
      userId: session.userId,
      expire: session.expire,
    })

    return session
  } catch (err: any) {
    console.error("[Appwrite] Login failed:", err?.message)

    if (err?.code === 502 || err?.message?.includes("502")) {
      throw new Error("Appwrite server is temporarily unavailable. Please try again.")
    }
    if (err?.message?.includes("CORS") || err?.message?.includes("Failed to fetch")) {
      throw new Error("Network error. Please check your connection and try again.")
    }
    if (err?.code === 401) {
      throw new Error("Invalid email or password.")
    }

    throw err
  }
}

export async function register(email: string, password: string, name: string) {
  try {
    await account.deleteSession("current").catch(() => {})
    await account.create("unique()", email, password, name)
    return await login(email, password)
  } catch (err) {
    console.error("[Appwrite] Register failed:", err)
    throw err
  }
}

export async function logout() {
  //  Throws on failure so auth-context.logoutFn can show the error toast
  await account.deleteSession("current")
  console.log("[Appwrite] Logged out")
}

export async function getCurrentAccount() {
  try {
    return await account.get()
  } catch {
    return null
  }
}
