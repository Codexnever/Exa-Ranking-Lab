// lib/drift-analyzer.ts
import type { RankingSnapshot, DriftAnalysisResult, DriftTimelinePoint, RankChange, SearchResult } from "@/lib/type";

/**
 * Calculate cosine similarity between two strings
 * This is a simple implementation - in production, you might use a more sophisticated approach
 * or a library like natural or string-similarity
 */
function calculateSimilarity(text1: string, text2: string): number {
  // Simple implementation - tokenize and calculate cosine similarity
  const tokenize = (text: string) => {
    return text.toLowerCase().split(/\W+/).filter(Boolean);
  };

  const tokens1 = tokenize(text1);
  const tokens2 = tokenize(text2);

  // Create term frequency maps
  const freqMap1: Record<string, number> = {};
  const freqMap2: Record<string, number> = {};

  tokens1.forEach((token) => {
    freqMap1[token] = (freqMap1[token] || 0) + 1;
  });

  tokens2.forEach((token) => {
    freqMap2[token] = (freqMap2[token] || 0) + 1;
  });

  // Get all unique tokens
  const allTokens = new Set([...tokens1, ...tokens2]);

  // Calculate dot product and magnitudes
  let dotProduct = 0;
  let magnitude1 = 0;
  let magnitude2 = 0;

  allTokens.forEach((token) => {
    const freq1 = freqMap1[token] || 0;
    const freq2 = freqMap2[token] || 0;

    dotProduct += freq1 * freq2;
    magnitude1 += freq1 * freq1;
    magnitude2 += freq2 * freq2;
  });

  magnitude1 = Math.sqrt(magnitude1);
  magnitude2 = Math.sqrt(magnitude2);

  // Avoid division by zero
  if (magnitude1 === 0 || magnitude2 === 0) {
    return 0;
  }

  return dotProduct / (magnitude1 * magnitude2);
}

/**
 * Get combined text for similarity comparison
 */
function getCombinedText(result: SearchResult): string {
  return `${result.title} ${result.snippet}`;
}

/**
 * Calculate drift score between two snapshots
 */
export function calculateDriftScore(
  previousSnapshot: RankingSnapshot,
  currentSnapshot: RankingSnapshot,
  topN = 10,
): { driftScore: number; rankChanges: RankChange[]; newResults: number; droppedResults: number } {
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

  // Calculate position changes and similarities
  currResults.forEach((currResult, currIndex) => {
    const prevResult = prevUrlMap.get(currResult.url);

    if (prevResult) {
      // Found a match - calculate position change and similarity
      const prevIndex = prevResults.findIndex((r) => r.url === currResult.url);
      const positionDelta = prevIndex - currIndex;
      const similarityScore = calculateSimilarity(getCombinedText(prevResult), getCombinedText(currResult));

      // Weight by position and similarity
      // Higher positions (lower index) have more weight
      const positionWeight = 1 - currIndex / topN;
      const similarityDecay = 1 - similarityScore; // Lower similarity means higher drift
      const weightedDrift = Math.abs(positionDelta) * positionWeight * (1 + similarityDecay);

      totalDrift += weightedDrift;
      matchCount++;

      rankChanges.push({
        url: currResult.url,
        title: currResult.title,
        previousPosition: prevIndex + 1, // 1-based position for display
        currentPosition: currIndex + 1, // 1-based position for display
        positionDelta,
        similarityScore,
      });
    } else {
      // New result - higher penalty
      newResults++;
      totalDrift += 5 * (1 - currIndex / topN); // New results have higher drift, weighted by position
    }
  });

  // Count dropped results (in previous but not in current)
  const droppedResults = prevResults.filter(
    (prevResult) => !currResults.some((currResult) => currResult.url === prevResult.url),
  ).length;

  // Add penalty for dropped results
  totalDrift += droppedResults * 3;

  // Normalize score between 0 and 100
  // Higher score means more drift
  const maxPossibleDrift = topN * 10; // Theoretical maximum drift
  const normalizedDrift = Math.min(100, (totalDrift / maxPossibleDrift) * 100);

  return {
    driftScore: normalizedDrift,
    rankChanges,
    newResults,
    droppedResults,
  };
}

/**
 * Analyze drift for a query across all its snapshots
 */
export function analyzeDrift(queryId: string, queryName: string, snapshots: RankingSnapshot[]): DriftAnalysisResult {
  // Sort snapshots by timestamp
  const sortedSnapshots = [...snapshots].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  const driftTimeline: DriftTimelinePoint[] = [];
  let totalDrift = 0;
  let maxDrift = 0;

  // Compare consecutive snapshots
  for (let i = 1; i < sortedSnapshots.length; i++) {
    const prevSnapshot = sortedSnapshots[i - 1];
    const currSnapshot = sortedSnapshots[i];

    const { driftScore, rankChanges, newResults, droppedResults } = calculateDriftScore(prevSnapshot, currSnapshot);

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

  // Determine stability category
  let stability: "stable" | "medium" | "volatile";
  if (averageDrift < 20) {
    stability = "stable";
  } else if (averageDrift < 50) {
    stability = "medium";
  } else {
    stability = "volatile";
  }

  // Determine drift trend
  let driftTrend: "improving" | "worsening" | "stable" = "stable";
  if (driftTimeline.length >= 3) {
    const recentDrifts = driftTimeline.slice(-3).map((point) => point.driftScore);
    const driftSlope = (recentDrifts[2] - recentDrifts[0]) / 2;

    if (driftSlope < -5) {
      driftTrend = "improving"; // Drift is decreasing (more stable)
    } else if (driftSlope > 5) {
      driftTrend = "worsening"; // Drift is increasing (less stable)
    }
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
 * Analyze drift for multiple queries
 */
export function analyzeDriftForQueries(
  queries: { id: string; name: string }[],
  allSnapshots: RankingSnapshot[],
): DriftAnalysisResult[] {
  return queries
    .map((query) => {
      const querySnapshots = allSnapshots.filter((snapshot) => snapshot.queryId === query.id);

      if (querySnapshots.length < 2) {
        // Need at least 2 snapshots to calculate drift
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

      return analyzeDrift(query.id, query.name, querySnapshots);
    })
    .filter((result) => result.driftTimeline.length > 0); // Only return queries with drift data
  }