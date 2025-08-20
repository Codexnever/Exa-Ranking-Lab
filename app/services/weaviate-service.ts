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

// ✅ CORRECTED BINARY QUANTIZATION CLASS
class BinaryQuantizer {
  private dimension: number;
  private readonly BITS_PER_BYTE = 8;

  constructor(dimension: number) {
    this.dimension = dimension;
  }

  /**
   * Ultra-fast quantization: Convert float vector to binary (sign-based)
   */
  quantize(vector: number[]): Uint8Array {
    if (vector.length !== this.dimension) {
      throw new Error(`Vector dimension mismatch: expected ${this.dimension}, got ${vector.length}`);
    }

    const bytes = new Uint8Array(Math.ceil(this.dimension / this.BITS_PER_BYTE));
    
    for (let i = 0; i < this.dimension; i++) {
      if (vector[i] > 0) {
        const byteIndex = Math.floor(i / this.BITS_PER_BYTE);
        const bitIndex = 7 - (i % this.BITS_PER_BYTE);
        bytes[byteIndex] |= 1 << bitIndex;
      }
    }

    return bytes;
  }

  /**
   * Decompress binary codes back to approximate vector
   */
  dequantize(bytes: Uint8Array): number[] {
    const vector = new Array(this.dimension).fill(0);
    
    for (let i = 0; i < this.dimension; i++) {
      const byteIndex = Math.floor(i / this.BITS_PER_BYTE);
      const bitIndex = 7 - (i % this.BITS_PER_BYTE);
      const mask = 1 << bitIndex;
      
      vector[i] = (bytes[byteIndex] & mask) ? 1 : -1;
    }

    return vector;
  }

  /**
   * ✅ CORRECT: Use Hamming distance for binary vectors
   * This is the proper similarity metric for binary quantized vectors
   */
  hammingDistance(a: Uint8Array, b: Uint8Array): number {
    if (a.length !== b.length) {
      throw new Error('Binary codes must have same length');
    }

    let distance = 0;
    
    for (let i = 0; i < a.length; i++) {
      const xor = a[i] ^ b[i];
      distance += this.popCount(xor);
    }

    return distance;
  }

  /**
   * Fast bit counting using Brian Kernighan's algorithm
   */
  private popCount(byte: number): number {
    let count = 0;
    while (byte) {
      count++;
      byte &= byte - 1;
    }
    return count;
  }

  /**
   * ✅ CORRECT: Convert Hamming distance to similarity score
   * This approximates angular similarity without using cosine directly
   */
  hammingToSimilarity(hammingDist: number): number {
    const maxDistance = this.dimension;
    return 1 - (hammingDist / maxDistance);
  }

  getCompressionRatio(): number {
    const originalBytes = this.dimension * 4;
    const compressedBytes = Math.ceil(this.dimension / this.BITS_PER_BYTE);
    return originalBytes / compressedBytes;
  }
}

export class WeaviateService {
  private _client: WeaviateClient;
  private embedder: any;
  private isConnected = false;
  private vectorCache = new Map<string, { vector: number[]; binaryCode: Uint8Array; timestamp: number }>();
  private cacheHits = 0;
  private cacheRequests = 0;
  private readonly VECTOR_CACHE_TTL = 60 * 60 * 1000;
  private readonly MAX_CACHE_SIZE = 10000;

  // ✅ ADVANCED FEATURES WITH BINARY QUANTIZATION
  private semanticChunker: SemanticChunker;
  private binaryQuantizer: BinaryQuantizer;
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
      headers: {
        timeout: this.CONNECTION_TIMEOUT.toString(),
      }
    });

    // ✅ Initialize with Binary Quantization
    this.semanticChunker = new SemanticChunker(384, 48);
    this.binaryQuantizer = new BinaryQuantizer(384);
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

    return "company";
  }

  async initialize(): Promise<void> {
    if (this.isConnected) return;
    try {
      console.log("[WeaviateService] Initializing with Binary Quantization...");
      this.embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
      await this.ensureSchema();
      await this.withRetry(async () => {
        await this._client.misc.metaGetter().do();
      }, "Connection test");
      this.isConnected = true;
      
      console.log("[WeaviateService] Connected successfully with Binary Quantization:");
      console.log(`  • Compression Ratio: ${this.binaryQuantizer.getCompressionRatio().toFixed(1)}x`);
      console.log("  • Using Hamming distance for binary similarity");
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
          description: "Search results with binary quantized embeddings",
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
            { name: "binaryCode", dataType: ["blob"] },
            { name: "quantizationMethod", dataType: ["text"] },
          ],
        },
        {
          class: "QueryIntent",
          vectorizer: "none",
          description: "User search queries with binary quantization",
          properties: [
            { name: "queryId", dataType: ["text"] },
            { name: "name", dataType: ["text"] },
            { name: "query", dataType: ["text"] },
            { name: "category", dataType: ["text"] },
            { name: "userId", dataType: ["text"] },
            { name: "createdAt", dataType: ["date"] },
            { name: "lastRun", dataType: ["date"] },
            { name: "binaryCode", dataType: ["blob"] },
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

  private async getEmbedding(text: string, contentHash?: string): Promise<{ vector: number[]; binaryCode: Uint8Array }> {
    this.cacheRequests++;
    const key = contentHash || this.hashText(text);
    const cached = this.vectorCache.get(key);
    
    if (cached && Date.now() - cached.timestamp < this.VECTOR_CACHE_TTL) {
      this.cacheHits++;
      return { vector: cached.vector, binaryCode: cached.binaryCode };
    }

    try {
      const embedding = await this.embedder(text.slice(0, 512), {
        pooling: "mean",
        normalize: true
      });
      
      const vectorArray = Array.from(embedding.data) as number[];
      const binaryCode = this.binaryQuantizer.quantize(vectorArray);
      
      this.cacheVectorWithBinary(key, vectorArray, binaryCode);
      return { vector: vectorArray, binaryCode };
    } catch (error) {
      console.error("[WeaviateService] Embedding generation failed:", error);
      throw error;
    }
  }

  private cacheVectorWithBinary(key: string, vector: number[], binaryCode: Uint8Array) {
    if (this.vectorCache.size >= this.MAX_CACHE_SIZE) {
      this.cleanupVectorCache();
    }
    this.vectorCache.set(key, { vector, binaryCode, timestamp: Date.now() });
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
      compressionRatio: this.binaryQuantizer.getCompressionRatio(),
      quantizationMethod: "Binary Quantization (BQ)",
      similarityMethod: "Hamming Distance"
    }; 
  }

  // ✅ CORRECTED: Semantic search using proper BQ methods
  async semanticSearch(
    query: string,
    userId: string,
    limit = 20,
    threshold = 0.7,
    category?: ExaCategory
  ): Promise<SearchHit[]> {
    if (!this.isConnected) await this.initialize();

    try {
      const { vector: queryVector, binaryCode: queryBinaryCode } = await this.getEmbedding(query);
      
      // Build where clause
      let whereClause;
      if (category) {
        whereClause = {
          operator: "And" as const,
          operands: [
            { path: ["userId"], operator: "Equal" as const, valueText: userId },
            { path: ["category"], operator: "Equal" as const, valueText: category }
          ]
        };
      } else {
        whereClause = {
          path: ["userId"],
          operator: "Equal" as const,
          valueText: userId
        };
      }

      // ✅ Use Weaviate's built-in vector search (it handles BQ internally)
      const result = await this.withRetry(async () => {
        return await this._client.graphql
          .get()
          .withClassName("SearchResult")
          .withFields(`
            url title snippet domain position score queryId timestamp contentHash category binaryCode
            _additional { certainty distance }
          `)
          .withNearVector({ vector: queryVector, certainty: threshold })
          .withWhere(whereClause)
          .withLimit(limit * 2) // Get more for binary reranking
          .do();
      }, "Binary quantized semantic search");

      const items = (result.data?.Get?.SearchResult || []) as any[];

      // ✅ CORRECTED: Use Hamming distance for binary reranking
      const rerankedItems = items
        .map((item: any) => {
          let similarity = item._additional?.certainty || 0;

          // If binary code is available, use Hamming distance
          if (item.binaryCode) {
            try {
              const itemBinaryCode = new Uint8Array(Buffer.from(item.binaryCode, 'base64'));
              const hammingDist = this.binaryQuantizer.hammingDistance(queryBinaryCode, itemBinaryCode);
              similarity = this.binaryQuantizer.hammingToSimilarity(hammingDist);
            } catch (error) {
              console.warn(`[WeaviateService] Binary similarity calculation failed:`, error);
            }
          }

          return {
            id: `${item.queryId}_${item.position}`,
            url: item.url,
            title: item.title,
            snippet: item.snippet,
            domain: item.domain,
            position: item.position,
            score: item.score,
            contentHash: item.contentHash,
            timestamp: new Date(item.timestamp),
            similarity,
            semanticDistance: item._additional?.distance || 0,
          };
        })
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);

      console.log(`[WeaviateService] Binary quantized search completed: ${rerankedItems.length} results`);
      return rerankedItems;
    } catch (error) {
      console.error("[WeaviateService] Binary quantized semantic search failed:", error);
      return [];
    }
  }

  // ✅ CORRECTED: Similar queries using proper BQ methods
  async findSimilarQueries(queryId: string, limit = 5): Promise<SimilarQuery[]> {
    if (!this.isConnected) await this.initialize();

    try {
      const ref = await this.withRetry(async () => {
        return await this._client.graphql
          .get()
          .withClassName("QueryIntent")
          .withFields("_additional { vector } binaryCode")
          .withWhere({ path: ["queryId"], operator: "Equal", valueText: queryId })
          .withLimit(1)
          .do();
      }, `Find reference for query ${queryId}`);

      const refItem = ref.data?.Get?.QueryIntent?.[0];
      if (!refItem) return [];

      const refVector = refItem._additional?.vector;
      const refBinaryCode = refItem.binaryCode 
        ? new Uint8Array(Buffer.from(refItem.binaryCode, 'base64'))
        : null;

      if (!refVector) return [];

      const similar = await this.withRetry(async () => {
        return await this._client.graphql
          .get()
          .withClassName("QueryIntent")
          .withFields(`
            queryId name query category userId createdAt lastRun binaryCode
            _additional { certainty }
          `)
          .withNearVector({ vector: refVector, certainty: 0.6 })
          .withWhere({ path: ["queryId"], operator: "NotEqual", valueText: queryId })
          .withLimit(limit * 2)
          .do();
      }, `Find similar queries for ${queryId}`);

      const results = (similar.data?.Get?.QueryIntent || []) as any[];

      // ✅ CORRECTED: Use Hamming distance for binary reranking
      const rerankedResults = results
        .map((item: any) => {
          let similarity = item._additional?.certainty || 0;

          if (refBinaryCode && item.binaryCode) {
            try {
              const itemBinaryCode = new Uint8Array(Buffer.from(item.binaryCode, 'base64'));
              const hammingDist = this.binaryQuantizer.hammingDistance(refBinaryCode, itemBinaryCode);
              similarity = this.binaryQuantizer.hammingToSimilarity(hammingDist);
            } catch (error) {
              console.warn(`[WeaviateService] Binary similarity failed:`, error);
            }
          }

          return {
            id: item.queryId,
            name: item.name,
            query: item.query,
            category: item.category,
            userId: item.userId,
            createdAt: new Date(item.createdAt),
            lastRun: item.lastRun ? new Date(item.lastRun) : undefined,
            similarity,
          };
        })
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);

      return rerankedResults;
    } catch (error) {
      console.error("[WeaviateService] Find similar queries failed:", error);
      return [];
    }
  }

  // ✅ ENHANCED SYNC METHODS (same as before, but clean)
  async syncSnapshot(snapshot: RankingSnapshot): Promise<void> {
    if (!this.isConnected) await this.initialize();

    try {
      const results = snapshot.results;
      const processedResults: any[] = [];
      
      console.log(`[WeaviateService] Processing ${results.length} results with Binary Quantization...`);

      for (let i = 0; i < results.length; i += this.BATCH_SIZE) {
        const batch = results.slice(i, i + this.BATCH_SIZE);
        
        const batchResults = await Promise.all(
          batch.map(async (result, batchIndex) => {
            try {
              const fullText = `${result.title || ""} ${result.snippet || ""}`.trim();
              if (!fullText) return [];

              const chunks = await this.semanticChunker.chunk(fullText);
              const category = this.inferExaCategory(result.domain || "", result.title || "", result.snippet || "");

              const chunkResults = await Promise.all(
                chunks.map(async (chunk, chunkIndex) => {
                  const { vector, binaryCode } = await this.getEmbedding(chunk, `${result.contentHash}_${chunkIndex}`);
                  
                  return {
                    class: "SearchResult",
                    properties: {
                      url: result.url || "",
                      title: result.title || "",
                      snippet: chunk,
                      domain: result.domain || "",
                      position: result.position || (i + batchIndex + 1),
                      score: result.score || 0,
                      queryId: snapshot.queryId,
                      snapshotId: snapshot.id,
                      userId: snapshot.userId || "",
                      timestamp: snapshot.timestamp.toISOString(),
                      contentHash: `${result.contentHash || ""}_chunk_${chunkIndex}`,
                      category,
                      binaryCode: Buffer.from(binaryCode).toString('base64'),
                      quantizationMethod: "BQ",
                    },
                    vector: vector,
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
        
        if (i + this.BATCH_SIZE < results.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      if (processedResults.length) {
        await this.withRetry(async () => {
          await this._client.batch.objectsBatcher().withObjects(...processedResults).do();
        }, `Binary quantized batch insert for snapshot ${snapshot.id}`);
        
        console.log(`[WeaviateService] Successfully synced ${processedResults.length} binary quantized chunks`);
      }
    } catch (error) {
      console.error(`[WeaviateService] Failed to sync snapshot ${snapshot.id}:`, error);
      throw error;
    }
  }

  async syncQuery(query: SimilarQuery): Promise<void> {
    if (!this.isConnected) await this.initialize();

    try {
      const { vector, binaryCode } = await this.getEmbedding(`${query.name} ${query.query}`);
      
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
            binaryCode: Buffer.from(binaryCode).toString('base64'),
          })
          .withVector(vector)
          .do();
      }, `Sync query ${query.id}`);
      
      console.log(`[WeaviateService] Synced query ${query.id} with Binary Quantization`);
    } catch (error) {
      console.error(`[WeaviateService] Failed to sync query ${query.id}:`, error);
      throw error;
    }
  }
}
