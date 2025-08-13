import { NextResponse } from "next/server";
import { WeaviateService } from "@/app/services/weaviate-service";
import { WeaviateAnalyticsService } from "@/app/services/weaviate-analytics-service";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const timeRange = searchParams.get("timeRange") || "30d";

    if (!userId) {
      return NextResponse.json({ error: "Missing userId parameter" }, { status: 400 });
    }

    // Calculate time range in milliseconds
    const ranges: Record<string, number> = {
      "7d": 7 * 24 * 60 * 60 * 1000,
      "30d": 30 * 24 * 60 * 60 * 1000,
      "90d": 90 * 24 * 60 * 60 * 1000,
      "1y": 365 * 24 * 60 * 60 * 1000,
    };
    const timeRangeMs = ranges[timeRange] || ranges["30d"];

    // Initialize services
    const weaviateService = new WeaviateService();
    const analyticsService = new WeaviateAnalyticsService(false, weaviateService);

    // Get semantic analytics data
    const data = await analyticsService.getSemanticAnalyticsMerged(userId, timeRangeMs);

    return NextResponse.json({
      success: true,
      data,
      timeRange,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("[API] /weaviate/semantic-analytics error:", error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : "Internal server error",
        success: false 
      }, 
      { status: 500 }
    );
  }
}
