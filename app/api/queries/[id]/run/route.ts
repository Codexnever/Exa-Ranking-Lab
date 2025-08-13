// app/api/queries/[id]/run/route.ts
import { type NextRequest, NextResponse } from "next/server"
import { databaseService } from "@/app/services/database-service"
import { ExaClient } from "@/app/server/exa-client"
import { withEnhancedSecurity } from "@/lib/middleware/security-middleware"
import { getCurrentUser } from "@/app/server/auth"
import { databases, DATABASE_ID, COLLECTIONS } from "@/app/server/appwrite"
import { Query } from "appwrite"
import { createHash } from "crypto"
import { SecurityContext } from "@/lib/type"
import { WeaviateService } from "@/app/services/weaviate-service";
const weaviateService = new WeaviateService();

// Track active executions to prevent duplicate calls
const activeExecutions = new Map<string, { timestamp: number; promise: Promise<any> }>()

export const POST = withEnhancedSecurity(
  async (request: NextRequest, context: SecurityContext, routeParams: { params: Promise<{ id: string }> }) => {
    const params = await routeParams.params
    const { id: queryId } = params

    // Enhanced validation for query ID
    if (!queryId || typeof queryId !== 'string') {
      return NextResponse.json({ error: "Invalid query ID" }, { status: 400 })
    }

    const executionKey = `${context.user.$id}-${queryId}`
    
    // Check for concurrent execution
    const existingExecution = activeExecutions.get(executionKey)
    if (existingExecution && Date.now() - existingExecution.timestamp < 30000) {
      console.log(`[Query Run] Query already running: ${queryId}`)
      try {
        return await existingExecution.promise
      } catch (error) {
        activeExecutions.delete(executionKey)
      }
    }

    console.log(`[Query Run] Starting execution for query: ${queryId}`)

    // Validate query ownership
    const query = await databaseService.queryService.getQuery(queryId)
    if (!query || query.userId !== context.user.$id) {
      return NextResponse.json({ error: "Query not found or access denied" }, { status: 404 })
    }

    // Create and track execution promise
    const executionPromise = executeQuery(context.user, query, queryId)
    activeExecutions.set(executionKey, {
      timestamp: Date.now(),
      promise: executionPromise
    })

    try {
      const result = await executionPromise
      return result
    } finally {
      activeExecutions.delete(executionKey)
    }
  },
  {
    rateLimit: {
      maxRequests: 10,
      windowMs: 60 * 1000, // 10 requests per minute
      onLimitReached: (userId, endpoint) => {
        console.warn(`[RateLimit] User ${userId} exceeded query execution limit`)
      }
    },
    allowedMethods: ['POST'],
    logAttempts: true
  }
)

async function executeQuery(user: any, query: any, queryId: string): Promise<NextResponse> {
  try {
    // Safely access query filters
    const filters = query.filters || {}

    // Get user's API key with enhanced error handling
    const settingsRes = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.SETTINGS,
      [Query.equal("userId", user.$id)]
    )
    
    const apiKey = settingsRes?.documents?.[0]?.apiKey
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing API key. Please add your API key in settings." },
        { status: 400 }
      )
    }

    // Execute search with performance tracking
    const exaClient = new ExaClient(apiKey)
    const startTime = Date.now()
    
    console.log(`[Query Run] Executing Exa search for query: ${queryId}`)
    
    const exaResults = await exaClient.search({
      query: query.query,
      category: query.category,
      includeDomains: filters.includeDomains,
      excludeDomains: filters.excludeDomains,
      startDate: filters.startDate,
      endDate: filters.endDate,
      numResults: filters.numResults,
    })

    const responseTime = Date.now() - startTime

    // Enhanced result mapping with error handling
    const mappedResults = (exaResults?.results || []).map((r: any, idx: number) => {
      const title = r.title || ''
      const snippet = r.snippet || r.summary || ''
      const url = r.url || ''
      
      // Safe domain extraction
      let domain = r.domain || ''
      if (!domain && url) {
        try {
          domain = new URL(url).hostname || ''
        } catch {
          domain = '' // Fallback for malformed URLs
        }
      }
      
      // Generate content hash for drift analysis
      const contentHash = createHash('sha256')
        .update(`${title}|${snippet}|${url}`, 'utf8')
        .digest('hex')

      return {
        id: r.id || `${query.id}_${idx}`,
        position: idx + 1,
        domain,
        contentType: r.type || "auto",
        title,
        snippet,
        url,
        contentHash,
        timestamp: new Date(),
        ...r,
      }
    })

    console.log(`[Query Run] Creating snapshot for query: ${queryId} with ${mappedResults.length} results`)

    // Create snapshot with enhanced metadata
    const snapshot = await databaseService.snapshotService.createSnapshot({
      queryId: query.id,
      userId: user.$id,
      results: mappedResults,
      metadata: {
        totalResults: mappedResults.length,
        responseTime,
        executedAt: new Date().toISOString(),
        executionType: 'manual',
        source: 'query_run_api'
      },
      timestamp: new Date()
      
    })
    console.log(`[Query Run] Snapshot created successfully: ${snapshot.id}`)
  // after snapshot creation
try {
  const weaviate = new WeaviateService();
  await weaviate.initialize();
  await weaviate.syncSnapshot(snapshot);
  console.log(`[Query Run] Snapshot synced to Weaviate: ${snapshot.id}`);
} catch (e) {
  console.error("[Query Run] Weaviate sync failed", e);
}


    // Update query's lastRun timestamp
    await databaseService.queryService.updateQuery(query.id, {
      lastRun: new Date()
    })

    // Return enhanced response
    return NextResponse.json({
      success: true,
      results: mappedResults,
      responseTime,
      totalResults: mappedResults.length,
      timestamp: new Date(),
      snapshotId: snapshot.id,
      source: 'query_run_api',
      executionContext: {
        userId: user.$id,
        executedAt: new Date().toISOString(),
        queryType: 'manual'
      }
    })

  } catch (err) {
    console.error(`[Query Run Error] Query: ${queryId}`, err)
    return NextResponse.json(
      { 
        error: "Search execution failed", 
        details: err instanceof Error ? err.message : String(err) 
      },
      { status: 500 }
    )
  }
}
