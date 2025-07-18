// app/api/analytics/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { AnalyticsService } from "@/app/services/analytics-service";
import { getCurrentUser } from "@/app/server/auth";
import { calculateTimeRangeMs } from "@/app/logic/analyticsLogic"; // Helper from logic (assuming it's exported)

const analyticsService = new AnalyticsService(false); // API mode

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const paramtimeRange = searchParams.get("timeRange") || "30d"; // Default
  const timeRangeMs = calculateTimeRangeMs(paramtimeRange); // ✅ Compute number

  try {
    const analytics = await analyticsService.getAnalytics(user.$id, timeRangeMs); // Pass number (fixed type)
    return NextResponse.json(analytics);
  } catch (error) {
    console.error("❌ Failed to fetch analytics:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch analytics",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
