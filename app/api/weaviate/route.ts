// app/api/weaviate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { WeaviateService } from '@/app/services/weaviate-service';
import { WeaviateAnalyticsService } from '@/app/services/weaviate-analytics-service';
import type { QueryConfig } from '@/lib/type';

// Rate limiting (simple in-memory - use Redis in production)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 100; // requests per hour
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour

function checkRateLimit(identifier: string): boolean {
  const now = Date.now();
  const limit = rateLimitMap.get(identifier);
  
  if (!limit || now > limit.resetTime) {
    rateLimitMap.set(identifier, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }
  
  if (limit.count >= RATE_LIMIT) {
    return false;
  }
  
  limit.count++;
  return true;
}

export async function POST(request: NextRequest) {
  try {
    // Basic rate limiting
    const userIP = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    if (!checkRateLimit(userIP)) {
      return NextResponse.json({
        success: false,
        error: 'Rate limit exceeded. Try again later.'
      }, { status: 429 });
    }

    const body = await request.json().catch(() => ({}));
    const { userId, timeRangeMs = 30 * 24 * 60 * 60 * 1000, queries = [] } = body;

    // Validate required parameters
    if (!userId || typeof userId !== 'string') {
      return NextResponse.json({
        success: false,
        error: 'Valid userId is required'
      }, { status: 400 });
    }

    // Validate timeRangeMs
    const maxTimeRange = 365 * 24 * 60 * 60 * 1000; // 1 year max
    if (timeRangeMs > maxTimeRange) {
      return NextResponse.json({
        success: false,
        error: 'Time range too large. Maximum 1 year allowed.'
      }, { status: 400 });
    }

    console.log(`[API] Starting Weaviate analytics for user: ${userId}, timeRange: ${timeRangeMs}ms`);

    // ✅ SERVER-SIDE ONLY: Initialize services with secure credentials
    const weaviateService = new WeaviateService();
    const analyticsService = new WeaviateAnalyticsService(false, weaviateService);

    // Get analytics data
    const analytics = await analyticsService.getAnalytics(
      userId,
      timeRangeMs,
      queries as QueryConfig[]
    );

    console.log(`[API] Successfully retrieved Weaviate analytics for user: ${userId}`);

    return NextResponse.json({
      success: true,
      data: analytics,
      timestamp: new Date().toISOString(),
      processingTimeMs: Date.now() - Date.now() // Would calculate actual processing time
    });

  } catch (error) {
    console.error('[API] Weaviate analytics failed:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error occurred while processing analytics',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  // Health check endpoint
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'userId parameter required'
      }, { status: 400 });
    }

    // Test Weaviate connection
    const weaviateService = new WeaviateService();
    const isConnected = weaviateService.isWeaviateConnected();

    return NextResponse.json({
      success: true,
      status: 'healthy',
      weaviateConnected: isConnected,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Service unavailable',
      timestamp: new Date().toISOString()
    }, { status: 503 });
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
