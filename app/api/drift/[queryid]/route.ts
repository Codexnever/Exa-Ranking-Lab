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
  // ✅ Captured outside try/catch so the catch block can log the real
  //    queryid instead of an unresolved Promise (was: console.error(...,
  //    routeParams.params) — logged "[object Promise]" on any error,
  //    since the destructure previously only happened inside the try).
  let queryid = "unknown";

  try {
    const params = await routeParams.params;
    queryid = params.queryid;
    const userId = context.user.$id;

    if (!queryid?.trim()) {
      return NextResponse.json({ error: "Invalid query ID" }, { status: 400 });
    }

    console.log(`[Drift API] Single query analysis for: ${queryid}, user: ${userId}`);

    // ✅ Renamed from `startTime` to `routeStartTime` to make the distinction
    //    explicit: this measures the ENTIRE request (auth + DB fetch +
    //    analysis), not just the drift computation itself.
    const routeStartTime = performance.now();

    const query = await databaseService.queryService.getQuery(queryid);
    if (!query) {
      return NextResponse.json({
        error: "Query not found",
        queryId: queryid
      }, { status: 404 });
    }

    if (query.userId !== userId) {
      console.warn(`[Drift API] Unauthorized access attempt: user ${userId} tried to access query ${queryid} owned by ${query.userId}`);
      return NextResponse.json({
        error: "Access denied - you don't own this query"
      }, { status: 403 });
    }

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
        totalResultsCompared: 0,      // ✅ new field, consistent default
        contentStabilityRate: 0,      // ✅ new field, consistent default
        totalProcessingTime: 0,
        metadata: {
          snapshotsAnalyzed: snapshots.length,
          processingTime: 0,
          timestamp: new Date().toISOString(),
          message: `Insufficient snapshots: found ${snapshots.length}, need at least 2 for drift analysis`
        }
      });
    }

    // analyzeDrift() returns its OWN totalProcessingTime — pure computation
    // time (embedding calls + comparison math), excluding auth/DB latency.
    const driftResult = await analyzeDrift(queryid, query.name, snapshots);

    // ✅ Route-level wall-clock time — includes auth, DB fetch, everything.
    //    Kept SEPARATE from driftResult.totalProcessingTime instead of
    //    overwriting it. Previously: `totalProcessingTime: processingTime`
    //    silently replaced analyzeDrift's own (more precise, narrower)
    //    measurement with this broader one — collapsing two different
    //    timings into one field, which is likely why processing time
    //    appeared to jump ~250x between requests (one reflected a cached
    //    fast-path drift computation alone; the other reflected full
    //    request latency including Appwrite + cold Gemini calls).
    const routeProcessingTime = performance.now() - routeStartTime;

    console.log(
      `[Drift API] Single query analysis completed — ` +
      `drift computation: ${driftResult.totalProcessingTime.toFixed(2)}ms, ` +
      `full request: ${routeProcessingTime.toFixed(2)}ms`
    );

    return NextResponse.json({
      ...driftResult,
      // ✅ driftResult.totalProcessingTime is preserved as-is (drift
      //    computation only). routeProcessingTime is added under its own
      //    field name so the client can show either figure, or both.
      routeProcessingTime,
      metadata: {
        snapshotsAnalyzed: snapshots.length,
        processingTime: routeProcessingTime,
        timestamp: new Date().toISOString(),
        queryId: queryid,
        userId: userId,
      }
    });

  } catch (error) {
    // ✅ Logs the actual queryid string, not an unresolved Promise object.
    console.error(`[Drift API] Failed to analyze drift for query ${queryid}:`, error);
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

export const GET = withEnhancedSecurity(getSingleDriftHandler, {
  rateLimit: {
    windowMs: 60 * 1000,
    maxRequests: 30,
  },
  allowedMethods: ['GET'],
  logAttempts: true,
});