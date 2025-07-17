// api/drift/[queryid]/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { databaseService } from "@/app/services/database-service";
import { analyzeDrift } from "@/app/logic/driftAnalyzer"; // Updated import (server-side file)

export async function GET(request: NextRequest, { params }: { params: { queryid: string } }) {
  try {
    const { queryid } = params; 

    // Get query and its snapshots
    const query = await databaseService.queryService.getQuery(queryid);
    if (!query) {
      return NextResponse.json({ error: "Query not found" }, { status: 404 });
    }

    const snapshots = await databaseService.snapshotService.getSnapshots(queryid);
    if (snapshots.length < 2) {
      return NextResponse.json({ error: "Not enough snapshots to analyze drift" }, { status: 400 });
    }

    // Analyze drift for the query
    const driftResult = analyzeDrift(queryid, query.name, snapshots);

    return NextResponse.json(driftResult);
  } catch (error) {
    console.error("Failed to analyze drift for query:", error);
    return NextResponse.json({ error: "Failed to analyze drift for query" }, { status: 500 });
  }
}
