// app/api/drift/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { databaseService } from "@/app/services/database/database-service";
import { analyzeDriftForQueries } from "@/app/logic/driftAnalyzer";
import { withEnhancedSecurity } from "@/lib/middleware/security/security-middleware";
import { SecurityContext } from "@/types/type";

async function getDriftHandler(request: NextRequest, context: SecurityContext) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const queryid = searchParams.get("queryid") || undefined;
    const forceRefresh = searchParams.get("refresh") === "true";
    const userId = context.user.$id; 

    console.log(`[Drift API] Starting analysis for user: ${userId}, forceRefresh: ${forceRefresh}`);
    const startTime = performance.now();

    // Fetch queries and snapshots for the authenticated user
    const [queries, snapshots] = await Promise.all([
      databaseService.queryService.getQueries(userId),
      databaseService.snapshotService.getSnapshots(queryid, userId)
    ]);

    console.log(`[Drift API] Found ${queries.length} queries, ${snapshots.length} snapshots`);

    if (queries.length === 0) {
      return NextResponse.json({
        results: [],
        metadata: {
          totalQueries: 0,
          totalSnapshots: snapshots.length,
          processingTime: 0,
          timestamp: new Date().toISOString(),
          message: "No queries found for analysis"
        }
      });
    }

    // ✅ Enhanced drift analysis with performance metrics
    const driftResults = await analyzeDriftForQueries(
      queries.map((q) => ({ id: q.id, name: q.name })),
      snapshots,
    );
    const totalProcessingTime = performance.now() - startTime;

    // Sort by latest drift score (highest drift first)
    driftResults.sort((a, b) => (b.latestDrift || 0) - (a.latestDrift || 0));

    console.log(`[Drift API] Analysis completed in ${totalProcessingTime.toFixed(2)}ms`);

    return NextResponse.json({
      results: driftResults,
      metadata: {
        totalQueries: queries.length,
        totalSnapshots: snapshots.length,
        processingTime: totalProcessingTime,
        timestamp: new Date().toISOString(),
        userId: userId, // Include for debugging
      }
    });

  } catch (error) {
    console.error("[Drift API] Failed to analyze drift:", error);
    return NextResponse.json(
      { 
        error: "Failed to analyze drift",
        details: process.env.NODE_ENV === 'development' ? 
          (error instanceof Error ? error.message : "Unknown error") : 
          undefined
      }, 
      { status: 500 }
    );
  }
}

// ✅ Apply security middleware with appropriate rate limiting
export const GET = withEnhancedSecurity(getDriftHandler, {
  rateLimit: {
    windowMs: 60 * 1000, // 1 minute window
    maxRequests: 15,     // 15 requests per minute per user
  },
  allowedMethods: ['GET'],
  logAttempts: true,
});
