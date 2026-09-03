// lib/services/EmbeddingService.ts
//
// Single entry point for all embedding logic across the app.
// Replaces all direct fetchGeminiEmbedding / getBatchEmbeddings calls.
//
// Cache chain (fastest → slowest):
//   1. In-process LRU     — sub-ms, survives within one serverless invocation
//   2. Appwrite persistent — survives cold starts, cross-query dedup
//   3. Gemini (primary)   — gemini-embedding-2-preview, 768-dim
//   4. OpenAI (fallback)  — text-embedding-3-small, same 768-dim output
//   5. Position-only      — returns [] when both providers fail; caller
//                           must handle this gracefully (skip cosine sim)
//
// NOTE: Uses Appwrite for persistent cache (not Weaviate) because the free
// Weaviate Cloud plan allows only 1 collection, already used by ExaRankingData.

// ─── Constants ────────────────────────────────────────────────────────────────

// FIXED: was "gemini-embedding-2" (missing -preview suffix) which risks
// hitting an unstable/wrong model endpoint. Corrected to match the documented
// GA model ID used everywhere else in the codebase (weaviate-service.ts etc.)
const GEMINI_MODEL          = "gemini-embedding-2-preview"
const GEMINI_BASE           = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}`
const OUTPUT_DIMENSIONALITY = 768
const MAX_CHARS             = 16_000
const BATCH_LIMIT           = 100

const EMBED_CACHE_COLLECTION =
  process.env.COLLECTION_EMBEDDING_CACHE ?? "embedding_cache"

// ─── Types ──────────────────────────────────────────────────────────────────

export type EmbeddingMode = "gemini" | "openai" | "position-only"

export interface EmbeddingResult {
  vector: number[]
  mode:   EmbeddingMode
  cached: boolean
}

export interface BatchEmbeddingResult {
  vectors:     (number[] | null)[]
  mode:        EmbeddingMode
  cacheHits:   number
  cacheMisses: number
}

// ─── In-process LRU cache ────────────────────────────────────────────────────

interface LRUEntry { vector: number[]; timestamp: number; hits: number }

class LRUEmbeddingCache {
  private map           = new Map<string, LRUEntry>()
  private order:          string[] = []
  private totalRequests = 0
  private totalHits     = 0

  private readonly TTL      = 24 * 60 * 60 * 1000
  private readonly MAX_SIZE = 2000

  get(key: string): number[] | null {
    this.totalRequests++
    const entry = this.map.get(key)
    if (!entry) return null
    if (Date.now() - entry.timestamp > this.TTL) { this.evict(key); return null }
    entry.hits++
    this.totalHits++
    return entry.vector
  }

  set(key: string, vector: number[]): void {
    if (this.map.has(key)) {
      this.order = this.order.filter(k => k !== key)
    } else if (this.map.size >= this.MAX_SIZE) {
      const oldest = this.order.shift()
      if (oldest) this.map.delete(oldest)
    }
    this.map.set(key, { vector, timestamp: Date.now(), hits: 1 })
    this.order.push(key)
  }

  private evict(key: string): void {
    this.map.delete(key)
    this.order = this.order.filter(k => k !== key)
  }

  get hitRate(): number {
    return this.totalRequests > 0 ? this.totalHits / this.totalRequests : 0
  }

  get size(): number { return this.map.size }
}

// ─── EmbeddingService ────────────────────────────────────────────────────────

export class EmbeddingService {
  private lru = new LRUEmbeddingCache()

  // ── Public API ─────────────────────────────────────────────────────────────

  async embed(text: string, contentHash?: string): Promise<EmbeddingResult> {
    const cacheKey = contentHash ?? this.hashText(text)

    // 1. In-process LRU
    const lruHit = this.lru.get(cacheKey)
    if (lruHit) return { vector: lruHit, mode: "gemini", cached: true }

    // 2. Appwrite persistent cache
    const appwriteHit = await this.getFromAppwriteCache(cacheKey)
    if (appwriteHit) {
      this.lru.set(cacheKey, appwriteHit)
      return { vector: appwriteHit, mode: "gemini", cached: true }
    }

    // 3. Gemini (primary)
    try {
      const vector = await this.callGemini(text)
      this.lru.set(cacheKey, vector)
      this.storeInAppwriteCache(cacheKey, vector).catch(() => {})
      return { vector, mode: "gemini", cached: false }
    } catch (geminiErr) {
      console.warn("[EmbeddingService] Gemini failed, trying OpenAI:", geminiErr)
    }

    // 4. OpenAI fallback
    try {
      const vector = await this.callOpenAI(text)
      this.lru.set(cacheKey, vector)
      this.storeInAppwriteCache(cacheKey, vector).catch(() => {})
      return { vector, mode: "openai", cached: false }
    } catch (openaiErr) {
      console.warn("[EmbeddingService] OpenAI also failed:", openaiErr)
    }

    // 5. Position-only degradation
    return { vector: [], mode: "position-only", cached: false }
  }

  async embedBatch(
    texts:          string[],
    contentHashes?: string[]
  ): Promise<BatchEmbeddingResult> {
    console.log("I am in Embedding Service")
    const results:         (number[] | null)[] = new Array(texts.length).fill(null)
    const uncachedTexts:   string[]            = []
    const uncachedKeys:    string[]            = []
    const uncachedIndices: number[]            = []
    let   cacheHits = 0

    for (let i = 0; i < texts.length; i++) {
      const key = contentHashes?.[i] ?? this.hashText(texts[i])

      const lruHit = this.lru.get(key)
      if (lruHit) { results[i] = lruHit; cacheHits++; continue }

      const appwriteHit = await this.getFromAppwriteCache(key)
      if (appwriteHit) {
        results[i] = appwriteHit
        this.lru.set(key, appwriteHit)
        cacheHits++
        continue
      }

      uncachedTexts.push(texts[i])
      uncachedKeys.push(key)
      uncachedIndices.push(i)
    }

    if (uncachedTexts.length === 0) {
      return { vectors: results, mode: "gemini", cacheHits, cacheMisses: 0 }
    }

    let vectors: number[][] = []
    let mode: EmbeddingMode = "gemini"

    try {
      vectors = await this.callGeminiBatch(uncachedTexts)
    } catch {
      console.warn("[EmbeddingService] Gemini batch failed, trying OpenAI batch")
      try {
        vectors = await this.callOpenAIBatch(uncachedTexts)
        mode    = "openai"
      } catch {
        console.warn("[EmbeddingService] Both providers failed — position-only mode")
        return { vectors: results, mode: "position-only", cacheHits, cacheMisses: uncachedTexts.length }
      }
    }

    for (let j = 0; j < uncachedIndices.length; j++) {
      const i = uncachedIndices[j]
      if (vectors[j]?.length) {
        results[i] = vectors[j]
        this.lru.set(uncachedKeys[j], vectors[j])
        this.storeInAppwriteCache(uncachedKeys[j], vectors[j]).catch(() => {})
      }
    }

    return { vectors: results, mode, cacheHits, cacheMisses: uncachedTexts.length }
  }

  get cacheStats() {
    return { lruSize: this.lru.size, lruHitRate: this.lru.hitRate }
  }

  // ── Appwrite persistent cache ──────────────────────────────────────────────

  private async getFromAppwriteCache(contentHash: string): Promise<number[] | null> {
    try {
      const { databases, DATABASE_ID, Query } = await import("@/app/server/appwrite/appwrite-server")
      const result = await databases.listDocuments(
        DATABASE_ID,
        EMBED_CACHE_COLLECTION,
        [Query.equal("contentHash", contentHash), Query.limit(1)]
      )
      const doc = result.documents[0]
      if (!doc?.vector) return null
      const parsed = JSON.parse(doc.vector as string) as number[]
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : null
    } catch {
      return null
    }
  }

  private async storeInAppwriteCache(
    contentHash: string,
    vector:      number[]
  ): Promise<void> {
    try {
      const { databases, DATABASE_ID } = await import("@/app/server/appwrite/appwrite-server")
      await databases.createDocument(
        DATABASE_ID,
        EMBED_CACHE_COLLECTION,
        this.createCacheDocumentId(),
        {
          contentHash,
          vector:   JSON.stringify(vector),
          storedAt: new Date().toISOString(),
        }
      )
    } catch (err: unknown) {
      const error = err as { code?: number; message?: string }
      if (error.code !== 409) {
        console.warn("[EmbeddingService] Appwrite cache store failed:", error.message)
      }
    }
  }

  private createCacheDocumentId(): string {
    // Appwrite accepts IDs up to 36 characters; a UUID without separators is
    // 32 lowercase hexadecimal characters and remains cryptographically unique.
    return globalThis.crypto.randomUUID().replaceAll("-", "")
  }

  // ── Gemini API ─────────────────────────────────────────────────────────────

  private async callGemini(text: string): Promise<number[]> {
    const key = this.getGeminiKey()
    const res = await fetch(`${GEMINI_BASE}:embedContent?key=${key}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model:                `models/${GEMINI_MODEL}`,
        content:              { parts: [{ text: this.prepareText(text) }] },
        outputDimensionality: OUTPUT_DIMENSIONALITY,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(`[EmbeddingService] Gemini ${res.status}: ${err?.error?.message ?? res.statusText}`)
    }
    const data   = await res.json()
    const values = data?.embedding?.values as number[] | undefined
    if (!values?.length) throw new Error("[EmbeddingService] Gemini returned empty embedding")
    return values
  }

  private async callGeminiBatch(texts: string[]): Promise<number[][]> {
    const key     = this.getGeminiKey()
    const results: number[][] = []

    for (let i = 0; i < texts.length; i += BATCH_LIMIT) {
      const chunk = texts.slice(i, i + BATCH_LIMIT)
      const res   = await fetch(`${GEMINI_BASE}:batchEmbedContents?key=${key}`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: chunk.map(text => ({
            model:                `models/${GEMINI_MODEL}`,
            content:              { parts: [{ text: this.prepareText(text) }] },
            outputDimensionality: OUTPUT_DIMENSIONALITY,
          })),
        }),
      })
      if (!res.ok) {
        console.warn(`[EmbeddingService] Gemini batch chunk ${res.status}, falling back to sequential`)
        const fallback = await Promise.all(chunk.map(t => this.callGemini(t)))
        results.push(...fallback)
        continue
      }
      const data       = await res.json()
      const embeddings = data?.embeddings as Array<{ values: number[] }> | undefined
      if (!embeddings?.length) throw new Error("[EmbeddingService] Gemini batch returned empty")
      results.push(...embeddings.map(e => e.values))
    }

    return results
  }

  // ── OpenAI fallback ────────────────────────────────────────────────────────

  private async callOpenAI(text: string): Promise<number[]> {
    const key = this.getOpenAIKey()
    console.log("Calling OpenAI from EmbeddingService")
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method:  "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({
        model:      "text-embedding-3-small",
        input:      text.slice(0, MAX_CHARS),
        dimensions: OUTPUT_DIMENSIONALITY,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(`[EmbeddingService] OpenAI ${res.status}: ${err?.error?.message ?? res.statusText}`)
    }
    const data   = await res.json()
    const values = data?.data?.[0]?.embedding as number[] | undefined
    if (!values?.length) throw new Error("[EmbeddingService] OpenAI returned empty embedding")
    return values
  }

  private async callOpenAIBatch(texts: string[]): Promise<number[][]> {
    const key = this.getOpenAIKey()
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method:  "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({
        model:      "text-embedding-3-small",
        input:      texts.map(t => t.slice(0, MAX_CHARS)),
        dimensions: OUTPUT_DIMENSIONALITY,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(`[EmbeddingService] OpenAI batch ${res.status}: ${err?.error?.message ?? res.statusText}`)
    }
    const data  = await res.json()
    const items = data?.data as Array<{ embedding: number[]; index: number }> | undefined
    if (!items?.length) throw new Error("[EmbeddingService] OpenAI batch returned empty")
    return items.sort((a, b) => a.index - b.index).map(i => i.embedding)
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private prepareText(text: string): string {
    return `task: sentence similarity | query: ${text.slice(0, MAX_CHARS)}`
  }

  private getGeminiKey(): string {
    const key = process.env.GEMINI_API_KEY
    if (!key) throw new Error("[EmbeddingService] GEMINI_API_KEY not set")
    return key
  }

  private getOpenAIKey(): string {
    const key = process.env.OPENAI_API_KEY
    if (!key) throw new Error("[EmbeddingService] OPENAI_API_KEY not set (OpenAI fallback unavailable)")
    return key
  }

  private hashText(text: string): string {
    let h = 0
    for (let i = 0; i < text.length; i++) h = ((h << 5) - h + text.charCodeAt(i)) | 0
    return `t_${h}_${text.length}`
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _instance: EmbeddingService | null = null

export function getEmbeddingService(): EmbeddingService {
  if (!_instance) _instance = new EmbeddingService()
  return _instance
}
