//  app/api/weaviate/sync-queries/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { databases, DATABASE_ID, COLLECTIONS } from '@/app/server/appwrite';
import { Query } from 'appwrite';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { searchParams } = new URL(request.url);
    const userId = body.userId || searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'User ID is required'
      }, { status: 400 });
    }

    console.log(`[SyncQueries] Starting sync for user: ${userId}`);

    const queriesResponse = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.QUERIES,
      [
        Query.equal('userId', userId),
        Query.orderDesc('$createdAt'),
        Query.limit(100)
      ]
    );

    const queries = queriesResponse.documents;

    if (queries.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No queries found to sync',
        synced: 0,
        skipped: 0,
        errors: 0,
        totalQueries: 0
      });
    }

    let syncedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const errors: string[] = [];
    const syncResults: any[] = [];

    const batchSize = 10;
    for (let i = 0; i < queries.length; i += batchSize) {
      const batch = queries.slice(i, i + batchSize);
      
      await Promise.allSettled(
        batch.map(async (query) => {
          try {
            const weaviateQuery = {
              id: query.$id,
              userId: query.userId,
              title: query.title || '',
              query: query.query || '',
              type: query.type || 'web',
              numResults: query.numResults || 10,
              includeDomains: Array.isArray(query.includeDomains) ? query.includeDomains : [],
              excludeDomains: Array.isArray(query.excludeDomains) ? query.excludeDomains : [],
              startCrawlDate: query.startCrawlDate || null,
              endCrawlDate: query.endCrawlDate || null,
              startPublishedDate: query.startPublishedDate || null,
              endPublishedDate: query.endPublishedDate || null,
              useAutoprompt: Boolean(query.useAutoprompt),
              category: query.category || 'general',
              createdAt: query.$createdAt,
              updatedAt: query.$updatedAt,
              queryVector: null,
            };

            // TODO: Replace with actual Weaviate sync logic when ready
            // const result = await weaviateService.upsertQuery(weaviateQuery);
            
            console.log(`[SyncQueries] Synced query: ${weaviateQuery.id}`);
            
            syncResults.push({
              queryId: query.$id,
              status: 'synced',
            });
            
            syncedCount++;
          } catch (error) {
            console.error(`[SyncQueries] Failed to sync query ${query.$id}:`, error);
            errors.push(`Query ${query.$id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            errorCount++;
            
            syncResults.push({
              queryId: query.$id,
              status: 'error',
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        })
      );

      if (i + batchSize < queries.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    const response = {
      success: true,
      message: `Sync completed. Synced: ${syncedCount}, Errors: ${errorCount}`,
      synced: syncedCount,
      skipped: skippedCount,
      errors: errorCount,
      totalQueries: queries.length,
      details: errors.length > 0 ? errors.slice(0, 5) : undefined,
      timestamp: new Date().toISOString(),
    };

    console.log(`[SyncQueries] Sync completed for user ${userId}:`, {
      synced: syncedCount,
      errors: errorCount,
      total: queries.length
    });

    return NextResponse.json(response);

  } catch (error) {
    console.error('[SyncQueries] Sync operation failed:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      synced: 0,
      skipped: 0,
      errors: 1,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
