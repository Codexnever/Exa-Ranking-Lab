// Update your /api/run-scheduled-queries/route.ts to use the store methods:
import { NextResponse } from "next/server"
import { useQueriesStore } from "@/app/store" // Import your store

export async function GET() {
  try {
    // Get the store instance
    const store = useQueriesStore.getState();
    
    // Get due queries using your new method
    const dueQueries = await store.getDueQueries();
    
    console.log(`[Scheduler] Found ${dueQueries.length} due queries`);

    if (dueQueries.length === 0) {
      return NextResponse.json({ 
        ran: 0, 
        results: [], 
        message: "No queries due for execution" 
      });
    }

    // Use your store's batchRunQueries method
    const results = await store.batchRunQueries(dueQueries.map(q => q.id));
    
    return NextResponse.json({ 
      ran: results.length, 
      results,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Scheduler] Failed to run scheduled queries:', error);
    return NextResponse.json({ 
      error: "Failed to run scheduled queries",
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
