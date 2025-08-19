// app/api/weaviate/sync/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { databases, DATABASE_ID, COLLECTIONS } from '@/app/server/appwrite';
import { Query } from 'appwrite';
import { WeaviateService } from '@/app/services/weaviate-service'; // ✅ Add this import

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const body = await request.json().catch(() => ({}));
    const userId = searchParams.get('userId') || body.userId;

    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'User ID is required'
      }, { status: 400 });
    }

    console.log(`[WeaviateSync] Starting data sync for user: ${userId}`);

    // ✅ Initialize Weaviate service
    const weaviateService = new WeaviateService();
    await weaviateService.initialize();

    // Fetch snapshots from Appwrite
    const snapshotsResponse = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.SNAPSHOTS,
      [
        Query.equal('userId', userId),
        Query.orderDesc('timestamp'),
        Query.limit(500)
      ]
    );

    const snapshots = snapshotsResponse.documents;

    if (snapshots.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No snapshots found to sync',
        synced: 0,
        skipped: 0,
        errors: 0,
        total: 0
      });
    }

    let syncedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const errors: string[] = [];
    const syncResults: any[] = [];

    // Process snapshots in batches
    const batchSize = 10; // ✅ Reduced batch size for stability
    for (let i = 0; i < snapshots.length; i += batchSize) {
      const batch = snapshots.slice(i, i + batchSize);
      console.log('=== SNAPSHOT DEBUG ===');
snapshots.slice(0, 3).forEach(snapshot => {
  console.log(`Snapshot ID: ${snapshot.$id}`);
  console.log(`Results type: ${typeof snapshot.results}`);
  console.log(`Results length: ${snapshot.results?.length || 'N/A'}`);
  console.log(`Results value:`, JSON.stringify(snapshot.results, null, 2));
  console.log(`Full snapshot keys:`, Object.keys(snapshot));
  console.log('---');
});
      const results = await Promise.allSettled(
  batch.map(async (snapshot) => {
    try {
      // ✅ PARSE JSON STRING TO ARRAY
      let results = snapshot.results;
      if (typeof results === 'string') {
        try {
          results = JSON.parse(results);
        } catch (error) {
          console.error(`[WeaviateSync] Failed to parse results for snapshot ${snapshot.$id}:`, error);
          skippedCount++;
          return { success: false, reason: 'invalid_json' };
        }
      }

      // Validate parsed results
      if (!results || !Array.isArray(results) || results.length === 0) {
        console.warn(`[WeaviateSync] Skipping snapshot ${snapshot.$id}: No valid results after parsing`);
        skippedCount++;
        return { success: false, reason: 'no_valid_results' };
      }

      // Transform to RankingSnapshot format
      const rankingSnapshot = {
        id: snapshot.$id,
        userId: snapshot.userId,
        queryId: snapshot.queryId,
        timestamp: new Date(snapshot.timestamp),
        results: results.map((result: any, index: number) => ({
          id: `${snapshot.$id}_${index}`,
          url: result.url || '',
          title: result.title || '',
          snippet: result.snippet || '',
          position: result.position || index + 1,
          domain: result.domain || '',
          contentType: result.contentType || 'article',
          score: result.score || 0,
          timestamp: new Date(snapshot.timestamp),
          contentHash: result.contentHash || `${snapshot.$id}_${index}`,
        })),
        metadata: {
          totalResults: results.length,
          responseTime: snapshot.metadata?.responseTime || 0,
          executedAt: snapshot.metadata?.executedAt || snapshot.$createdAt,
        },
        queryType: snapshot.queryType || 'web',
      };

      // ACTUAL Weaviate sync
      await weaviateService.syncSnapshot(rankingSnapshot);
      
      console.log(`[WeaviateSync] Successfully synced snapshot: ${snapshot.$id} with ${results.length} results`);
      
      syncResults.push({
        snapshotId: snapshot.$id,
        status: 'synced',
        resultsCount: results.length
      });
      
      syncedCount++;
      return { success: true };
      
    } catch (error) {
      console.error(`[WeaviateSync] Failed to sync snapshot ${snapshot.$id}:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`Snapshot ${snapshot.$id}: ${errorMessage}`);
      errorCount++;
      
      syncResults.push({
        snapshotId: snapshot.$id,
        status: 'error',
        error: errorMessage
      });
      
      return { success: false, error: errorMessage };
    }
  })
);


      // ✅ Add delay between batches to avoid rate limiting
      if (i + batchSize < snapshots.length) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Increased delay
      }
    }

    // Calculate statistics
    const totalResults = syncResults.reduce((sum, result) => 
      sum + (result.resultsCount || 0), 0);

    const response = {
      success: true,
      message: `Data sync completed. Synced: ${syncedCount}, Errors: ${errorCount}, Skipped: ${skippedCount}`,
      synced: syncedCount,
      skipped: skippedCount,
      errors: errorCount,
      total: snapshots.length,
      totalResults,
      details: errors.length > 0 ? errors.slice(0, 10) : undefined,
      timestamp: new Date().toISOString(),
      statistics: {
        avgResultsPerSnapshot: snapshots.length > 0 ? totalResults / snapshots.length : 0,
        successRate: snapshots.length > 0 ? (syncedCount / snapshots.length) * 100 : 0,
      }
    };

    console.log(`[WeaviateSync] Data sync completed for user ${userId}:`, {
      synced: syncedCount,
      errors: errorCount,
      skipped: skippedCount,
      total: snapshots.length,
      totalResults
    });

    return NextResponse.json(response);

  } catch (error) {
    console.error('[WeaviateSync] Data sync operation failed:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      synced: 0,
      skipped: 0,
      errors: 1,
      total: 0,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  // Health check endpoint for the sync service
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'User ID is required for sync status'
      }, { status: 400 });
    }

    // Get basic sync status information
    const snapshotsResponse = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.SNAPSHOTS,
      [
        Query.equal('userId', userId),
        Query.limit(1)
      ]
    );

    return NextResponse.json({
      success: true,
      canSync: true,
      availableSnapshots: snapshotsResponse.total || 0,
      lastSync: null, // Would be tracked in a separate sync log
      status: 'ready',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get sync status',
      canSync: false
    }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
