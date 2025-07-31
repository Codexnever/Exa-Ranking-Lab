import { type NextRequest, NextResponse } from "next/server"
import { databaseService } from "@/app/services/database-service"
import { ExaClient } from "@/app/server/exa-client"
import { getCurrentUser } from "@/app/server/auth"
import { databases, DATABASE_ID, COLLECTIONS } from "@/app/server/appwrite"
import { Query } from "appwrite"
import { createHash } from "crypto"

// ✅ Track active executions to prevent double-calling
const activeExecutions = new Map<string, { timestamp: number; promise: Promise<any> }>()

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params
  const { id: queryId } = params
  
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized - JWT verification failed" }, { status: 401 })
  }

  // ✅ Create execution key to prevent concurrent runs
  const executionKey = `${user.$id}-${queryId}`
  
  // ✅ Check if query is already running
  const activeExecution = activeExecutions.get(executionKey)
  if (activeExecution && Date.now() - activeExecution.timestamp < 30000) {
    console.log(`[Query Run] Query already running, waiting for existing execution: ${queryId}`)
    try {
      return await activeExecution.promise
    } catch (error) {
      // If waiting execution failed, continue with new execution
      activeExecutions.delete(executionKey)
    }
  }

  console.log(`[Query Run] Starting execution for query: ${queryId}`)

  const query = await databaseService.queryService.getQuery(queryId)
  if (!query || query.userId !== user.$id) {
    return NextResponse.json({ error: "Query not found or forbidden" }, { status: 404 })
  }

  // ✅ Create execution promise and track it
  const executionPromise = executeQuery(user, query, queryId)
  activeExecutions.set(executionKey, {
    timestamp: Date.now(),
    promise: executionPromise
  })

  try {
    const result = await executionPromise
    return result
  } finally {
    // ✅ Clean up execution tracking
    activeExecutions.delete(executionKey)
  }
}

async function executeQuery(user: any, query: any, queryId: string) {
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
    
    console.log(`[Query Run] Executing Exa search for query: ${queryId}`)
    
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

    // ✅ Enhanced result mapping with content hash
    const mappedResults = (exaResults.results || []).map((r: any, idx: number) => {
      const title = r.title || ''
      const snippet = r.snippet || r.summary || ''
      const url = r.url || ''
      
      // Generate content hash for drift analysis
      const contentHash = createHash('sha256')
        .update(`${title}|${snippet}|${url}`, 'utf8')
        .digest('hex')

      return {
        id: r.id || `${query.id}_${idx}`,
        position: idx + 1,
        domain: r.domain || (url ? new URL(url).hostname : ""),
        contentType: r.type || "auto",
        title,
        snippet,
        url,
        contentHash, // ✅ Add content hash for drift analysis
        timestamp: new Date(),
        ...r,
      }
    })

    console.log(`[Query Run] Creating snapshot for query: ${queryId} with ${mappedResults.length} results`)

    // ✅ CREATE SNAPSHOT with enhanced metadata and deduplication
    const snapshot = await databaseService.snapshotService.createSnapshot({
      queryId: query.id,
      userId: user.$id,
      results: mappedResults,
      metadata: {
        totalResults: mappedResults.length,
        responseTime,
        executedAt: new Date().toISOString(),
        executionType: 'manual', // Track execution type
        source: 'query_run_api' // Track which API created this
      },
      timestamp: new Date()
    })

    console.log(`[Query Run] Snapshot handling completed: ${snapshot.id}`)

    // ✅ Update query's lastRun timestamp
    await databaseService.queryService.updateQuery(query.id, {
      lastRun: new Date()
    })

    const response = {
      success: true,
      results: mappedResults,
      responseTime,
      totalResults: mappedResults.length,
      timestamp: new Date(),
      snapshotId: snapshot.id,
      source: 'query_run_api', // ✅ Track source
    }

    console.log(`[Query Run] Query execution completed successfully: ${queryId}`)
    return NextResponse.json(response)

  } catch (err) {
    console.error(`[Query Run Error] Query: ${queryId}`, err)
    return NextResponse.json(
      { error: "Search failed", details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
