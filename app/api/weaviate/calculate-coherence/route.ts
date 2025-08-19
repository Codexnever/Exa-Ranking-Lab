// /app/api/weaviate/calculate-coherance
import { NextResponse } from "next/server";
import { calculateUMassCoherence } from "@/lib/analytics-calculations";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { queryId, documents, method = "umass" } = body;
    
    if (!queryId || !Array.isArray(documents)) {
      return NextResponse.json(
        { success: false, error: "Missing queryId or documents array." },
        { status: 400 }
      );
    }

    console.log(`[API] Calculating content coherence for query: ${queryId}`);
    
    const result = calculateUMassCoherence(documents, method);

    return NextResponse.json({ 
      success: true, 
      ...result
    });
    
  } catch (error) {
    console.error("[API] Content coherence calculation failed:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Internal error." 
      },
      { status: 500 }
    );
  }
}
