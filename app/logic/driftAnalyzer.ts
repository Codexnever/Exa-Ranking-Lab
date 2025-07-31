// lib/drift-analyzer.ts
import type {
  RankingSnapshot,
  DriftAnalysisResult,
  DriftTimelinePoint,
  RankChange,
  SearchResult,
} from "@/lib/type";
import { pipeline, cos_sim } from "@xenova/transformers";
import { createHash } from "crypto";

// Global cache for the pipeline to avoid reloading the model on every call
let embedder: any = null;

async function getEmbedder() {
  if (!embedder) {
    embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  }
  return embedder;
}

// ✅ Enhanced content hash with better fingerprinting
function computeContentHash(title: string, snippet: string, url: string): string {
  const combined = `${title || ''}|${snippet || ''}|${url || ''}`.trim().toLowerCase();
  return createHash("sha256").update(combined).digest("hex");
}

// Enhanced embedding cache with TTL implementation
class EmbeddingCache {
  private cache = new Map<
    string,
    { embedding: any; timestamp: number; hits: number; contentHash?: string }
  >();
  private readonly TTL = 24 * 60 * 60 * 1000; // 24 hours
  private readonly MAX_SIZE = 1000;

  private generateKey(text: string, contentHash?: string): string {
    // Use content hash if available for better cache efficiency
    if (contentHash) {
      return `emb_hash_${contentHash}`;
    }
    
    // Fallback to text-based key
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }
    return `emb_${hash}_${text.length}`;
  }

  async get(text: string, embedder: any, contentHash?: string): Promise<any> {
    const key = this.generateKey(text, contentHash);
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

    this.cache.set(key, { 
      embedding, 
      timestamp: Date.now(), 
      hits: 1,
      contentHash 
    });

    return embedding;
  }

  private cleanup(): void {
    const entries = Array.from(this.cache.entries());
    entries
      .sort(
        (a, b) =>
          a[1].hits / (Date.now() - a[1].timestamp) -
          b[1].hits / (Date.now() - b[1].timestamp)
      )
      .slice(0, Math.floor(this.MAX_SIZE * 0.3))
      .forEach(([key]) => this.cache.delete(key));
  }

  // ✅ Smart cache invalidation using content hashes
  shouldRecalculate(oldHashes: string[], newHashes: string[]): boolean {
    if (oldHashes.length !== newHashes.length) return true;
    
    const oldSet = new Set(oldHashes);
    const newSet = new Set(newHashes);
    
    // If hash sets are identical, no content changed
    for (const hash of oldSet) {
      if (!newSet.has(hash)) return true;
    }
    return false;
  }
}

// Global embedding cache instance
const embeddingCache = new EmbeddingCache();

/**
 * Enhanced similarity calculation with content hash optimization
 */
async function calculateSimilarity(
  text1: string, 
  text2: string, 
  hash1?: string, 
  hash2?: string
): Promise<number> {
  try {
    if (!text1?.trim() || !text2?.trim()) return 0;

    // ✅ Fast path: if content hashes are identical, similarity is 1.0
    if (hash1 && hash2 && hash1 === hash2) {
      return 1.0;
    }

    const cleanText1 = text1.trim().slice(0, 512);
    const cleanText2 = text2.trim().slice(0, 512);

    const [embedding1, embedding2] = await Promise.all([
      embeddingCache.get(cleanText1, await getEmbedder(), hash1),
      embeddingCache.get(cleanText2, await getEmbedder(), hash2),
    ]);

    const similarity = cos_sim(embedding1.data, embedding2.data);
    return Math.max(0, Math.min(1, similarity));
  } catch (error) {
    console.warn("Similarity calculation failed:", error);
    return 0;
  }
}

/**
 * Enhanced batch similarity calculation with content hash optimization
 */
async function calculateBatchSimilarity(
  textPairs: Array<[string, string]>,
  hashPairs?: Array<[string, string]>
): Promise<number[]> {
  try {
    const embedderInstance = await getEmbedder();

    // ✅ Fast path for identical content hashes
    const fastResults: number[] = [];
    const slowPairs: Array<[string, string]> = [];
    const slowIndices: number[] = [];

    textPairs.forEach(([t1, t2], index) => {
      const [h1, h2] = hashPairs?.[index] || [];
      if (h1 && h2 && h1 === h2) {
        fastResults[index] = 1.0; // Identical content
      } else {
        slowPairs.push([t1, t2]);
        slowIndices.push(index);
      }
    });

    // Process remaining pairs that need actual similarity calculation
    if (slowPairs.length === 0) {
      return fastResults;
    }

    const uniqueTexts = Array.from(
      new Set(slowPairs.flat().map((t) => t.trim().slice(0, 512)))
    );

    if (uniqueTexts.length === 0) {
      return fastResults.length > 0 ? fastResults : textPairs.map(() => 0);
    }

    // Fetch embeddings with content hash optimization
    const embeddingMap = new Map<string, any>();
    for (const text of uniqueTexts) {
      if (text) {
        const embedding = await embeddingCache.get(text, embedderInstance);
        embeddingMap.set(text, embedding.data);
      }
    }

    // Calculate similarities for slow pairs
    slowPairs.forEach(([t1, t2], slowIndex) => {
      const originalIndex = slowIndices[slowIndex];
      const emb1 = embeddingMap.get(t1.trim().slice(0, 512));
      const emb2 = embeddingMap.get(t2.trim().slice(0, 512));
      
      if (!emb1 || !emb2) {
        fastResults[originalIndex] = 0;
      } else {
        const similarity = cos_sim(emb1, emb2);
        fastResults[originalIndex] = Math.max(0, Math.min(1, similarity));
      }
    });

    return fastResults;
  } catch (error) {
    console.warn("Batch similarity calculation failed:", error);
    return textPairs.map(() => 0);
  }
}

/**
 * Enhanced combined text with content hash
 */
function getCombinedText(result: SearchResult): string {
  return `${result.title} ${result.snippet}`;
}

function getContentHash(result: SearchResult): string {
  return result.contentHash || computeContentHash(
    result.title || '', 
    result.snippet || '', 
    result.url || ''
  );
}

/**
 * Enhanced configuration interface with content hash support
 */
interface EnhancedDriftConfig {
  topN: number;
  positionWeight: "linear" | "exponential";
  similarityThreshold: number;
  newResultPenalty: number;
  droppedResultPenalty: number;
  useBatchProcessing: boolean;
  useContentHashOptimization: boolean; // ✅ New option
  contentChangeBonus: number; // ✅ Bonus for content changes
}

const ENHANCED_DRIFT_CONFIG: EnhancedDriftConfig = {
  topN: 10,
  positionWeight: "linear",
  similarityThreshold: 0.8,
  newResultPenalty: 5,
  droppedResultPenalty: 3,
  useBatchProcessing: true,
  useContentHashOptimization: true,
  contentChangeBonus: 2.0,
};

/**
 * Enhanced drift score calculation with content hash optimization
 */
export async function calculateDriftScore(
  previousSnapshot: RankingSnapshot,
  currentSnapshot: RankingSnapshot,
  config: EnhancedDriftConfig = ENHANCED_DRIFT_CONFIG
): Promise<{
  driftScore: number;
  rankChanges: RankChange[];
  newResults: number;
  droppedResults: number;
  contentChanges: number; // ✅ New metric
  processingTime: number;
  cacheHitRate?: number; // ✅ Performance metric
}> {
  const startTime = performance.now();

  try {
    const prevResults = previousSnapshot.results.slice(0, config.topN);
    const currResults = currentSnapshot.results.slice(0, config.topN);

    // ✅ Quick content hash comparison for early optimization
    if (config.useContentHashOptimization) {
      const prevHashes = prevResults.map(getContentHash);
      const currHashes = currResults.map(getContentHash);
      
      // If no content changed and same order, drift is minimal
      if (!embeddingCache.shouldRecalculate(prevHashes, currHashes)) {
        const positionOnlyDrift = calculatePositionOnlyDrift(prevResults, currResults, config);
        return {
          driftScore: positionOnlyDrift,
          rankChanges: [],
          newResults: 0,
          droppedResults: 0,
          contentChanges: 0,
          processingTime: performance.now() - startTime,
          cacheHitRate: 1.0
        };
      }
    }

    // Map previous results by URL and content hash
    const prevUrlMap = new Map<string, SearchResult>();
    const prevHashMap = new Map<string, SearchResult>();
    prevResults.forEach((result) => {
      prevUrlMap.set(result.url, result);
      const hash = getContentHash(result);
      prevHashMap.set(hash, result);
    });

    // Prepare similarity pairs with hash optimization
    const similarityPairs: Array<[string, string]> = [];
    const hashPairs: Array<[string, string]> = [];
    const similarityIndices: number[] = [];

    currResults.forEach((currResult, index) => {
      const prevResult = prevUrlMap.get(currResult.url);
      if (prevResult) {
        similarityPairs.push([
          getCombinedText(prevResult), 
          getCombinedText(currResult)
        ]);
        hashPairs.push([
          getContentHash(prevResult),
          getContentHash(currResult)
        ]);
        similarityIndices.push(index);
      }
    });

    // Calculate similarities with hash optimization
    const similarities = config.useBatchProcessing && similarityPairs.length > 0
      ? await calculateBatchSimilarity(similarityPairs, hashPairs)
      : [];

    // Track metrics
    const rankChanges: RankChange[] = [];
    let totalDrift = 0;
    let newResults = 0;
    let contentChanges = 0;
    let similarityIndex = 0;

    // Process each current result
    for (const [currIndex, currResult] of currResults.entries()) {
      const prevResult = prevUrlMap.get(currResult.url);

      if (prevResult) {
        const prevIndex = prevResults.findIndex((r) => r.url === currResult.url);
        const positionDelta = prevIndex - currIndex;

        // Get similarity score with hash optimization
        let similarityScore: number;
        if (config.useBatchProcessing && similarities.length > similarityIndex) {
          similarityScore = similarities[similarityIndex];
          similarityIndex++;
        } else {
          similarityScore = await calculateSimilarity(
            getCombinedText(prevResult),
            getCombinedText(currResult),
            getContentHash(prevResult),
            getContentHash(currResult)
          );
        }

        // ✅ Check for content change using hash
        const contentChanged = getContentHash(prevResult) !== getContentHash(currResult);
        if (contentChanged) {
          contentChanges++;
        }

        // Calculate position weight
        let positionWeight: number;
        if (config.positionWeight === "exponential") {
          positionWeight = Math.exp(-currIndex / config.topN);
        } else {
          positionWeight = 1 - currIndex / config.topN;
        }

        // Enhanced drift calculation with content change bonus
        const similarityDecay = Math.max(0, 1 - similarityScore);
        const contentChangeMultiplier = contentChanged ? config.contentChangeBonus : 1;
        const thresholdBonus = similarityScore < config.similarityThreshold ? 1.5 : 1;
        
        const weightedDrift = Math.abs(positionDelta) * positionWeight * 
                             (1 + similarityDecay) * contentChangeMultiplier * thresholdBonus;

        totalDrift += weightedDrift;

        rankChanges.push({
          url: currResult.url,
          title: currResult.title,
          previousPosition: prevIndex + 1,
          currentPosition: currIndex + 1,
          positionDelta,
          similarityScore,
          contentChanged, // ✅ New field
        });
      } else {
        // New result penalty
        newResults++;
        const posWeight = config.positionWeight === "exponential"
          ? Math.exp(-currIndex / config.topN)
          : 1 - currIndex / config.topN;
        totalDrift += config.newResultPenalty * posWeight;
      }
    }

    // Count dropped results
    const droppedResults = prevResults.filter(
      (prevResult) => !currResults.some((currResult) => currResult.url === prevResult.url)
    ).length;
    totalDrift += droppedResults * config.droppedResultPenalty;

    // Normalize drift score
    const maxPossibleDrift = config.topN * 15; // Increased for content change bonus
    const normalizedDrift = Math.min(100, (totalDrift / maxPossibleDrift) * 100);

    const processingTime = performance.now() - startTime;
    const cacheHitRate = similarities.filter(s => s === 1.0).length / similarities.length;

    return {
      driftScore: normalizedDrift,
      rankChanges,
      newResults,
      droppedResults,
      contentChanges,
      processingTime,
      cacheHitRate: isNaN(cacheHitRate) ? 0 : cacheHitRate,
    };
  } catch (error) {
    console.error("Enhanced drift calculation failed:", error);
    const processingTime = performance.now() - startTime;
    return {
      driftScore: 0,
      rankChanges: [],
      newResults: 0,
      droppedResults: 0,
      contentChanges: 0,
      processingTime,
      cacheHitRate: 0,
    };
  }
}

/**
 * Fast position-only drift calculation for content-identical results
 */
function calculatePositionOnlyDrift(
  prevResults: SearchResult[], 
  currResults: SearchResult[], 
  config: EnhancedDriftConfig
): number {
  const prevUrlMap = new Map(prevResults.map((r, i) => [r.url, i]));
  let totalDrift = 0;

  currResults.forEach((currResult, currIndex) => {
    const prevIndex = prevUrlMap.get(currResult.url);
    if (prevIndex !== undefined) {
      const positionDelta = Math.abs(prevIndex - currIndex);
      const positionWeight = config.positionWeight === "exponential"
        ? Math.exp(-currIndex / config.topN)
        : 1 - currIndex / config.topN;
      totalDrift += positionDelta * positionWeight;
    }
  });

  const maxPossibleDrift = config.topN * 5; // Lower max for position-only
  return Math.min(100, (totalDrift / maxPossibleDrift) * 100);
}

/**
 * Enhanced drift analysis with content hash support
 */
export async function analyzeDrift(
  queryId: string,
  queryName: string,
  snapshots: RankingSnapshot[]
): Promise<DriftAnalysisResult & {
  totalContentChanges: number;
  averageCacheHitRate: number;
  totalProcessingTime: number;
}> {
  const sortedSnapshots = [...snapshots].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const driftTimeline: DriftTimelinePoint[] = [];
  let totalDrift = 0;
  let maxDrift = 0;
  let totalContentChanges = 0;
  let totalCacheHits = 0;
  let totalProcessingTime = 0;

  for (let i = 1; i < sortedSnapshots.length; i++) {
    const prevSnapshot = sortedSnapshots[i - 1];
    const currSnapshot = sortedSnapshots[i];

    const result = await calculateDriftScore(prevSnapshot, currSnapshot);

    driftTimeline.push({
      timestamp: new Date(currSnapshot.timestamp),
      snapshotId: currSnapshot.id,
      previousSnapshotId: prevSnapshot.id,
      driftScore: result.driftScore,
      rankChanges: result.rankChanges,
      newResults: result.newResults,
      droppedResults: result.droppedResults,
      contentChanges: result.contentChanges, // ✅ New field
      processingTime: result.processingTime, // ✅ Performance metric
    });

    totalDrift += result.driftScore;
    maxDrift = Math.max(maxDrift, result.driftScore);
    totalContentChanges += result.contentChanges;
    totalCacheHits += result.cacheHitRate || 0;
    totalProcessingTime += result.processingTime;
  }

  const averageDrift = driftTimeline.length > 0 ? totalDrift / driftTimeline.length : 0;
  const latestDrift = driftTimeline.length > 0 ? driftTimeline[driftTimeline.length - 1].driftScore : 0;
  const averageCacheHitRate = driftTimeline.length > 0 ? totalCacheHits / driftTimeline.length : 0;

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
    totalContentChanges,
    averageCacheHitRate,
    totalProcessingTime,
  };
}

/**
 * Enhanced multi-query drift analysis
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
          totalContentChanges: 0,
          averageCacheHitRate: 0,
          totalProcessingTime: 0,
        };
      }

      return await analyzeDrift(query.id, query.name, querySnapshots);
    })
  );

  return results.filter((result) => result.driftTimeline.length > 0);
}
