import { type NextRequest, NextResponse } from "next/server";
import { databaseService } from "@/app/services/database/database-service";
import { analyzeDrift } from "@/app/logic/driftAnalyzer";
import { getEmbeddingService } from "@/app/services/EmbeddingService";
import { withEnhancedSecurity } from "@/lib/middleware/security/security-middleware";
import { SecurityContext } from "@/types/type";

async function getSingleDriftHandler(
  request: NextRequest,
  context: SecurityContext,
  routeParams: { params: Promise<{ queryid: string }> }
) {
  let queryid = "unknown";

  try {
    const params = await routeParams.params;
    queryid = params.queryid;

    const userId = context.user.$id;

    if (!queryid?.trim()) {
      return NextResponse.json(
        { error: "Invalid query ID" },
        { status: 400 }
      );
    }

    console.log(
      `[Drift API] Single query analysis for: ${queryid}, user: ${userId}`
    );

    // Measures the entire API request.
    const routeStartTime = performance.now();

    // ─────────────────────────────────────────────────────────────────────
    // Load query
    // ─────────────────────────────────────────────────────────────────────

    const queryLoadStartedAt = performance.now();

    const query = await databaseService.queryService.getQuery(queryid);

    const queryLoadMs = performance.now() - queryLoadStartedAt;

    if (!query) {
      return NextResponse.json(
        {
          error: "Query not found",
          queryId: queryid,
        },
        { status: 404 }
      );
    }

    if (query.userId !== userId) {
      console.warn(
        `[Drift API] Unauthorized access attempt: user ${userId} ` +
        `tried to access query ${queryid} owned by ${query.userId}`
      );

      return NextResponse.json(
        {
          error: "Access denied - you don't own this query",
        },
        { status: 403 }
      );
    }

    // ─────────────────────────────────────────────────────────────────────
    // Load snapshots
    // ─────────────────────────────────────────────────────────────────────

    const snapshotFetchStartedAt = performance.now();

    const snapshots =
      await databaseService.snapshotService.getSnapshots(queryid, userId);

    const snapshotFetchMs =
      performance.now() - snapshotFetchStartedAt;

    console.log(
      `[Drift API] Found ${snapshots.length} snapshots for query ${queryid}`
    );

    // ─────────────────────────────────────────────────────────────────────
    // Not enough data for a comparison
    // ─────────────────────────────────────────────────────────────────────

    if (snapshots.length < 2) {
      return NextResponse.json({
        queryId: queryid,
        queryName: query.name,
        driftTimeline: [],
        averageDrift: 0,
        maxDrift: 0,
        latestDrift: 0,
        stability: "stable" as const,
        driftTrend: "stable" as const,
        totalContentChanges: 0,
        averageCacheHitRate: 0,
        totalResultsCompared: 0,
        contentStabilityRate: 0,
        totalProcessingTime: 0,
        routeProcessingTime: performance.now() - routeStartTime,
        metadata: {
          snapshotsAnalyzed: snapshots.length,
          processingTime: performance.now() - routeStartTime,
          timestamp: new Date().toISOString(),
          message:
            `Insufficient snapshots: found ${snapshots.length}, ` +
            `need at least 2 for drift analysis`,
        },
      });
    }

    // ─────────────────────────────────────────────────────────────────────
    // Drift analysis + cache metrics
    // ─────────────────────────────────────────────────────────────────────

    const cacheBefore = getEmbeddingService().cacheStats;

    // Start BEFORE analyzeDrift(), not after it.
    const driftStartedAt = performance.now();

    const driftResult = await analyzeDrift(
      queryid,
      query.name,
      snapshots
    );

    const driftCalculationMs =
      performance.now() - driftStartedAt;

    const cacheAfter = getEmbeddingService().cacheStats;

    // ─────────────────────────────────────────────────────────────────────
    // Per-request embedding cache hit rate
    //
    // Hits = L1 hits + Redis hits
    // Lookups = L1 hits + Redis hits + misses
    // ─────────────────────────────────────────────────────────────────────

    const l1Hits =
      cacheAfter.l1Hits - cacheBefore.l1Hits;

    const redisHits =
      cacheAfter.redisHits - cacheBefore.redisHits;

    const cacheMisses =
     cacheAfter.totalMisses - cacheBefore.totalMisses;

    const cacheHits = l1Hits + redisHits;

    const cacheLookups =
      cacheHits + cacheMisses;

    const requestCacheHitRate =
      cacheLookups > 0
        ? cacheHits / cacheLookups
        : 0;

    // ─────────────────────────────────────────────────────────────────────
    // Full route timing
    // ─────────────────────────────────────────────────────────────────────

    const routeProcessingTime =
      performance.now() - routeStartTime;

    console.log(
      `[Drift API] Single query analysis completed — ` +
      `drift computation: ${driftResult.totalProcessingTime.toFixed(2)}ms, ` +
      `measured drift wall time: ${driftCalculationMs.toFixed(2)}ms, ` +
      `full request: ${routeProcessingTime.toFixed(2)}ms, ` +
      `cache hit rate: ${(requestCacheHitRate * 100).toFixed(1)}%`
    );

    // ─────────────────────────────────────────────────────────────────────
    // Performance diagnostics
    // ─────────────────────────────────────────────────────────────────────

    if (process.env.PERFORMANCE_DEBUG === "true") {
      console.info(
        "[Drift API] Single-query timing",
        {
          queryId: queryid,

          queryLoadMs: Math.round(queryLoadMs),

          snapshotFetchMs: Math.round(snapshotFetchMs),

          driftCalculationMs: Math.round(driftCalculationMs),

          analyzeDriftReportedMs: Math.round(
            driftResult.totalProcessingTime
          ),

          totalMs: Math.round(routeProcessingTime),

          embeddingRequests:
            cacheAfter.totalRequests -
            cacheBefore.totalRequests,

          embeddingKeyLookups:
            cacheAfter.embeddingKeyLookups -
            cacheBefore.embeddingKeyLookups,

          l1Hits,

          redisHits,

          cacheMisses,

          cacheHits,

          cacheLookups,

          requestCacheHitRate: Number(
            requestCacheHitRate.toFixed(4)
          ),

          providerLoadOperations:
            cacheAfter.providerLoadOperations -
            cacheBefore.providerLoadOperations,

          providerInputs:
            cacheAfter.providerInputs -
            cacheBefore.providerInputs,

          inflightHits:
            cacheAfter.inflightHits -
            cacheBefore.inflightHits,

          redisFailures:
            cacheAfter.redisFailures -
            cacheBefore.redisFailures,
        }
      );
    }

    // ─────────────────────────────────────────────────────────────────────
    // Response
    // ─────────────────────────────────────────────────────────────────────

    return NextResponse.json({
      ...driftResult,

      // Per-request cache metric.
      // This replaces the global L1 cache hit rate returned by analyzeDrift.
      averageCacheHitRate: requestCacheHitRate,

      // Full HTTP request timing.
      routeProcessingTime,

      metadata: {
        snapshotsAnalyzed: snapshots.length,

        processingTime: routeProcessingTime,

        timestamp: new Date().toISOString(),

        queryId: queryid,

        userId,
      },
    });
  } catch (error) {
    console.error(
      `[Drift API] Failed to analyze drift for query ${queryid}:`,
      error
    );

    return NextResponse.json(
      {
        error: "Failed to analyze drift for query",

        details:
          process.env.NODE_ENV === "development"
            ? error instanceof Error
              ? error.message
              : "Unknown error"
            : undefined,
      },
      { status: 500 }
    );
  }
}

export const GET = withEnhancedSecurity(getSingleDriftHandler, {
  rateLimit: {
    windowMs: 60 * 1000,
    maxRequests: 30,
  },

  allowedMethods: ["GET"],

  logAttempts: true,
});