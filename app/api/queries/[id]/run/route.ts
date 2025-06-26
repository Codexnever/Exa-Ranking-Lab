import { type NextRequest, NextResponse } from "next/server"
import { databaseService } from "@/lib/database-service"
import { ExaClient } from "@/lib/exa-client"
import { getCurrentUser } from "@/lib/auth"

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params
  const { id: queryId } = params
  return await handlePost(request, queryId)
}

async function handlePost(request: NextRequest, queryId: string) {
  // Use getCurrentUser to verify JWT and get user
  const user = await getCurrentUser(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized - JWT verification failed" }, { status: 401 })
  }

  const query = await databaseService.queryService.getQuery(queryId)
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
      numResults: query.filters?.numResults,
    })
    // console.log("[Exa Search Results]", exaResults)

    const responseTime = (Date.now() - start)

    const mappedResults = (exaResults.results || []).map((r: any, idx: number) => ({
      id: r.id || `${query.id}_${idx}`,
      position: idx + 1,
      domain: r.domain || (r.url ? new URL(r.url).hostname : ""),
      contentType: r.type || "auto",
      title: r.title,
      snippet: r.snippet,
      url: r.url,
      ...r,
    }))
    // console.log('mapped result contentType', mappedResults.map(r => r.contentType))
    return NextResponse.json({
      success: true,
      results: mappedResults,
      responseTime,
      totalResults: mappedResults.length,
      timestamp: new Date(),
    })
  } catch (err) {
    console.error("[Query Run Error]", err)
    return NextResponse.json(
      { error: "Search failed", details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}