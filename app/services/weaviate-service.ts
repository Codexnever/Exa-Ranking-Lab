import weaviate, { WeaviateClient, ApiKey } from "weaviate-ts-client";
import { pipeline } from "@xenova/transformers";
import type { RankingSnapshot, QueryConfig, SearchResult } from "@/lib/type";

export interface SimilarQuery {
  id: string;
  name: string;
  query: string;
  category: QueryConfig["category"];
  userId: string;
  createdAt: Date;
  lastRun?: Date;
  similarity: number;
}

export interface SearchHit {
  id: string;
  url: string;
  title: string;
  snippet: string;
  domain: string;
  position: number;
  score: number;
  contentHash: string;
  timestamp: Date;
  similarity: number;
  semanticDistance: number;
}

export class WeaviateService {
  private _client: WeaviateClient;
  private embedder: any;
  private isConnected = false;
  private vectorCache = new Map<string, { vector: number[]; timestamp: number }>();
  private cacheHits = 0;
  private cacheRequests = 0;
  private readonly VECTOR_CACHE_TTL = 60 * 60 * 1000;
  private readonly MAX_CACHE_SIZE = 10000;

 constructor() {
 const weaviateURL = process.env.NEXT_PUBLIC_WEAVIATE_URL || "mtockgprtsluerirm6bsq.c0.asia-southeast1.gcp.weaviate.cloud";
 const weaviateApiKey = process.env.NEXT_PUBLIC_WEAVIATE_API_KEY || "";

if(!weaviateApiKey)throw new Error("WEAVIATEAPI_KEY not set");

if (!weaviateURL) throw new Error("WEAVIATE_URL not set");


 const scheme = 'https';
 const host = weaviateURL;


 this._client = weaviate.client({
 scheme,
 host,
 apiKey: weaviateApiKey ? new ApiKey(weaviateApiKey) : undefined,
 });
  }

  // CRITICAL: Getter for client access (required by WeaviateAnalyticsService)
  get client(): WeaviateClient {
    return this._client;
  }

  async initialize(): Promise<void> {
    if (this.isConnected) return;
    
    try {
      this.embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
      await this.ensureSchema();
      await this._client.misc.metaGetter().do();
      this.isConnected = true;
      console.log("[WeaviateService] Connected successfully");
    } catch (error) {
      console.error("[WeaviateService] Initialization failed:", error);
      throw error;
    }
  }

  private async ensureSchema() {
    try {
      const existing = await this._client.schema.getter().do();
      const existingClasses = (existing.classes || []).map(c => c.class);

      const classes = [
        {
          class: "SearchResult",
          vectorizer: "none",
          description: "Search results with embeddings",
          properties: [
            { name: "url", dataType: ["text"] },
            { name: "title", dataType: ["text"] },
            { name: "snippet", dataType: ["text"] },
            { name: "domain", dataType: ["text"] },
            { name: "position", dataType: ["int"] },
            { name: "score", dataType: ["number"] },
            { name: "queryId", dataType: ["text"] },
            { name: "snapshotId", dataType: ["text"] },
            { name: "userId", dataType: ["text"] },
            { name: "timestamp", dataType: ["date"] },
            { name: "contentHash", dataType: ["text"] },
            { name: "category", dataType: ["text"] },
          ],
        },
        {
          class: "QueryIntent",
          vectorizer: "none",
          description: "User search queries",
          properties: [
            { name: "queryId", dataType: ["text"] },
            { name: "name", dataType: ["text"] },
            { name: "query", dataType: ["text"] },
            { name: "category", dataType: ["text"] },
            { name: "userId", dataType: ["text"] },
            { name: "createdAt", dataType: ["date"] },
            { name: "lastRun", dataType: ["date"] },
          ],
        },
        {
          class: "DriftPattern",
          vectorizer: "none",
          description: "Detected drift patterns",
          properties: [
            { name: "queryId", dataType: ["text"] },
            { name: "snapshotId", dataType: ["text"] },
            { name: "previousSnapshotId", dataType: ["text"] },
            { name: "driftScore", dataType: ["number"] },
            { name: "contentChanges", dataType: ["int"] },
            { name: "timestamp", dataType: ["date"] },
            { name: "userId", dataType: ["text"] },
          ],
        },
      ];

      for (const cls of classes) {
        if (!existingClasses.includes(cls.class)) {
          await this._client.schema.classCreator().withClass(cls).do();
          console.log(`[WeaviateService] Created schema: ${cls.class}`);
        }
      }
    } catch (error) {
      console.error("[WeaviateService] Schema creation failed:", error);
      throw error;
    }
  }

  private async getEmbedding(text: string, contentHash?: string): Promise<number[]> {
    this.cacheRequests++;
    const key = contentHash || this.hashText(text);
    const cached = this.vectorCache.get(key);
    
    if (cached && Date.now() - cached.timestamp < this.VECTOR_CACHE_TTL) {
      this.cacheHits++;
      return cached.vector;
    }

    try {
      const embedding = await this.embedder(text.slice(0, 512), { 
        pooling: "mean", 
        normalize: true 
      });
      const vectorArray = Array.from(embedding.data) as number[];
      this.cacheVector(key, vectorArray);
      return vectorArray;
    } catch (error) {
      console.error("[WeaviateService] Embedding generation failed:", error);
      throw error;
    }
  }

  private cacheVector(key: string, vector: number[]) {
    if (this.vectorCache.size >= this.MAX_CACHE_SIZE) {
      this.cleanupVectorCache();
    }
    this.vectorCache.set(key, { vector, timestamp: Date.now() });
  }

  private cleanupVectorCache() {
    const entries = [...this.vectorCache.entries()]
      .sort((a, b) => a[1].timestamp - b[1].timestamp);
    entries.slice(0, Math.floor(this.MAX_CACHE_SIZE * 0.3))
      .forEach(([k]) => this.vectorCache.delete(k));
  }

  private hashText(text: string): string {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    }
    return hash.toString();
  }

  isWeaviateConnected(): boolean { 
    return this.isConnected; 
  }

  getCacheStats() { 
    const hitRate = this.cacheRequests > 0 ? this.cacheHits / this.cacheRequests : 0;
    return { 
      size: this.vectorCache.size, 
      hitRate: Math.round(hitRate * 100) / 100, 
      maxSize: this.MAX_CACHE_SIZE 
    }; 
  }

  // ========= Core operations =========

  async syncSnapshot(snapshot: RankingSnapshot): Promise<void> {
    if (!this.isConnected) await this.initialize();

    try {
      const vectorizedResults = await Promise.all(
        snapshot.results.map(async (result, index) => {
          const contentText = `${result.title || ""} ${result.snippet || ""}`.trim();
          if (!contentText) return null;

          const embedding = await this.getEmbedding(contentText, result.contentHash);
          const category = snapshot.queryId ? await this.getQueryCategory(snapshot.queryId) : "";

          return {
            class: "SearchResult",
            properties: {
              url: result.url || "",
              title: result.title || "",
              snippet: result.snippet || "",
              domain: result.domain || "",
              position: result.position || index + 1,
              score: result.score || 0,
              queryId: snapshot.queryId,
              snapshotId: snapshot.id,
              userId: snapshot.userId || "",
              timestamp: snapshot.timestamp.toISOString(),
              contentHash: result.contentHash || "",
              category,
            },
            vector: embedding,
          };
        })
      );

      const validResults = vectorizedResults.filter(Boolean) as any[];
      if (validResults.length) {
        // Batch insert with error handling
        await this._client.batch.objectsBatcher().withObjects(...validResults).do();
        console.log(`[WeaviateService] Synced ${validResults.length} results for snapshot ${snapshot.id}`);
      }
    } catch (error) {
      console.error(`[WeaviateService] Failed to sync snapshot ${snapshot.id}:`, error);
      throw error;
    }
  }

  async syncQuery(query: SimilarQuery): Promise<void> {
    if (!this.isConnected) await this.initialize();

    try {
      const embedding = await this.getEmbedding(`${query.name} ${query.query}`);
      
      await this._client.data
        .creator()
        .withClassName("QueryIntent")
        .withProperties({
          queryId: query.id,
          name: query.name,
          query: query.query,
          category: query.category,
          userId: query.userId,
          createdAt: query.createdAt.toISOString(),
          lastRun: query.lastRun?.toISOString() || null,
        })
        .withVector(embedding)
        .do();
        
      console.log(`[WeaviateService] Synced query ${query.id}`);
    } catch (error) {
      console.error(`[WeaviateService] Failed to sync query ${query.id}:`, error);
      throw error;
    }
  }

  async semanticSearch(
    query: string,
    userId: string,
    limit = 20,
    threshold = 0.7
  ): Promise<SearchHit[]> {
    if (!this.isConnected) await this.initialize();

    try {
      const queryEmbedding = await this.getEmbedding(query);
      
      // FIXED: Use correct class name "SearchResult" not "SimilarQuery"
      const result = await this._client.graphql
        .get()
        .withClassName("SearchResult")
        .withFields(`
          url title snippet domain position score queryId timestamp contentHash
          _additional { certainty distance }
        `)
        .withNearVector({ vector: queryEmbedding, certainty: threshold })
        .withWhere({ path: ["userId"], operator: "Equal", valueText: userId })
        .withLimit(limit)
        .do();

      // FIXED: Use correct path for SearchResult
      const items = (result.data?.Get?.SearchResult || []) as any[];
      
      return items.map((item: any) => ({
        id: `${item.queryId}_${item.position}`,
        url: item.url,
        title: item.title,
        snippet: item.snippet,
        domain: item.domain,
        position: item.position,
        score: item.score,
        contentHash: item.contentHash,
        timestamp: new Date(item.timestamp),
        similarity: item._additional?.certainty || 0,
        semanticDistance: item._additional?.distance || 0,
      }));
    } catch (error) {
      console.error("[WeaviateService] Semantic search failed:", error);
      return [];
    }
  }

  async findSimilarQueries(queryId: string, limit = 5): Promise<SimilarQuery[]> {
    if (!this.isConnected) await this.initialize();

    try {
      // Get reference vector
      const ref = await this._client.graphql
        .get()
        .withClassName("QueryIntent")
        .withFields("_additional { vector }")
        .withWhere({ path: ["queryId"], operator: "Equal", valueText: queryId })
        .withLimit(1)
        .do();

      const refVector = ref.data?.Get?.QueryIntent?.[0]?._additional?.vector;
      if (!refVector) return [];

      // Find similar queries
      const similar = await this._client.graphql
        .get()
        .withClassName("QueryIntent")
        .withFields(`
          queryId name query category userId createdAt lastRun
          _additional { certainty }
        `)
        .withNearVector({ vector: refVector, certainty: 0.6 })
        .withWhere({ path: ["queryId"], operator: "NotEqual", valueText: queryId })
        .withLimit(limit)
        .do();

      const results = (similar.data?.Get?.QueryIntent || []) as any[];
      
      return results.map((item: any) => ({
        id: item.queryId,
        name: item.name,
        query: item.query,
        category: item.category,
        userId: item.userId,
        createdAt: new Date(item.createdAt),
        lastRun: item.lastRun ? new Date(item.lastRun) : undefined,
        similarity: item._additional?.certainty || 0,
      }));
    } catch (error) {
      console.error("[WeaviateService] Find similar queries failed:", error);
      return [];
    }
  }

  async detectContentAnomalies(userId: string, timeRangeMs: number): Promise<any[]> {
    if (!this.isConnected) await this.initialize();

    try {
      const cutoffDate = new Date(Date.now() - timeRangeMs).toISOString();
      
      // FIXED: Use correct class name "SearchResult"
      const result = await this._client.graphql
        .get()
        .withClassName("SearchResult")
        .withFields(`
          url title snippet position timestamp queryId
          _additional { vector certainty }
        `)
        .withWhere({
          operator: "And",
          operands: [
            { path: ["userId"], operator: "Equal", valueText: userId },
            { path: ["timestamp"], operator: "GreaterThan", valueDate: cutoffDate },
          ],
        })
        .withLimit(1000)
        .do();

      // FIXED: Use correct path for SearchResult
      const results = (result.data?.Get?.SearchResult || []) as any[];
      
      if (results.length < 10) return [];
      
      return this.analyzeVectorAnomalies(results);
    } catch (error) {
      console.error("[WeaviateService] Content anomaly detection failed:", error);
      return [];
    }
  }

  private analyzeVectorAnomalies(results: any[]): any[] {
    try {
      const groups = new Map<string, any[]>();
      
      results.forEach(result => {
        if (!result.queryId) return;
        if (!groups.has(result.queryId)) {
          groups.set(result.queryId, []);
        }
        groups.get(result.queryId)!.push(result);
      });

      const anomalies: any[] = [];

      groups.forEach((items, queryId) => {
        if (items.length < 3) return;

        // Calculate pairwise similarities
        const pairwise: number[] = [];
        for (let i = 0; i < items.length - 1; i++) {
          for (let j = i + 1; j < items.length; j++) {
            const sim = this.cosineSimilarity(
              items[i]._additional?.vector || [],
              items[j]._additional?.vector || []
            );
            if (sim > 0) pairwise.push(sim);
          }
        }

        if (!pairwise.length) return;

        const mean = pairwise.reduce((sum, val) => sum + val, 0) / pairwise.length;
        const variance = pairwise.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / pairwise.length;
        const stdDev = Math.sqrt(variance);

        // Detect anomalies (items with low similarity to others)
        items.forEach(item => {
          const others = items.filter(x => x !== item);
          const similarities = others.map(other => 
            this.cosineSimilarity(
              item._additional?.vector || [], 
              other._additional?.vector || []
            )
          ).filter(sim => sim > 0);

          if (similarities.length === 0) return;

          const avgSimilarity = similarities.reduce((sum, sim) => sum + sim, 0) / similarities.length;
          
          if (avgSimilarity < mean - 2 * stdDev) {
            anomalies.push({
              type: "content_anomaly",
              queryId,
              url: item.url,
              title: item.title,
              position: item.position,
              timestamp: item.timestamp,
              anomalyScore: stdDev > 0 ? (mean - avgSimilarity) / stdDev : 0,
              avgSimilarity,
              expectedSimilarity: mean,
            });
          }
        });
      });

      return anomalies.sort((a, b) => b.anomalyScore - a.anomalyScore);
    } catch (error) {
      console.error("[WeaviateService] Vector anomaly analysis failed:", error);
      return [];
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (!a?.length || !b?.length || a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator > 0 ? dotProduct / denominator : 0;
  }

  private async getQueryCategory(queryId: string): Promise<string> {
    try {
      const result = await this._client.graphql
        .get()
        .withClassName("QueryIntent")
        .withFields("category")
        .withWhere({ path: ["queryId"], operator: "Equal", valueText: queryId })
        .withLimit(1)
        .do();
        
      return result.data?.Get?.QueryIntent?.[0]?.category || "";
    } catch (error) {
      console.error(`[WeaviateService] Failed to get category for query ${queryId}:`, error);
      return "";
    }
  }
}
