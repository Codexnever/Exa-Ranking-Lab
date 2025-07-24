// app/api/drift/[queryid]/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { databaseService } from "@/app/services/database-service";
import { analyzeDrift } from "@/app/logic/driftAnalyzer";
import { getCurrentUser } from "@/app/server/auth"; 


export async function GET(request: NextRequest, context: { params: { queryid: string } }) {
  try {
     const { params } = context;
  const queryid = params.queryid;

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const query = await databaseService.queryService.getQuery(queryid);
    console.log('Drift analysis started for query:', queryid, 'by user:', user.$id);
    if (!query) {
      return NextResponse.json({ error: "Query not found" }, { status: 404 });
    }

    const snapshots = await databaseService.snapshotService.getSnapshots(queryid, user.$id);
    if (snapshots.length < 2) {
      return NextResponse.json({ error: "Not enough snapshots to analyze drift" }, { status: 400 });
    }

    const driftResult = await analyzeDrift(queryid, query.name, snapshots);

    return NextResponse.json(driftResult);
  } catch (error) {
    console.error("Failed to analyze drift for query:", error);
    return NextResponse.json({ error: "Failed to analyze drift for query" }, { status: 500 });
  }
}