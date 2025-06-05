import { type NextRequest, NextResponse } from "next/server"
import { databaseService } from "@/lib/database-service"
import { ExaClient } from "@/lib/exa-client"

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params
  const { id: queryId } = params
  return await handlePost(request, queryId)
}

async function handlePost(request: NextRequest, queryId: string) {
  const authHeader = request.headers.get("authorization")
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized - Missing JWT" }, { status: 401 })
  }

  const jwt = authHeader.split("Bearer ")[1]
  console.log("This is JWT:", jwt)

  let user
  try {
    // Debug environment variables
    const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID

    if (!projectId) {
      throw new Error("APPWRITE_PROJECT_ID environment variable is not set")
    }
    
    // This is an Appwrite JWT, verify it with Appwrite's API
    const response = await fetch(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT + "/v1/account", {
      method: "GET",
      headers: {
        "X-Appwrite-Project": projectId,
        "Authorization": `Bearer ${jwt}`,
      },
    })
    
    console.log("Appwrite response status:", response.status)
    
    if (!response.ok) {
      const errorText = await response.text()
      console.log("Appwrite error response:", errorText)
      throw new Error(`Appwrite API error: ${response.status} - ${errorText}`)
    }
    
    user = await response.json()
    console.log("✅ JWT verified for user:", user.$id)
  } catch (err) {
    console.error("[JWT Verification Error]", err)
    return NextResponse.json({ error: "Unauthorized - JWT verification failed" }, { status: 401 })
  }

  const query = await databaseService.getQuery(queryId)
  if (!query) {
    return NextResponse.json({ error: "Query not found" }, { status: 404 })
  }

  if (query.userId !== user.$id) {
    return NextResponse.json({ error: "Forbidden - Query not owned by user" }, { status: 403 })
  }

  try {
    const apiKey = process.env.EXA_API_KEY
    if (!apiKey) throw new Error("Missing EXA_API_KEY")

    const exaClient = new ExaClient(apiKey)
    const start = Date.now()

    const exaResults = await exaClient.search({
      query: query.query,
      category: query.category,
      includeDomains: query.filters?.includeDomains,
      excludeDomains: query.filters?.excludeDomains,
      startDate: query.filters?.startDate,
      endDate: query.filters?.endDate,
    })

    const responseTime = (Date.now() - start) / 1000

    const mappedResults = (exaResults.results || []).map((r: any, idx: number) => ({
      id: r.id || `${query.id}_${idx}`,
      position: idx + 1,
      domain: r.domain || (r.url ? new URL(r.url).hostname : ""),
      contentType: r.type || "web",
      title: r.title,
      snippet: r.snippet,
      url: r.url,
      ...r,
    }))

    const snapshot = await databaseService.createSnapshot({
      queryId: query.id,
      userId: user.$id,
      timestamp: new Date(),
      results: mappedResults,
      metadata: {
        responseTime,
        totalResults: mappedResults.length,
      },
    })

    return NextResponse.json({
      success: true,
      snapshot,
      results: mappedResults,
      responseTime,
      totalResults: mappedResults.length,
      timestamp: snapshot.timestamp,
    })
  } catch (err) {
    console.error("[Query Run Error]", err)
    return NextResponse.json(
      { error: "Search failed", details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}