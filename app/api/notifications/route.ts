// app/api/notifications/route.ts
import { type NextRequest, NextResponse } from "next/server"
import { withEnhancedSecurity } from "@/lib/middleware/security/security-middleware"
import { databases, DATABASE_ID } from "@/app/server/appwrite/appwrite-server"
import { Query } from "node-appwrite"
import type { SecurityContext } from "@/types/type"

const NOTIFICATIONS_COLLECTION = process.env.COLLECTION_NOTIFICATIONS ?? "notifications"

// ── GET /api/notifications ────────────────────────────────────────────────────
// Returns unread + recent notifications for the authenticated user.

async function getNotificationsHandler(
  request:     NextRequest,
  context:     SecurityContext
) {
  const userId = context.user.$id

  try {
    const result = await databases.listDocuments(
      DATABASE_ID,
      NOTIFICATIONS_COLLECTION,
      [
        Query.equal("userId", userId),
        Query.orderDesc("createdAt"),
        Query.limit(20),
      ]
    )
    return NextResponse.json(result.documents)
  } catch (err) {
    console.error("[Notifications] GET failed:", err)
    return NextResponse.json([], { status: 200 }) // silent — bell just shows 0
  }
}

export const GET = withEnhancedSecurity(getNotificationsHandler, {
  allowedMethods: ["GET"],
  logAttempts: false,
})

// ── PATCH /api/notifications/[id]/read ───────────────────────────────────────
// Mark a single notification as read — handled in a sub-route file.
// See: app/api/notifications/[id]/read/route.ts (create this separately)

// ── PATCH /api/notifications/read-all ────────────────────────────────────────
// Mark all notifications as read for the user.

async function markAllReadHandler(
  request:     NextRequest,
  context:     SecurityContext
) {
  const userId = context.user.$id

  try {
    const result = await databases.listDocuments(
      DATABASE_ID,
      NOTIFICATIONS_COLLECTION,
      [
        Query.equal("userId", userId),
        Query.equal("read", false),
        Query.limit(50),
      ]
    )

    await Promise.allSettled(
      result.documents.map(doc =>
        databases.updateDocument(
          DATABASE_ID,
          NOTIFICATIONS_COLLECTION,
          doc.$id,
          { read: true }
        )
      )
    )

    return NextResponse.json({ success: true, updated: result.documents.length })
  } catch (err) {
    console.error("[Notifications] mark-all-read failed:", err)
    return NextResponse.json({ success: false }, { status: 500 })
  }
}

export const PATCH = withEnhancedSecurity(markAllReadHandler, {
  allowedMethods: ["PATCH"],
  logAttempts: false,
})