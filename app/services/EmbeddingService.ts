import { EmbeddingCache, type EmbeddingCacheNamespace, type EmbeddingCacheRequest, createEmbeddingCacheFromEnvironment } from "./embedding/embedding-cache"

const GEMINI_MODEL = "gemini-embedding-2-preview"
const OPENAI_MODEL = "text-embedding-3-small"
const OUTPUT_DIMENSIONS = 768
const MAX_CHARS = 16_000
const BATCH_LIMIT = 100

const namespace = (provider: "gemini" | "openai", model: string): EmbeddingCacheNamespace => ({
  provider,
  model,
  task: "sentence-similarity",
  dimensions: OUTPUT_DIMENSIONS,
  preparationVersion: "sentence-similarity-v1",
})
const GEMINI_NAMESPACE = namespace("gemini", GEMINI_MODEL)
const OPENAI_NAMESPACE = namespace("openai", OPENAI_MODEL)

export type EmbeddingMode = "gemini" | "openai" | "position-only"
export interface EmbeddingResult { vector: number[]; mode: EmbeddingMode; cached: boolean }
export interface BatchEmbeddingResult {
  vectors: (number[] | null)[]
  mode: EmbeddingMode
  cacheHits: number
  cacheMisses: number
}
export interface EmbeddingProviders {
  gemini(texts: string[]): Promise<number[][]>
  openai(texts: string[]): Promise<number[][]>
}
export interface EmbeddingServiceOptions { cache?: EmbeddingCache; providers?: EmbeddingProviders }

export class EmbeddingService {
  private readonly cache: EmbeddingCache
  private readonly providers: EmbeddingProviders

  constructor(options: EmbeddingServiceOptions = {}) {
    this.cache = options.cache ?? createEmbeddingCacheFromEnvironment()
    this.providers = options.providers ?? {
      gemini: texts => this.callGeminiBatch(texts),
      openai: texts => this.callOpenAIBatch(texts),
    }
  }

  async embed(text: string, contentHash?: string): Promise<EmbeddingResult> {
    const identity = contentHash ?? this.prepareText(text)
    const geminiRequest = this.request(GEMINI_NAMESPACE, identity)
    const [geminiHit] = await this.cache.getMany([geminiRequest])
    if (geminiHit) return { vector: geminiHit, mode: "gemini", cached: true }
    try {
      const [vector] = await this.providers.gemini([text])
      await this.cacheValid([geminiRequest], [vector])
      return { vector, mode: "gemini", cached: false }
    } catch (error) {
      this.logFailure("Gemini", error)
    }

    const openaiRequest = this.request(OPENAI_NAMESPACE, identity)
    const [openaiHit] = await this.cache.getMany([openaiRequest])
    if (openaiHit) return { vector: openaiHit, mode: "openai", cached: true }
    try {
      const [vector] = await this.providers.openai([text])
      await this.cacheValid([openaiRequest], [vector])
      return { vector, mode: "openai", cached: false }
    } catch (error) {
      this.logFailure("OpenAI", error)
      return { vector: [], mode: "position-only", cached: false }
    }
  }

  async embedBatch(texts: string[], contentHashes?: string[]): Promise<BatchEmbeddingResult> {
    if (contentHashes && contentHashes.length !== texts.length) throw new TypeError("contentHashes must align with texts")
    if (!texts.length) return { vectors: [], mode: "gemini", cacheHits: 0, cacheMisses: 0 }
    const identities = texts.map((text, index) => contentHashes?.[index] ?? this.prepareText(text))
    const requests = identities.map(identity => this.request(GEMINI_NAMESPACE, identity))
    const results = await this.cache.getMany(requests)
    const missing = results.flatMap((value, index) => value ? [] : [index])
    const initialHits = texts.length - missing.length
    if (!missing.length) return { vectors: results, mode: "gemini", cacheHits: initialHits, cacheMisses: 0 }

    try {
      const vectors = await this.providers.gemini(missing.map(index => texts[index]))
      this.assertBatch(vectors, missing.length)
      await this.cacheValid(missing.map(index => requests[index]), vectors)
      missing.forEach((index, offset) => { results[index] = vectors[offset] })
      return { vectors: results, mode: "gemini", cacheHits: initialHits, cacheMisses: missing.length }
    } catch (error) {
      this.logFailure("Gemini batch", error)
    }

    const fallbackRequests = missing.map(index => this.request(OPENAI_NAMESPACE, identities[index]))
    const fallbackHits = await this.cache.getMany(fallbackRequests)
    const fallbackMissing = fallbackHits.flatMap((value, index) => value ? [] : [index])
    fallbackHits.forEach((vector, offset) => { if (vector) results[missing[offset]] = vector })
    if (!fallbackMissing.length) {
      return { vectors: results, mode: "openai", cacheHits: initialHits + fallbackHits.length, cacheMisses: missing.length }
    }
    try {
      const vectors = await this.providers.openai(fallbackMissing.map(offset => texts[missing[offset]]))
      this.assertBatch(vectors, fallbackMissing.length)
      await this.cacheValid(fallbackMissing.map(offset => fallbackRequests[offset]), vectors)
      fallbackMissing.forEach((offset, vectorIndex) => { results[missing[offset]] = vectors[vectorIndex] })
      return {
        vectors: results,
        mode: "openai",
        cacheHits: initialHits + fallbackHits.filter(Boolean).length,
        cacheMisses: missing.length,
      }
    } catch (error) {
      this.logFailure("OpenAI batch", error)
      return {
        vectors: results,
        mode: "position-only",
        cacheHits: initialHits + fallbackHits.filter(Boolean).length,
        cacheMisses: missing.length,
      }
    }
  }

  get cacheStats() {
    const stats = this.cache.stats
    return { ...stats, lruSize: stats.l1Size, lruHitRate: stats.hitRate }
  }

  private request(namespaceValue: EmbeddingCacheNamespace, identity: string): EmbeddingCacheRequest {
    return { namespace: namespaceValue, identity }
  }

  private async cacheValid(requests: EmbeddingCacheRequest[], vectors: number[][]): Promise<void> {
    this.assertBatch(vectors, requests.length)
    await this.cache.setMany(requests, vectors)
  }

  private assertBatch(vectors: number[][], expected: number): void {
    if (vectors.length !== expected) throw new Error("Embedding provider returned an incomplete batch")
    if (vectors.some(vector => vector.length !== OUTPUT_DIMENSIONS || vector.some(value => !Number.isFinite(value)))) {
      throw new Error("Embedding provider returned an invalid vector")
    }
  }

  private prepareText(text: string): string {
    return `task: sentence similarity | query: ${text.slice(0, MAX_CHARS)}`
  }

  private async callGeminiBatch(texts: string[]): Promise<number[][]> {
    const key = process.env.GEMINI_API_KEY
    if (!key) throw new Error("GEMINI_API_KEY not set")
    const results: number[][] = []
    const base = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}`
    for (let index = 0; index < texts.length; index += BATCH_LIMIT) {
      const chunk = texts.slice(index, index + BATCH_LIMIT)
      const isSingle = chunk.length === 1
      const body = isSingle
        ? { model: `models/${GEMINI_MODEL}`, content: { parts: [{ text: this.prepareText(chunk[0]) }] }, outputDimensionality: OUTPUT_DIMENSIONS }
        : { requests: chunk.map(text => ({ model: `models/${GEMINI_MODEL}`, content: { parts: [{ text: this.prepareText(text) }] }, outputDimensionality: OUTPUT_DIMENSIONS })) }
      const response = await fetch(`${base}:${isSingle ? "embedContent" : "batchEmbedContents"}?key=${key}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      })
      if (!response.ok) throw new Error(`Gemini embedding request failed (${response.status})`)
      const data = await response.json()
      if (isSingle) results.push(data?.embedding?.values)
      else results.push(...(data?.embeddings ?? []).map((item: { values: number[] }) => item.values))
    }
    this.assertBatch(results, texts.length)
    return results
  }

  private async callOpenAIBatch(texts: string[]): Promise<number[][]> {
    const key = process.env.OPENAI_API_KEY
    if (!key) throw new Error("OPENAI_API_KEY not set")
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: OPENAI_MODEL, input: texts.map(text => text.slice(0, MAX_CHARS)), dimensions: OUTPUT_DIMENSIONS }),
    })
    if (!response.ok) throw new Error(`OpenAI embedding request failed (${response.status})`)
    const data = await response.json()
    const vectors = ((data?.data ?? []) as Array<{ embedding: number[]; index: number }>)
      .sort((a, b) => a.index - b.index).map(item => item.embedding)
    this.assertBatch(vectors, texts.length)
    return vectors
  }

  private logFailure(provider: string, error: unknown): void {
    const message = error instanceof Error ? error.message : "provider request failed"
    console.warn(`[EmbeddingService] ${provider} unavailable: ${message}`)
  }
}

let instance: EmbeddingService | null = null
export function getEmbeddingService(): EmbeddingService {
  if (!instance) instance = new EmbeddingService()
  return instance
}
