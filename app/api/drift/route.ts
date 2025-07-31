// app/api/drift/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { databaseService } from "@/app/services/database-service";
import { analyzeDriftForQueries } from "@/app/logic/driftAnalyzer";
import { getCurrentUser } from "@/app/server/auth";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const queryid = searchParams.get("queryid") || undefined;
    const forceRefresh = searchParams.get("refresh") === "true";

    console.log(`[Drift API] Starting analysis for user: ${user.$id}, forceRefresh: ${forceRefresh}`);

    const queries = await databaseService.queryService.getQueries(user.$id);
    const snapshots = await databaseService.snapshotService.getSnapshots(queryid, user.$id);

    console.log(`[Drift API] Found ${queries.length} queries, ${snapshots.length} snapshots`);

    // ✅ Enhanced drift analysis with performance metrics
    const startTime = performance.now();
    const driftResults = await analyzeDriftForQueries(
      queries.map((q) => ({ id: q.id, name: q.name })),
      snapshots,
    );
    const totalProcessingTime = performance.now() - startTime;

    // Sort by latest drift score
    driftResults.sort((a, b) => b.latestDrift - a.latestDrift);

    console.log(`[Drift API] Analysis completed in ${totalProcessingTime.toFixed(2)}ms`);

    return NextResponse.json({
      results: driftResults,
      metadata: {
        totalQueries: queries.length,
        totalSnapshots: snapshots.length,
        processingTime: totalProcessingTime,
        timestamp: new Date().toISOString(),
      }
    });
  } catch (error) {
    console.error("Failed to analyze drift:", error);
    return NextResponse.json(
      { 
        error: "Failed to analyze drift",
        details: error instanceof Error ? error.message : "Unknown error"
      }, 
      { status: 500 }
    );
  }
}
