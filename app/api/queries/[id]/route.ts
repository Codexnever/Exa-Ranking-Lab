import { type NextRequest, NextResponse } from "next/server"
import { databaseService } from "@/app/services/database-service"
import { getCurrentUser } from "@/app/server/auth"; 


export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const query = await databaseService.queryService.getQuery(id)
    if (!query || query.userId !== user.$id) {
      return NextResponse.json({ error: "Query not found or forbidden" }, { status: 404 })
    }

    return NextResponse.json(query)
  } catch (error) {
    console.error("❌ Failed to fetch query:", error)
    return NextResponse.json({ error: "Failed to fetch query" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  const user = await getCurrentUser();
  if (!user) {
    console.warn("[PATCH] Unauthorized: No user found from JWT cookie.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const query = await databaseService.queryService.getQuery(id)
    if (!query || query.userId !== user.$id) {
      return NextResponse.json({ error: "Query not found or forbidden" }, { status: 404 })
    }

    const body = await request.json()
    const updated = await databaseService.queryService.updateQuery(id, body)
    return NextResponse.json(updated)
  } catch (error) {
    console.error("❌ Failed to update query:", error)
    return NextResponse.json({ error: "Failed to update query" }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id: queryId } = params;
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const query = await databaseService.queryService.getQuery(queryId);
    if (!query || query.userId !== user.$id) {
      return NextResponse.json({ error: "Query not found or forbidden" }, { status: 404 });
    }

    const ip = request.headers.get("x-real-ip") || "unknown";
    const uaRaw = request.headers.get("x-user-agent") || "{}";
    const userAgent = JSON.parse(uaRaw);
    const success = await databaseService.queryService.deleteQuery(queryId, {
      userId: user.$id,
      ipAddress: ip,
      userAgent,
    });

    if (!success) {
      return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
    }

    // Access log
    await databaseService.accessLogService.logAccess(
      user.$id,
      "delete_query",
      { query },
      ip,
      userAgent
    )

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("❌ Failed to delete query:", error);
    return NextResponse.json({ error: "Failed to delete query" }, { status: 500 });
  }
}

