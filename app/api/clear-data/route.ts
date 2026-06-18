// app/api/clear-data/route.ts

import { type NextRequest, NextResponse } from "next/server"
import { databases, DATABASE_ID, COLLECTIONS } from "@/app/server/appwrite/appwrite"
import { Query } from "appwrite"
import { getCurrentUser } from "@/lib/middleware/authentication/auth"; 


export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const userId = user.$id
    const collections = [
      COLLECTIONS.QUERIES,
      COLLECTIONS.SNAPSHOTS,
      COLLECTIONS.FEEDBACK,
      COLLECTIONS.ACCESS_LOGS,
    ]

    for (const collectionId of collections) {
      try {
        const response = await databases.listDocuments(DATABASE_ID, collectionId, [
          Query.equal("userId", userId),
        ])

        for (const doc of response.documents) {
          await databases.deleteDocument(DATABASE_ID, collectionId, doc.$id)
        }
      } catch (error) {
        console.error(`❌ Failed to clear collection ${collectionId}:`, error)
      }
    }

    return NextResponse.json({
      success: true,
      message: "✅ All data cleared successfully",
    })
  } catch (error) {
    console.error("❌ Clear data failed:", error)
    return NextResponse.json({ error: "Failed to clear data" }, { status: 500 })
  }
}
// This endpoint clears all user data including queries, snapshots, feedback, and access logs.