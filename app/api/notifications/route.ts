import { type NextRequest, NextResponse } from "next/server"
import { Query } from "node-appwrite"
import { databases, DATABASE_ID } from "@/app/server/appwrite/appwrite-server"
import { withEnhancedSecurity } from "@/lib/middleware/security/security-middleware"
import { getNotificationsCollectionId } from "@/lib/services/notification-config"
import type { SecurityContext } from "@/types/type"

export async function getNotificationsHandler(_request: NextRequest, context: SecurityContext) {
  try {
    const result = await databases.listDocuments(DATABASE_ID, getNotificationsCollectionId(), [
      Query.equal("userId", context.user.$id),
      Query.orderDesc("createdAt"),
      Query.limit(20),
    ])
    return NextResponse.json(result.documents)
  } catch (error) {
    console.error("[Notifications] GET failed:", error)
    return NextResponse.json(
      { error: "Notification service is temporarily unavailable" },
      { status: 503 },
    )
  }
}

export const GET = withEnhancedSecurity(getNotificationsHandler, { allowedMethods: ["GET"], logAttempts: false })
