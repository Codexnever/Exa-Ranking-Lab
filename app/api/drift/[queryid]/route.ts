// app/api/drift/[queryid]/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { databaseService } from "@/app/services/database-service";
import { analyzeDrift } from "@/app/logic/driftAnalyzer";
import { getCurrentUser } from "@/app/server/auth";

export async function GET(
  request: NextRequest, 
  context: { params: Promise<{ queryid: string }> }
) {
  try {
    const params = await context.params;
    const queryid = params.queryid;

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log(`[Drift API] Single query analysis for: ${queryid}, user: ${user.$id}`);

    const query = await databaseService.queryService.getQuery(queryid);
    if (!query) {
      return NextResponse.json({ error: "Query not found" }, { status: 404 });
    }

    if (query.userId !== user.$id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const snapshots = await databaseService.snapshotService.getSnapshots(queryid, user.$id);
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
