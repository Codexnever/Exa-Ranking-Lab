import { type NextRequest, NextResponse } from "next/server"
import { databases, DATABASE_ID } from "@/app/server/appwrite/appwrite-server"
import { withEnhancedSecurity } from "@/lib/middleware/security/security-middleware"
import { getNotificationsCollectionId } from "@/lib/services/notification-config"
import type { SecurityContext } from "@/types/type"

function appwriteCode(error: unknown): number | null {
  return error && typeof error === "object" && "code" in error
    ? Number((error as { code?: unknown }).code)
    : null
}

export async function markNotificationReadHandler(
  _request: NextRequest,
  context: SecurityContext,
  route: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await route.params
    const collectionId = getNotificationsCollectionId()
    const notification = await databases.getDocument(DATABASE_ID, collectionId, id)
    if (notification.userId !== context.user.$id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    return NextResponse.json(await databases.updateDocument(
      DATABASE_ID, collectionId, id, { read: true },
    ))
  } catch (error) {
    if (appwriteCode(error) === 404) {
      return NextResponse.json({ error: "Notification not found" }, { status: 404 })
    }
    console.error("[Notifications] mark-one-read failed:", error)
    return NextResponse.json({ error: "Unable to update notification" }, { status: 503 })
  }
}

export const PATCH = withEnhancedSecurity(markNotificationReadHandler, { allowedMethods: ["PATCH"], logAttempts: false })
