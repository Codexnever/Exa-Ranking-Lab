// lib/drift-analyzer.ts
import type { RankingSnapshot, DriftAnalysisResult, DriftTimelinePoint, RankChange, SearchResult } from "@/lib/type";
import { pipeline, cos_sim } from '@xenova/transformers'; // Import from @xenova/transformers

// Global cache for the pipeline to avoid reloading the model on every call
let embedder: any = null;

async function getEmbedder() {
  if (!embedder) {
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return embedder;
}

/**
 * Calculate cosine similarity between two strings using transformer embeddings
 * This uses @xenova/transformers for semantic similarity
 */
async function calculateSimilarity(text1: string, text2: string): Promise<number> {
  const embedder = await getEmbedder();

  // Generate embeddings (vectors) for both texts
  const embedding1 = await embedder(text1, { pooling: 'mean', normalize: true });
  const embedding2 = await embedder(text2, { pooling: 'mean', normalize: true });

  // Compute cosine similarity between the vectors
  return cos_sim(embedding1.data, embedding2.data);
}

/**
 * Get combined text for similarity comparison
 */
function getCombinedText(result: SearchResult): string {
  return `${result.title} ${result.snippet}`;
}

/**
 * Calculate drift score between two snapshots (now async due to similarity)
 */
export async function calculateDriftScore(
  previousSnapshot: RankingSnapshot,
  currentSnapshot: RankingSnapshot,
  topN = 10,
): Promise<{ driftScore: number; rankChanges: RankChange[]; newResults: number; droppedResults: number }> {
  // Limit to top N results
  const prevResults = previousSnapshot.results.slice(0, topN);
  const currResults = currentSnapshot.results.slice(0, topN);

  // Create maps for quick lookup
  const prevUrlMap = new Map<string, SearchResult>();
  prevResults.forEach((result) => {
    prevUrlMap.set(result.url, result);
  });

  // Track changes
  const rankChanges: RankChange[] = [];
  let totalDrift = 0;
  let matchCount = 0;
  let newResults = 0;

  // Calculate position changes and similarities (now async)
  for (const [currIndex, currResult] of currResults.entries()) {
    const prevResult = prevUrlMap.get(currResult.url);

    if (prevResult) {
      // Found a match - calculate position change and similarity
      const prevIndex = prevResults.findIndex((r) => r.url === currResult.url);
      const positionDelta = prevIndex - currIndex;
      const similarityScore = await calculateSimilarity(getCombinedText(prevResult), getCombinedText(currResult));

      // Weight by position and similarity
      const positionWeight = 1 - currIndex / topN;
      const similarityDecay = 1 - similarityScore; // Lower similarity means higher drift
      const weightedDrift = Math.abs(positionDelta) * positionWeight * (1 + similarityDecay);

      totalDrift += weightedDrift;
      matchCount++;

      rankChanges.push({
        url: currResult.url,
        title: currResult.title,
        previousPosition: prevIndex + 1,
        currentPosition: currIndex + 1,
        positionDelta,
        similarityScore,
      });
    } else {
      // New result - higher penalty
      newResults++;
      totalDrift += 5 * (1 - currIndex / topN);
    }
  }

  // Count dropped results
  const droppedResults = prevResults.filter(
    (prevResult) => !currResults.some((currResult) => currResult.url === prevResult.url),
  ).length;

  // Add penalty for dropped results
  totalDrift += droppedResults * 3;

  // Normalize score between 0 and 100
  const maxPossibleDrift = topN * 10;
  const normalizedDrift = Math.min(100, (totalDrift / maxPossibleDrift) * 100);

  return {
    driftScore: normalizedDrift,
    rankChanges,
    newResults,
    droppedResults,
  };
}

/**
 * Analyze drift for a query across all its snapshots (now async)
 */
export async function analyzeDrift(queryId: string, queryName: string, snapshots: RankingSnapshot[]): Promise<DriftAnalysisResult> {
  const sortedSnapshots = [...snapshots].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  const driftTimeline: DriftTimelinePoint[] = [];
  let totalDrift = 0;
  let maxDrift = 0;

  for (let i = 1; i < sortedSnapshots.length; i++) {
    const prevSnapshot = sortedSnapshots[i - 1];
    const currSnapshot = sortedSnapshots[i];

    const { driftScore, rankChanges, newResults, droppedResults } = await calculateDriftScore(prevSnapshot, currSnapshot);

    driftTimeline.push({
      timestamp: new Date(currSnapshot.timestamp),
      snapshotId: currSnapshot.id,
      previousSnapshotId: prevSnapshot.id,
      driftScore,
      rankChanges,
      newResults,
      droppedResults,
    });

    totalDrift += driftScore;
    maxDrift = Math.max(maxDrift, driftScore);
  }

  const averageDrift = driftTimeline.length > 0 ? totalDrift / driftTimeline.length : 0;
  const latestDrift = driftTimeline.length > 0 ? driftTimeline[driftTimeline.length - 1].driftScore : 0;

  let stability: "stable" | "medium" | "volatile" = averageDrift < 20 ? "stable" : averageDrift < 50 ? "medium" : "volatile";

  let driftTrend: "improving" | "worsening" | "stable" = "stable";
  if (driftTimeline.length >= 3) {
    const recentDrifts = driftTimeline.slice(-3).map((point) => point.driftScore);
    const driftSlope = (recentDrifts[2] - recentDrifts[0]) / 2;
    driftTrend = driftSlope < -5 ? "improving" : driftSlope > 5 ? "worsening" : "stable";
  }

  return {
    queryId,
    queryName,
    driftTimeline,
    averageDrift,
    maxDrift,
    latestDrift,
    stability,
    driftTrend,
  };
}

/**
 * Analyze drift for multiple queries (now async)
 */
export async function analyzeDriftForQueries(
  queries: { id: string; name: string }[],
  allSnapshots: RankingSnapshot[],
): Promise<DriftAnalysisResult[]> {
  const results = await Promise.all(
    queries.map(async (query) => {
      const querySnapshots = allSnapshots.filter((snapshot) => snapshot.queryId === query.id);

      if (querySnapshots.length < 2) {
        return {
          queryId: query.id,
          queryName: query.name,
          driftTimeline: [],
          averageDrift: 0,
          maxDrift: 0,
          latestDrift: 0,
          stability: "stable" as "stable",
          driftTrend: "stable" as "stable",
        };
      }

      return await analyzeDrift(query.id, query.name, querySnapshots);
    })
  );

  return results.filter((result) => result.driftTimeline.length > 0);
}
