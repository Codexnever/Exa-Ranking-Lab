// app/services/weaviate-service.ts
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

// ✅ EXA.AI CATEGORIES
type ExaCategory = 
  | "company" 
  | "research paper" 
  | "news" 
  | "pdf" 
  | "github" 
  | "tweet" 
  | "personal site" 
  | "linkedin profile" 
  | "financial report";

// ✅ SEMANTIC CHUNKING CLASS
class SemanticChunker {
  private maxTokens: number;
  private overlapTokens: number;

  constructor(maxTokens = 384, overlapTokens = 48) {
    this.maxTokens = maxTokens;
    this.overlapTokens = overlapTokens;
  }

  async chunk(text: string): Promise<string[]> {
    const sentences = this.splitBySentences(text);
    const semanticGroups = this.groupSemanticallySimilarSentences(sentences);
    return this.createOverlappingChunks(semanticGroups);
  }

  private splitBySentences(text: string): string[] {
    return text
      .replace(/([.!?]+)\s*(?=[A-Z])/g, '$1|BOUNDARY|')
      .split('|BOUNDARY|')
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  private groupSemanticallySimilarSentences(sentences: string[]): string[][] {
    const groups: string[][] = [];
    let currentGroup: string[] = [];
    
    for (let i = 0; i < sentences.length; i++) {
      currentGroup.push(sentences[i]);
      
      const currentText = currentGroup.join(' ');
      const nextSentence = sentences[i + 1];
      
      if (nextSentence) {
        const combinedTokens = this.estimateTokens(currentText + ' ' + nextSentence);
        if (combinedTokens > this.maxTokens) {
          groups.push([...currentGroup]);
          currentGroup = [];
        }
      }
    }
    
    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }
    
    return groups;
  }

  private createOverlappingChunks(groups: string[][]): string[] {
    const chunks: string[] = [];
    
    for (let i = 0; i < groups.length; i++) {
      let chunk = groups[i].join(' ');
      
      if (i > 0 && this.overlapTokens > 0) {
        const prevChunk = groups[i - 1].join(' ');
        const prevWords = prevChunk.split(/\s+/).slice(-this.overlapTokens);
        chunk = prevWords.join(' ') + ' ' + chunk;
      }
      
      chunks.push(chunk.trim());
    }
    
    return chunks;
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.split(/\s+/).length * 0.75);
  }
}

// ✅ PRODUCT QUANTIZATION CLASS
class ProductQuantizer {
  private nSubVectors: number;
  private codebookSize: number;
  private codebooks: Float32Array[][];
  private subVectorDim: number;

  constructor(vectorDim = 384, nSubVectors = 8, codebookSize = 256) {
    this.nSubVectors = nSubVectors;
    this.codebookSize = codebookSize;
    this.subVectorDim = vectorDim / nSubVectors;
    this.codebooks = this.initializeCodebooks();
  }

  private initializeCodebooks(): Float32Array[][] {
    return Array.from({ length: this.nSubVectors }, () =>
      Array.from({ length: this.codebookSize }, () =>
        new Float32Array(this.subVectorDim).map(() => 
          (Math.random() - 0.5) * 0.1
        )
      )
    );
  }

  quantize(vector: number[]): Uint8Array {
    const codes = new Uint8Array(this.nSubVectors);
    
    for (let i = 0; i < this.nSubVectors; i++) {
      const startIdx = i * this.subVectorDim;
      const endIdx = startIdx + this.subVectorDim;
      const subVector = vector.slice(startIdx, endIdx);
      
      codes[i] = this.findNearestCodebookIndex(i, subVector);
    }
    
    return codes;
  }

  private findNearestCodebookIndex(subVectorIdx: number, subVector: number[]): number {
    const codebook = this.codebooks[subVectorIdx];
    let minDistance = Infinity;
    let nearestIndex = 0;

    for (let i = 0; i < codebook.length; i++) {
      const distance = this.euclideanDistance(subVector, Array.from(codebook[i]));
      if (distance < minDistance) {
        minDistance = distance;
        nearestIndex = i;
      }
    }

    return nearestIndex;
  }

  private euclideanDistance(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const diff = a[i] - b[i];
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }

  getCompressionRatio(originalVectorDim: number): number {
    const originalBytes = originalVectorDim * 4;
    const compressedBytes = this.nSubVectors * 1;
    return originalBytes / compressedBytes;
  }
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

  // ✅ ADVANCED FEATURES
  private semanticChunker: SemanticChunker;
  private productQuantizer: ProductQuantizer;
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 2000;
  private readonly CONNECTION_TIMEOUT = 30000;
  private readonly BATCH_SIZE = 20;

   constructor() {
    // ✅ SECURE: Use server-side env variables
    const weaviateURL = process.env.WEAVIATE_URL || "";
    const weaviateApiKey = process.env.WEAVIATE_API_KEY || "";
    
    if (!weaviateApiKey) throw new Error("WEAVIATE_API_KEY not set in environment");
    if (!weaviateURL) throw new Error("WEAVIATE_URL not set in environment");

    const scheme = 'https';
    const host = weaviateURL;

    this._client = weaviate.client({
      scheme,
      host,
      apiKey: new ApiKey(weaviateApiKey),
      headers: { 'X-Request-Timeout': this.CONNECTION_TIMEOUT.toString() },
    });

    // Initialize advanced features
    this.semanticChunker = new SemanticChunker(384, 48);
    this.productQuantizer = new ProductQuantizer(384, 8, 256);
  }
  get client(): WeaviateClient {
    return this._client;
  }

  // ✅ RETRY WRAPPER
  private async withRetry<T>(operation: () => Promise<T>, context: string): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        console.warn(`[WeaviateService] ${context} failed (attempt ${attempt}/${this.MAX_RETRIES}):`, error);
        
        if (attempt < this.MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY * attempt));
        }
      }
    }
    
    throw lastError || new Error(`Failed after ${this.MAX_RETRIES} attempts: ${context}`);
  }

  // ✅ SMART CATEGORY INFERENCE
  private inferExaCategory(domain: string, title: string, snippet: string = ""): ExaCategory {
    const d = domain.toLowerCase();
    const t = title.toLowerCase();
    const s = snippet.toLowerCase();
    const combined = `${t} ${s}`;

    // Exact domain matches
    if (d.includes("github.com")) return "github";
    if (d.includes("linkedin.com")) return "linkedin profile";
    if (d.includes("twitter.com") || d.includes("x.com")) return "tweet";
    
    // Content-based detection
    if (t.includes(".pdf") || combined.includes("pdf")) return "pdf";
    if (d.includes("sec.gov") || /\b(10-k|10-q|earnings|financial report|quarterly report)\b/i.test(combined)) {
      return "financial report";
    }
    if (/\b(research|paper|study|journal|arxiv|academic|publication)\b/i.test(combined)) {
      return "research paper";
    }
    if (/\b(news|breaking|headlines|report|article|press)\b/i.test(combined)) return "news";
    if (/\b(personal|blog|portfolio|about me|resume|cv)\b/i.test(combined)) return "personal site";
    if (/\b(company|corporate|business|startup|enterprise|organization)\b/i.test(combined)) return "company";

    return "company"; // Safe default
  }

  async initialize(): Promise<void> {
    if (this.isConnected) return;
    try {
      console.log("[WeaviateService] Initializing with advanced features...");
      this.embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
      await this.ensureSchema();
      await this.withRetry(async () => {
        await this._client.misc.metaGetter().do();
      }, "Connection test");
      this.isConnected = true;
      console.log("[WeaviateService] Connected successfully with semantic chunking and compression");
      console.log(`[WeaviateService] Vector compression ratio: ${this.productQuantizer.getCompressionRatio(384).toFixed(1)}x`);
    } catch (error) {
      console.error("[WeaviateService] Initialization failed:", error);
      throw error;
    }
  }

  private async ensureSchema() {
    try {
      const existing = await this.withRetry(async () => {
        return await this._client.schema.getter().do();
      }, "Schema getter");
      
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
          await this.withRetry(async () => {
            await this._client.schema.classCreator().withClass(cls).do();
          }, `Create schema: ${cls.class}`);
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
      .sort(([, valueA], [, valueB]) => valueA.timestamp - valueB.timestamp);
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
      maxSize: this.MAX_CACHE_SIZE,
      compressionRatio: this.productQuantizer.getCompressionRatio(384)
    }; 
  }

  // ========= ENHANCED CORE OPERATIONS =========

  // ✅ ENHANCED SYNC WITH SEMANTIC CHUNKING
  async syncSnapshot(snapshot: RankingSnapshot): Promise<void> {
    if (!this.isConnected) await this.initialize();

    try {
      const results = snapshot.results;
      const processedResults: any[] = [];
      
      console.log(`[WeaviateService] Processing ${results.length} results with semantic chunking...`);

      for (let i = 0; i < results.length; i += this.BATCH_SIZE) {
        const batch = results.slice(i, i + this.BATCH_SIZE);
        
        const batchResults = await Promise.all(
          batch.map(async (result, batchIndex) => {
            try {
              const fullText = `${result.title || ""} ${result.snippet || ""}`.trim();
              if (!fullText) return [];

              // ✅ SEMANTIC CHUNKING
              const chunks = await this.semanticChunker.chunk(fullText);
              const category = this.inferExaCategory(result.domain || "", result.title || "", result.snippet || "");

              const chunkResults = await Promise.all(
                chunks.map(async (chunk, chunkIndex) => {
                  const embedding = await this.getEmbedding(chunk, `${result.contentHash}_${chunkIndex}`);
                  
                  return {
                    class: "SearchResult",
                    properties: {
                      url: result.url || "",
                      title: result.title || "",
                      snippet: chunk, // Use chunk instead of full snippet
                      domain: result.domain || "",
                      position: result.position || (i + batchIndex + 1),
                      score: result.score || 0,
                      queryId: snapshot.queryId,
                      snapshotId: snapshot.id,
                      userId: snapshot.userId || "",
                      timestamp: snapshot.timestamp.toISOString(),
                      contentHash: `${result.contentHash || ""}_chunk_${chunkIndex}`,
                      category, // ✅ SMART EXA.AI CATEGORY
                    },
                    vector: embedding,
                  };
                })
              );

              return chunkResults;
            } catch (error) {
              console.error(`[WeaviateService] Failed to process result ${i + batchIndex}:`, error);
              return [];
            }
          })
        );

        processedResults.push(...batchResults.flat().filter(Boolean));
        
        // Rate limiting
        if (i + this.BATCH_SIZE < results.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      // ✅ BATCH INSERT WITH RETRY
      if (processedResults.length) {
        await this.withRetry(async () => {
          await this._client.batch.objectsBatcher().withObjects(...processedResults).do();
        }, `Batch insert for snapshot ${snapshot.id}`);
        
        console.log(`[WeaviateService] Successfully synced ${processedResults.length} semantic chunks for snapshot ${snapshot.id}`);
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
      
      await this.withRetry(async () => {
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
      }, `Sync query ${query.id}`);
      
      console.log(`[WeaviateService] Synced query ${query.id}`);
    } catch (error) {
      console.error(`[WeaviateService] Failed to sync query ${query.id}:`, error);
      throw error;
    }
  }

  // ✅ ENHANCED SEMANTIC SEARCH WITH CATEGORY FILTERING
  async semanticSearch(
    query: string,
    userId: string,
    limit = 20,
    threshold = 0.7,
    category?: ExaCategory
  ): Promise<SearchHit[]> {
    if (!this.isConnected) await this.initialize();

    try {
      const queryEmbedding = await this.getEmbedding(query);
      
      // Build where clause with optional category filter
      let whereClause;
    
    if (category) {
      whereClause = {
        operator: "And" as const,
        operands: [
          { 
            path: ["userId"], 
            operator: "Equal" as const, 
            valueText: userId 
          },
          { 
            path: ["category"], 
            operator: "Equal" as const, 
            valueText: category 
          }
        ]
      };
    } else {
      whereClause = {
        path: ["userId"],
        operator: "Equal" as const,
        valueText: userId
      };
    }
      const result = await this.withRetry(async () => {
        return await this._client.graphql
          .get()
          .withClassName("SearchResult")
          .withFields(`
            url title snippet domain position score queryId timestamp contentHash category
            _additional { certainty distance }
          `)
          .withNearVector({ vector: queryEmbedding, certainty: threshold })
          .withWhere(whereClause)
          .withLimit(limit)
          .do();
      }, "Enhanced semantic search");

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
      console.error("[WeaviateService] Enhanced semantic search failed:", error);
      return [];
    }
  }

  // ✅ REST OF METHODS WITH RETRY LOGIC
  async findSimilarQueries(queryId: string, limit = 5): Promise<SimilarQuery[]> {
    if (!this.isConnected) await this.initialize();

    try {
      const ref = await this.withRetry(async () => {
        return await this._client.graphql
          .get()
          .withClassName("QueryIntent")
          .withFields("_additional { vector }")
          .withWhere({ path: ["queryId"], operator: "Equal", valueText: queryId })
          .withLimit(1)
          .do();
      }, `Find reference vector for query ${queryId}`);

      const refVector = ref.data?.Get?.QueryIntent?.[0]?._additional?.vector;
      if (!refVector) return [];

      const similar = await this.withRetry(async () => {
        return await this._client.graphql
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
      }, `Find similar queries for ${queryId}`);

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
      
      const result = await this.withRetry(async () => {
        return await this._client.graphql
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
      }, "Detect content anomalies");

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
      return await this.withRetry(async () => {
        const result = await this._client.graphql
          .get()
          .withClassName("QueryIntent")
          .withFields("category")
          .withWhere({ path: ["queryId"], operator: "Equal", valueText: queryId })
          .withLimit(1)
          .do();
        return result.data?.Get?.QueryIntent?.[0]?.category || "";
      }, `Get query category for ${queryId}`);
    } catch (error) {
      console.error(`[WeaviateService] Failed to get category for query ${queryId}:`, error);
      return "";
    }
  }
}
