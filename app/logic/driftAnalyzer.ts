// lib/drift-analyzer.ts
import type {
  RankingSnapshot,
  DriftAnalysisResult,
  DriftTimelinePoint,
  RankChange,
  SearchResult,
} from "@/lib/type";
import { pipeline, cos_sim } from "@xenova/transformers"; // Import from @xenova/transformers

// Global cache for the pipeline to avoid reloading the model on every call
let embedder: any = null;

async function getEmbedder() {
  if (!embedder) {
    embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  }
  return embedder;
}

// Embedding cache with TTL implementation
class EmbeddingCache {
  private cache = new Map<
    string,
    { embedding: any; timestamp: number; hits: number }
  >();
  private readonly TTL = 24 * 60 * 60 * 1000; // 24 hours
  private readonly MAX_SIZE = 1000;

  private generateKey(text: string): string {
    // Simple hash function for cache key
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0; // Convert to 32-bit integer
    }
    return `emb_${hash}_${text.length}`;
  }

  async get(text: string, embedder: any): Promise<any> {
    const key = this.generateKey(text);
    const cached = this.cache.get(key);

    if (cached && Date.now() - cached.timestamp < this.TTL) {
      cached.hits++;
      return cached.embedding;
    }

    // Generate new embedding
    const embedding = await embedder(text, { pooling: "mean", normalize: true });

    // Clean cache if too large
    if (this.cache.size >= this.MAX_SIZE) {
      this.cleanup();
    }

    this.cache.set(key, { embedding, timestamp: Date.now(), hits: 1 });

    return embedding;
  }

  private cleanup(): void {
    const entries = Array.from(this.cache.entries());
    // Remove oldest entries with lowest hit count
    entries
      .sort(
        (a, b) =>
          a[1].hits / (Date.now() - a[1].timestamp) -
          b[1].hits / (Date.now() - b[1].timestamp)
      )
      .slice(0, Math.floor(this.MAX_SIZE * 0.3))
      .forEach(([key]) => this.cache.delete(key));
  }
}

// Global embedding cache instance
const embeddingCache = new EmbeddingCache();

/**
 * Generate or retrieve cached embedding for a text
 */
async function getCachedEmbedding(text: string): Promise<any> {
  const embedderInstance = await getEmbedder();
  return embeddingCache.get(text, embedderInstance);
}

/**
 * Calculate cosine similarity between two strings using transformer embeddings with caching
 */
async function calculateSimilarity(text1: string, text2: string): Promise<number> {
  try {
    if (!text1?.trim() || !text2?.trim()) return 0;

    const cleanText1 = text1.trim().slice(0, 512);
    const cleanText2 = text2.trim().slice(0, 512);

    const [embedding1, embedding2] = await Promise.all([
      getCachedEmbedding(cleanText1),
      getCachedEmbedding(cleanText2),
    ]);

    const similarity = cos_sim(embedding1.data, embedding2.data);
    return Math.max(0, Math.min(1, similarity));
  } catch (error) {
    console.warn("Similarity calculation failed:", error);
    return 0;
  }
}

/**
 * Batch similarity calculation for multiple pairs
 */
async function calculateBatchSimilarity(
  textPairs: Array<[string, string]>
): Promise<number[]> {
  try {
    const embedderInstance = await getEmbedder();

    // Extract unique texts
    const uniqueTexts = Array.from(
      new Set(textPairs.flat().map((t) => t.trim().slice(0, 512)))
    );

    if (uniqueTexts.length === 0) return textPairs.map(() => 0);

    // Fetch embeddings (use cache when possible)
    const embeddingMap = new Map<string, any>();
    for (const text of uniqueTexts) {
      if (text) {
        const embedding = await embeddingCache.get(text, embedderInstance);
        embeddingMap.set(text, embedding.data);
      }
    }

    // Calculate similarities
    return textPairs.map(([t1, t2]) => {
      const emb1 = embeddingMap.get(t1.trim().slice(0, 512));
      const emb2 = embeddingMap.get(t2.trim().slice(0, 512));
      if (!emb1 || !emb2) return 0;
      const similarity = cos_sim(emb1, emb2);
      return Math.max(0, Math.min(1, similarity));
    });
  } catch (error) {
    console.warn("Batch similarity calculation failed:", error);
    return textPairs.map(() => 0);
  }
}

/**
 * Concatenate title and snippet to get combined text for similarity
 */
function getCombinedText(result: SearchResult): string {
  return `${result.title} ${result.snippet}`;
}

/**
 * Configuration interface for drift calculation
 */
interface DriftConfig {
  topN: number;
  positionWeight: "linear" | "exponential";
  similarityThreshold: number;
  newResultPenalty: number;
  droppedResultPenalty: number;
  useBatchProcessing: boolean;
}

const DEFAULT_DRIFT_CONFIG: DriftConfig = {
  topN: 10,
  positionWeight: "linear",
  similarityThreshold: 0.8,
  newResultPenalty: 5,
  droppedResultPenalty: 3,
  useBatchProcessing: true,
};

/**
 * Calculate drift score between two snapshots using embeddings and position changes
 */
export async function calculateDriftScore(
  previousSnapshot: RankingSnapshot,
  currentSnapshot: RankingSnapshot,
  config: DriftConfig = DEFAULT_DRIFT_CONFIG
): Promise<{
  driftScore: number;
  rankChanges: RankChange[];
  newResults: number;
  droppedResults: number;
  processingTime: number;
}> {
  const startTime = performance.now();

  try {
    const prevResults = previousSnapshot.results.slice(0, config.topN);
    const currResults = currentSnapshot.results.slice(0, config.topN);

    // Map previous results by URL
    const prevUrlMap = new Map<string, SearchResult>();
    prevResults.forEach((result) => prevUrlMap.set(result.url, result));

    // Prepare pairs for similarity batch
    const similarityPairs: Array<[string, string]> = [];
    const similarityIndices: number[] = [];

    // Track new results & rank changes
    const rankChanges: RankChange[] = [];
    let totalDrift = 0;
    let newResults = 0;

    currResults.forEach((currResult, currIndex) => {
      const prevResult = prevUrlMap.get(currResult.url);
      if (prevResult) {
        similarityPairs.push([getCombinedText(prevResult), getCombinedText(currResult)]);
        similarityIndices.push(currIndex);
      }
    });

    const similarities =
      config.useBatchProcessing && similarityPairs.length > 0
        ? await calculateBatchSimilarity(similarityPairs)
        : [];

    let similarityIndex = 0;

    for (const [currIndex, currResult] of currResults.entries()) {
      const prevResult = prevUrlMap.get(currResult.url);

      if (prevResult) {
        const prevIndex = prevResults.findIndex((r) => r.url === currResult.url);
        const positionDelta = prevIndex - currIndex;

        // Get similarity score (batch or individual)
        let similarityScore: number;
        if (config.useBatchProcessing && similarities.length > similarityIndex) {
          similarityScore = similarities[similarityIndex];
          similarityIndex++;
        } else {
          similarityScore = await calculateSimilarity(
            getCombinedText(prevResult),
            getCombinedText(currResult)
          );
        }

        // Calculate position weight
        let positionWeight: number;
        if (config.positionWeight === "exponential") {
          positionWeight = Math.exp(-currIndex / config.topN);
        } else {
          positionWeight = 1 - currIndex / config.topN;
        }

        // Calculate weighted drift
        const similarityDecay = Math.max(0, 1 - similarityScore);
        const contentChangeBonus = similarityScore < config.similarityThreshold ? 2 : 1;
        const weightedDrift =
          Math.abs(positionDelta) * positionWeight * (1 + similarityDecay) * contentChangeBonus;

        totalDrift += weightedDrift;

        rankChanges.push({
          url: currResult.url,
          title: currResult.title,
          previousPosition: prevIndex + 1,
          currentPosition: currIndex + 1,
          positionDelta,
          similarityScore,
        });
      } else {
        // New result penalty
        newResults++;
        const posWeight =
          config.positionWeight === "exponential"
            ? Math.exp(-currIndex / config.topN)
            : 1 - currIndex / config.topN;
        totalDrift += config.newResultPenalty * posWeight;
      }
    }

    // Count dropped results penalty
    const droppedResults = prevResults.filter(
      (prevResult) => !currResults.some((currResult) => currResult.url === prevResult.url)
    ).length;
    totalDrift += droppedResults * config.droppedResultPenalty;

    const maxPossibleDrift = config.topN * 10;
    const normalizedDrift = Math.min(100, (totalDrift / maxPossibleDrift) * 100);

    const processingTime = performance.now() - startTime;

    return {
      driftScore: normalizedDrift,
      rankChanges,
      newResults,
      droppedResults,
      processingTime,
    };
  } catch (error) {
    console.error("Drift calculation failed:", error);
    const processingTime = performance.now() - startTime;
    return {
      driftScore: 0,
      rankChanges: [],
      newResults: 0,
      droppedResults: 0,
      processingTime,
    };
  }
}

/**
 * Analyze drift over multiple snapshots for a query
 */
export async function analyzeDrift(
  queryId: string,
  queryName: string,
  snapshots: RankingSnapshot[]
): Promise<DriftAnalysisResult> {
  const sortedSnapshots = [...snapshots].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const driftTimeline: DriftTimelinePoint[] = [];
  let totalDrift = 0;
  let maxDrift = 0;

  for (let i = 1; i < sortedSnapshots.length; i++) {
    const prevSnapshot = sortedSnapshots[i - 1];
    const currSnapshot = sortedSnapshots[i];

    const { driftScore, rankChanges, newResults, droppedResults } = await calculateDriftScore(
      prevSnapshot,
      currSnapshot
    );

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

  let stability: "stable" | "medium" | "volatile" =
    averageDrift < 20 ? "stable" : averageDrift < 50 ? "medium" : "volatile";

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
 * Analyze drift for multiple queries
 */
export async function analyzeDriftForQueries(
  queries: { id: string; name: string }[],
  allSnapshots: RankingSnapshot[]
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
