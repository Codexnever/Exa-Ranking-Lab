import { NextRequest, NextResponse } from "next/server"
import { DATABASE_ID, COLLECTIONS } from "@/app/server/appwrite"
import { databases } from "@/app/server/appwrite"
import { getCurrentUser } from "@/app/server/auth"; 

import { ID, Query } from "appwrite"

// GET: Get current user's settings (API key, status, lastTested)
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const res = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.SETTINGS,
      [
        Query.equal("userId", user.$id)
      ]
    )
    const doc = res.documents[0]
    if (!doc) return NextResponse.json({ apiKey: "", apiStatus: "unknown", lastTested: null })
    return NextResponse.json({ apiKey: doc.apiKey, apiStatus: doc.apiStatus, lastTested: doc.lastTested })
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 })
  }
}

// POST: Update current user's settings (API key, status, lastTested)
export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const { apiKey, apiStatus, lastTested } = await request.json()
    // Find existing settings doc
    const res = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.SETTINGS,
      [
        Query.equal("userId", user.$id)
      ]
    )
    console.log("Checking Documents:", res.documents)//That to Debug
    let doc = res.documents[0]
    if (doc) {
      await databases.updateDocument(
        DATABASE_ID,
        COLLECTIONS.SETTINGS,
        doc.$id,
        { apiKey, apiStatus, lastTested }
      )
    } else {
      await databases.createDocument(
        DATABASE_ID,
        COLLECTIONS.SETTINGS,
        ID.unique(), // generate a unique document ID
        { userId: user.$id, apiKey, apiStatus, lastTested }
      )
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Settings API] Failed to update settings:", error)
    return NextResponse.json({ error: "Failed to update settings", details: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
