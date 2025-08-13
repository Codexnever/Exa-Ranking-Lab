import { NextResponse } from 'next/server';
import { WeaviateService } from '@/app/services/weaviate-service';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const queryId = searchParams.get('queryId');
    const limit = Number(searchParams.get('limit') || '5');

    if (!queryId) {
      return NextResponse.json(
        { error: 'Missing queryId parameter' }, 
        { status: 400 }
      );
    }

    const weaviateService = new WeaviateService();
    await weaviateService.initialize();

    const similar = await weaviateService.findSimilarQueries(queryId, limit);

    return NextResponse.json({
      success: true,
      similar,
      queryId,
      count: similar.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Similar Queries API error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to fetch similar queries',
        success: false 
      }, 
      { status: 500 }
    );
  }
}
