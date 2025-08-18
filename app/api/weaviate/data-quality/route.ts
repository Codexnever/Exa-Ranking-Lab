import { NextResponse } from "next/server";
import { AppwriteAnalyticsService } from "@/app/services/AppwriteAnalyticsService";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("userId");
    
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Missing userId." },
        { status: 400 }
      );
    }

    console.log(`[API] Assessing data quality for user: ${userId}`);
    
    // Use your analytics service to assess data quality
    const analyticsService = new AppwriteAnalyticsService(false);
    const analytics = await analyticsService.getAnalytics(userId);
    
    // Extract data quality metrics from your analytics
    const dataQuality = analytics.dataQuality || {
      completeness: 0,
      accuracy: 0,
      consistency: 0,
      freshness: 0,
      validity: 0,
      anomalyCount: 0,
      assessedAt: Date.now()
    };

    return NextResponse.json({
      success: true,
      ...dataQuality
    });
    
  } catch (error) {
    console.error("[API] Data quality assessment failed:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Internal error." 
      },
      { status: 500 }
    );
  }
}
