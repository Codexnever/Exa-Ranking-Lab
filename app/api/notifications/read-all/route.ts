import { type NextRequest, NextResponse } from "next/server"
import { Query } from "node-appwrite"
import { databases, DATABASE_ID } from "@/app/server/appwrite/appwrite-server"
import { withEnhancedSecurity } from "@/lib/middleware/security/security-middleware"
import { getNotificationsCollectionId } from "@/lib/services/notification-config"
import type { SecurityContext } from "@/types/type"

const PAGE_SIZE = 100

export async function markAllNotificationsReadHandler(_request: NextRequest, context: SecurityContext) {
  try {
    const collectionId = getNotificationsCollectionId()
    let updated = 0
    let failed = 0
    while (true) {
      const page = await databases.listDocuments(DATABASE_ID, collectionId, [
        Query.equal("userId", context.user.$id), Query.equal("read", false), Query.limit(PAGE_SIZE),
      ])
      if (page.documents.length === 0) break
      const results = await Promise.allSettled(page.documents.map((document) =>
        databases.updateDocument(DATABASE_ID, collectionId, document.$id, { read: true }),
      ))
      updated += results.filter((result) => result.status === "fulfilled").length
      failed += results.filter((result) => result.status === "rejected").length
      if (failed > 0 || page.documents.length < PAGE_SIZE) break
    }
    if (failed > 0) {
      return NextResponse.json(
        { success: false, updated, failed, error: "Some notifications could not be updated" },
        { status: 503 },
      )
    }
    return NextResponse.json({ success: true, updated, failed: 0 })
  } catch (error) {
    console.error("[Notifications] mark-all-read failed:", error)
    return NextResponse.json({ error: "Unable to update notifications" }, { status: 503 })
  }
}

export const PATCH = withEnhancedSecurity(markAllNotificationsReadHandler, { allowedMethods: ["PATCH"], logAttempts: false })
