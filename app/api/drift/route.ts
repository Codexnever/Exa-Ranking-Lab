// app/api/drift/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { databaseService } from "@/app/services/database-service";
import { analyzeDriftForQueries } from "@/app/logic/driftAnalyzer";
import { getCurrentUser } from "@/app/server/auth"; 
;

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const queryid = searchParams.get("queryid") || undefined;

    const queries = await databaseService.queryService.getQueries(user.$id);
    const snapshots = await databaseService.snapshotService.getSnapshots(queryid, user.$id);

    console.log('Drift analysis started for user:', user.$id, queries.length,"snapshots:", snapshots.length);

    const driftResults = await analyzeDriftForQueries(
      queries.map((q) => ({ id: q.id, name: q.name })),
      snapshots,
    );
    
    driftResults.sort((a, b) => b.latestDrift - a.latestDrift);

    return NextResponse.json(driftResults);
  } catch (error) {
    console.error("Failed to analyze drift:", error);
    return NextResponse.json({ error: "Failed to analyze drift" }, { status: 500 });
  }
}