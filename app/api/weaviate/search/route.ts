import { NextResponse } from 'next/server';
import { WeaviateService } from '@/app/services/weaviate-service';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q');
    const userId = searchParams.get('userId');
    const limit = Number(searchParams.get('limit') || '20');
    const threshold = Number(searchParams.get('threshold') || '0.7');

    if (!query || !userId) {
      return NextResponse.json(
        { error: 'Missing required parameters: query and userId' }, 
        { status: 400 }
      );
    }

    const weaviateService = new WeaviateService();
    await weaviateService.initialize();

    const results = await weaviateService.semanticSearch(query, userId, limit, threshold);

    return NextResponse.json({
      success: true,
      results,
      query,
      userId,
      count: results.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Semantic Search API error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to perform semantic search',
        success: false 
      }, 
      { status: 500 }
    );
  }
}
