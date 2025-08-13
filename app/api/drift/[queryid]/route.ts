// app/api/drift/[queryid]/route.ts - Updated with security
import { type NextRequest, NextResponse } from "next/server";
import { databaseService } from "@/app/services/database-service";
import { analyzeDrift } from "@/app/logic/driftAnalyzer";
import { withEnhancedSecurity } from "@/lib/middleware/security-middleware";
import { SecurityContext } from "@/lib/type";

async function getDriftHandler(
  request: NextRequest, 
  context: SecurityContext,
  routeParams: { params: Promise<{ queryid: string }> }
) {
  try {
    const params = await routeParams.params;
    const queryid = params.queryid;

    console.log(`[Drift API] Single query analysis for: ${queryid}, user: ${context.user.$id}`);

    const query = await databaseService.queryService.getQuery(queryid);
    if (!query) {
      return NextResponse.json({ error: "Query not found" }, { status: 404 });
    }

    if (query.userId !== context.user.$id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const snapshots = await databaseService.snapshotService.getSnapshots(queryid, context.user.$id);
    if (snapshots.length < 2) {
      return NextResponse.json({ 
        error: "Not enough snapshots to analyze drift",
        details: `Found ${snapshots.length} snapshots, need at least 2`
      }, { status: 400 });
    }

    const startTime = performance.now();
    const driftResult = await analyzeDrift(queryid, query.name, snapshots);
    const processingTime = performance.now() - startTime;

    console.log(`[Drift API] Single query analysis completed in ${processingTime.toFixed(2)}ms`);

    return NextResponse.json({
      ...driftResult,
      metadata: {
        snapshotsAnalyzed: snapshots.length,
        processingTime,
        timestamp: new Date().toISOString(),
      }
    });
  } catch (error) {
    console.error("Failed to analyze drift for query:", error);
    return NextResponse.json(
      { 
        error: "Failed to analyze drift for query",
        details: error instanceof Error ? error.message : "Unknown error"
      }, 
      { status: 500 }
    );
  }
}

// ✅ ADD: Apply security middleware
export const GET = withEnhancedSecurity(getDriftHandler, {
  allowedMethods: ['GET'],
  rateLimit: {
    maxRequests: 10,
    windowMs: 60000 // 1 minute
  },
  logAttempts: true
});
