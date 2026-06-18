// app/api/drift/[queryid]/route.ts 
import { type NextRequest, NextResponse } from "next/server";
import { databaseService } from "@/app/services/database/database-service";
import { analyzeDrift } from "@/app/logic/driftAnalyzer";
import { withEnhancedSecurity } from "@/lib/middleware/security/security-middleware";
import { SecurityContext } from "@/types/type";

async function getSingleDriftHandler(
  request: NextRequest, 
  context: SecurityContext,
  routeParams: { params: Promise<{ queryid: string }> }
) {
  try {
    const params = await routeParams.params;
    const queryid = params.queryid;
    const userId = context.user.$id;

    console.log(`[Drift API] Single query analysis for: ${queryid}, user: ${userId}`);
    const startTime = performance.now();

    // Fetch query and verify ownership
    const query = await databaseService.queryService.getQuery(queryid);
    if (!query) {
      return NextResponse.json({ 
        error: "Query not found",
        queryId: queryid
      }, { status: 404 });
    }

    //  Security: Ensure user owns the query
    if (query.userId !== userId) {
      console.warn(`[Drift API] Unauthorized access attempt: user ${userId} tried to access query ${queryid} owned by ${query.userId}`);
      return NextResponse.json({ 
        error: "Access denied - you don't own this query" 
      }, { status: 403 });
    }

    // Fetch snapshots for this specific query
    const snapshots = await databaseService.snapshotService.getSnapshots(queryid, userId);
    console.log(`[Drift API] Found ${snapshots.length} snapshots for query ${queryid}`);

    if (snapshots.length < 2) {
      return NextResponse.json({ 
        queryId: queryid,
        queryName: query.name,
        driftTimeline: [],
        averageDrift: 0,
        maxDrift: 0,
        latestDrift: 0,
        stability: 'stable' as const,
        driftTrend: 'stable' as const,
        totalContentChanges: 0,
        averageCacheHitRate: 0,
        totalProcessingTime: 0,
        metadata: {
          snapshotsAnalyzed: snapshots.length,
          processingTime: 0,
          timestamp: new Date().toISOString(),
          message: `Insufficient snapshots: found ${snapshots.length}, need at least 2 for drift analysis`
        }
      });
    }

    // Perform drift analysis
    const driftResult = await analyzeDrift(queryid, query.name, snapshots);
    const processingTime = performance.now() - startTime;

    console.log(`[Drift API] Single query analysis completed in ${processingTime.toFixed(2)}ms`);

    // ✅ Enhanced response with performance metrics
    return NextResponse.json({
      ...driftResult,
      totalProcessingTime: processingTime,
      metadata: {
        snapshotsAnalyzed: snapshots.length,
        processingTime,
        timestamp: new Date().toISOString(),
        queryId: queryid,
        userId: userId,
      }
    });

  } catch (error) {
    console.error(`[Drift API] Failed to analyze drift for query ${routeParams.params}:`, error);
    return NextResponse.json(
      { 
        error: "Failed to analyze drift for query",
        details: process.env.NODE_ENV === 'development' ? 
          (error instanceof Error ? error.message : "Unknown error") : 
          undefined
      }, 
      { status: 500 }
    );
  }
}

// ✅ Apply security middleware with higher rate limit for single queries
export const GET = withEnhancedSecurity(getSingleDriftHandler, {
  rateLimit: {
    windowMs: 60 * 1000, // 1 minute window  
    maxRequests: 30,     // 30 requests per minute per user (higher for single queries)
  },
  allowedMethods: ['GET'],
  logAttempts: true,
});
