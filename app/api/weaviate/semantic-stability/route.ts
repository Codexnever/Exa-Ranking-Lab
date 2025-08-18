import { NextResponse } from "next/server";
import { calculateSemanticStability } from "@/lib/analytics-calculations";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { queryId, timeSeriesData } = body;
    
    if (!queryId || !Array.isArray(timeSeriesData)) {
      return NextResponse.json(
        { success: false, error: "Missing queryId or timeSeriesData." },
        { status: 400 }
      );
    }

    console.log(`[API] Calculating semantic stability for query: ${queryId}`);
    
    const result = calculateSemanticStability(timeSeriesData);

    return NextResponse.json({ 
      success: true, 
      ...result
    });
    
  } catch (error) {
    console.error("[API] Semantic stability calculation failed:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Internal error." 
      },
      { status: 500 }
    );
  }
}
