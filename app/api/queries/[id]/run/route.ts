// app/api/queries/[id]/run/route.ts
import { type NextRequest, NextResponse } from "next/server"
import { databaseService } from "@/app/services/database-service"
import { ExaClient } from "@/app/server/exa-client"
import { getCurrentUser } from "@/app/server/auth"
import { databases, DATABASE_ID, COLLECTIONS } from "@/app/server/appwrite"
import { Query } from "appwrite"

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params
  const { id: queryId } = params
  
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized - JWT verification failed" }, { status: 401 })
  }

  const query = await databaseService.queryService.getQuery(queryId)
  if (!query || query.userId !== user.$id) {
    return NextResponse.json({ error: "Query not found or forbidden" }, { status: 404 })
  }

  try {
    // Get user's API key
    const settingsRes = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.SETTINGS,
      [Query.equal("userId", user.$id)]
    )
    const apiKey = settingsRes.documents[0]?.apiKey
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing API key. Please add your API key in settings." },
        { status: 400 }
      )
    }

    // Execute search
    const exaClient = new ExaClient(apiKey)
    const start = Date.now()
    
    const exaResults = await exaClient.search({
      query: query.query,
      category: query.category,
      includeDomains: query.filters?.includeDomains,
      excludeDomains: query.filters?.excludeDomains,
      startDate: query.filters?.startDate,
      endDate: query.filters?.endDate,
      numResults: query.filters?.numResults,
    })

    const responseTime = (Date.now() - start)

    // Map results
    const mappedResults = (exaResults.results || []).map((r: any, idx: number) => ({
      id: r.id || `${query.id}_${idx}`,
      position: idx + 1,
      domain: r.domain || (r.url ? new URL(r.url).hostname : ""),
      contentType: r.type || "auto",//Here later we want to add use can select content type
      title: r.title,
      snippet: r.snippet,
      url: r.url,
      timestamp: new Date(),
      ...r,
    }))

    // ✅ CREATE SNAPSHOT (This was missing!)
    const snapshot = await databaseService.snapshotService.createSnapshot({
      queryId: query.id,
      userId: user.$id,
      results: mappedResults,
      metadata: {
        totalResults: mappedResults.length,
        responseTime
      },
      timestamp: new Date()
    })

    // ✅ Update query's lastRun timestamp
    await databaseService.queryService.updateQuery(query.id, {
      lastRun: new Date()
    })

    return NextResponse.json({
      success: true,
      results: mappedResults,
      responseTime,
      totalResults: mappedResults.length,
      timestamp: new Date(),
      snapshotId: snapshot.id, // ✅ Return snapshot info
    })

  } catch (err) {
    console.error("[Query Run Error]", err)
    return NextResponse.json(
      { error: "Search failed", details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
