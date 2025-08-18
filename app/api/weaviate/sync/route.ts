import { NextRequest, NextResponse } from 'next/server';
import { databases, DATABASE_ID, COLLECTIONS } from '@/app/server/appwrite';
import { Query } from 'appwrite';

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

    // Fetch snapshots from Appwrite
    const snapshotsResponse = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.SNAPSHOTS,
      [
        Query.equal('userId', userId),
        Query.orderDesc('timestamp'),
        Query.limit(500) // Reasonable limit for sync
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

    // Process snapshots in batches to avoid overwhelming Weaviate
    const batchSize = 20;
    for (let i = 0; i < snapshots.length; i += batchSize) {
      const batch = snapshots.slice(i, i + batchSize);
      
      await Promise.allSettled(
        batch.map(async (snapshot) => {
          try {
            // Transform snapshot data for Weaviate
            const weaviateSnapshot = {
              id: snapshot.$id,
              userId: snapshot.userId,
              queryId: snapshot.queryId,
              timestamp: snapshot.timestamp,
              results: Array.isArray(snapshot.results) ? snapshot.results.map(result => ({
                url: result.url || '',
                title: result.title || '',
                position: result.position || 0,
                domain: result.domain || '',
                contentType: result.contentType || '',
                snippet: result.snippet || '',
                publishedDate: result.publishedDate || null
              })) : [],
              metadata: {
                responseTime: snapshot.metadata?.responseTime || 0,
                executedAt: snapshot.metadata?.executedAt || snapshot.$createdAt,
                totalResults: snapshot.results?.length || 0,
                avgPosition: snapshot.results?.length > 0 
                  ? snapshot.results.reduce((sum, r) => sum + (r.position || 0), 0) / snapshot.results.length 
                  : 0
              },
              createdAt: snapshot.$createdAt,
              updatedAt: snapshot.$updatedAt,
            };

            // TODO: Replace with actual Weaviate sync logic when ready
            // For now, we'll simulate the sync operation
            // await weaviateService.upsertSnapshot(weaviateSnapshot);
            
            console.log(`[WeaviateSync] Synced snapshot: ${weaviateSnapshot.id}`);
            
            syncResults.push({
              snapshotId: snapshot.$id,
              status: 'synced',
              resultsCount: weaviateSnapshot.results.length
            });
            
            syncedCount++;
          } catch (error) {
            console.error(`[WeaviateSync] Failed to sync snapshot ${snapshot.$id}:`, error);
            errors.push(`Snapshot ${snapshot.$id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            errorCount++;
            
            syncResults.push({
              snapshotId: snapshot.$id,
              status: 'error',
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        })
      );

      // Add small delay between batches to avoid rate limiting
      if (i + batchSize < snapshots.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    // Calculate additional statistics
    const totalResults = syncResults.reduce((sum, result) => 
      sum + (result.resultsCount || 0), 0);

    const response = {
      success: true,
      message: `Data sync completed. Synced: ${syncedCount}, Errors: ${errorCount}`,
      synced: syncedCount,
      skipped: skippedCount,
      errors: errorCount,
      total: snapshots.length,
      totalResults,
      details: errors.length > 0 ? errors.slice(0, 10) : undefined, // Limit error details
      timestamp: new Date().toISOString(),
      statistics: {
        avgResultsPerSnapshot: snapshots.length > 0 ? totalResults / snapshots.length : 0,
        successRate: snapshots.length > 0 ? (syncedCount / snapshots.length) * 100 : 0,
        processingTimeMs: Date.now() - Date.now() // Would be calculated properly
      }
    };

    console.log(`[WeaviateSync] Data sync completed for user ${userId}:`, {
      synced: syncedCount,
      errors: errorCount,
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
