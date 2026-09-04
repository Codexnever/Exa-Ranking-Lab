import { createHash } from "node:crypto"
import { Redis } from "@upstash/redis"

export type EmbeddingProvider = "gemini" | "openai"

export interface EmbeddingCacheNamespace {
  provider: EmbeddingProvider
  model: string
  task: string
  dimensions: number
  preparationVersion: string
}

export interface EmbeddingCacheRequest {
  namespace: EmbeddingCacheNamespace
  identity: string
}

export interface CachedEmbeddingPayload {
  version: 1
  provider: EmbeddingProvider
  model: string
  dimensions: number
  encoding: "float32-base64"
  vector: string
  createdAt: string
}

export interface SharedEmbeddingStore {
  mget(keys: string[]): Promise<unknown[]>
  mset(entries: Array<{ key: string; value: string }>, ttlSeconds: number): Promise<void>
}

export interface EmbeddingCacheStats {
  l1Size: number
  l1MaxSize: number
  l1Hits: number
  redisHits: number
  totalRequests: number
  totalMisses: number
  redisFailures: number
  hitRate: number
  redisConfigured: boolean
}

interface LruEntry {
  vector: number[]
  expiresAt: number
}

export class LruEmbeddingCache {
  private readonly entries = new Map<string, LruEntry>()

  constructor(
    private readonly maxSize = 256,
    private readonly ttlMs = 24 * 60 * 60 * 1000,
    private readonly now: () => number = Date.now,
  ) {
    if (!Number.isInteger(maxSize) || maxSize < 1) throw new TypeError("maxSize must be positive")
    if (!Number.isFinite(ttlMs) || ttlMs < 1) throw new TypeError("ttlMs must be positive")
  }

  get(key: string): number[] | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key)
      return undefined
    }
    this.entries.delete(key)
    this.entries.set(key, entry)
    return [...entry.vector]
  }

  set(key: string, vector: number[]): void {
    validateVector(vector)
    this.entries.delete(key)
    this.entries.set(key, { vector: [...vector], expiresAt: this.now() + this.ttlMs })
    while (this.entries.size > this.maxSize) {
      const oldest = this.entries.keys().next().value as string | undefined
      if (oldest === undefined) break
      this.entries.delete(oldest)
    }
  }

  get size(): number { return this.entries.size }
  get capacity(): number { return this.maxSize }
}

export function createEmbeddingCacheKey(request: EmbeddingCacheRequest): string {
  const { namespace, identity } = request
  if (!identity) throw new TypeError("Embedding cache identity is required")
  const material = JSON.stringify({
    schema: 1,
    provider: namespace.provider,
    model: namespace.model,
    task: namespace.task,
    dimensions: namespace.dimensions,
    preparationVersion: namespace.preparationVersion,
    identity,
  })
  return `embedding:v1:${createHash("sha256").update(material, "utf8").digest("hex")}`
}

export function encodeCachedEmbedding(
  namespace: EmbeddingCacheNamespace,
  vector: number[],
  createdAt = new Date(),
): string {
  validateVector(vector, namespace.dimensions)
  const bytes = Buffer.allocUnsafe(vector.length * Float32Array.BYTES_PER_ELEMENT)
  vector.forEach((value, index) => bytes.writeFloatLE(value, index * 4))
  const payload: CachedEmbeddingPayload = {
    version: 1,
    provider: namespace.provider,
    model: namespace.model,
    dimensions: namespace.dimensions,
    encoding: "float32-base64",
    vector: bytes.toString("base64"),
    createdAt: createdAt.toISOString(),
  }
  return JSON.stringify(payload)
}

export function decodeCachedEmbedding(
  value: unknown,
  namespace: EmbeddingCacheNamespace,
): number[] | null {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null
    const payload = parsed as Partial<CachedEmbeddingPayload>
    if (
      payload.version !== 1 ||
      payload.provider !== namespace.provider ||
      payload.model !== namespace.model ||
      payload.dimensions !== namespace.dimensions ||
      payload.encoding !== "float32-base64" ||
      typeof payload.vector !== "string" ||
      typeof payload.createdAt !== "string" ||
      !Number.isFinite(Date.parse(payload.createdAt))
    ) return null
    const bytes = Buffer.from(payload.vector, "base64")
    if (bytes.length !== namespace.dimensions * 4) return null
    const vector = Array.from({ length: namespace.dimensions }, (_, index) => bytes.readFloatLE(index * 4))
    validateVector(vector, namespace.dimensions)
    return vector
  } catch {
    return null
  }
}

export class EmbeddingCache {
  private l1Hits = 0
  private redisHits = 0
  private totalRequests = 0
  private totalMisses = 0
  private redisFailures = 0

  constructor(
    private readonly l1 = new LruEmbeddingCache(),
    private readonly shared?: SharedEmbeddingStore,
    private readonly ttlSeconds = 7 * 24 * 60 * 60,
  ) {}

  async getMany(requests: EmbeddingCacheRequest[]): Promise<Array<number[] | null>> {
    this.totalRequests += requests.length
    const results: Array<number[] | null> = new Array(requests.length).fill(null)
    const misses: Array<{ index: number; key: string; request: EmbeddingCacheRequest }> = []
    requests.forEach((request, index) => {
      const key = createEmbeddingCacheKey(request)
      const local = this.l1.get(key)
      if (local) {
        this.l1Hits++
        results[index] = local
      } else {
        misses.push({ index, key, request })
      }
    })
    if (misses.length && this.shared) {
      try {
        const values = await this.shared.mget(misses.map(miss => miss.key))
        misses.forEach((miss, remoteIndex) => {
          const vector = decodeCachedEmbedding(values[remoteIndex], miss.request.namespace)
          if (!vector) return
          this.redisHits++
          this.l1.set(miss.key, vector)
          results[miss.index] = vector
        })
      } catch {
        this.redisFailures++
      }
    }
    this.totalMisses += results.filter(result => result === null).length
    return results
  }

  async setMany(requests: EmbeddingCacheRequest[], vectors: number[][]): Promise<void> {
    if (requests.length !== vectors.length) throw new TypeError("Cache requests and vectors must align")
    const entries: Array<{ key: string; value: string }> = []
    requests.forEach((request, index) => {
      const vector = vectors[index]
      validateVector(vector, request.namespace.dimensions)
      const key = createEmbeddingCacheKey(request)
      this.l1.set(key, vector)
      entries.push({ key, value: encodeCachedEmbedding(request.namespace, vector) })
    })
    if (!entries.length || !this.shared) return
    try {
      await this.shared.mset(entries, this.ttlSeconds)
    } catch {
      this.redisFailures++
    }
  }

  get stats(): EmbeddingCacheStats {
    const hits = this.l1Hits + this.redisHits
    return {
      l1Size: this.l1.size,
      l1MaxSize: this.l1.capacity,
      l1Hits: this.l1Hits,
      redisHits: this.redisHits,
      totalRequests: this.totalRequests,
      totalMisses: this.totalMisses,
      redisFailures: this.redisFailures,
      hitRate: this.totalRequests ? hits / this.totalRequests : 0,
      redisConfigured: Boolean(this.shared),
    }
  }
}

class UpstashSharedEmbeddingStore implements SharedEmbeddingStore {
  constructor(private readonly redis: Redis, private readonly timeoutMs = 1_500) {}

  async mget(keys: string[]): Promise<unknown[]> {
    if (!keys.length) return []
    return this.withTimeout(this.redis.mget(...keys))
  }

  async mset(entries: Array<{ key: string; value: string }>, ttlSeconds: number): Promise<void> {
    const pipeline = this.redis.pipeline()
    entries.forEach(entry => pipeline.set(entry.key, entry.value, { ex: ttlSeconds }))
    await this.withTimeout(pipeline.exec())
  }

  private async withTimeout<T>(operation: Promise<T>): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        operation,
        new Promise<T>((_, reject) => {
          timeout = setTimeout(() => reject(new Error("Redis embedding cache timed out")), this.timeoutMs)
        }),
      ])
    } finally {
      if (timeout) clearTimeout(timeout)
    }
  }
}

let warnedMissingRedis = false

export function createEmbeddingCacheFromEnvironment(): EmbeddingCache {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim()
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  const parsedTtl = Number(process.env.EMBEDDING_CACHE_TTL_SECONDS)
  const ttlSeconds = Number.isInteger(parsedTtl) && parsedTtl > 0 ? parsedTtl : 7 * 24 * 60 * 60
  let shared: SharedEmbeddingStore | undefined
  if (url && token) {
    shared = new UpstashSharedEmbeddingStore(new Redis({ url, token, retry: false }))
  } else if (!warnedMissingRedis) {
    warnedMissingRedis = true
    console.info("[EmbeddingCache] Upstash is not configured; using process-local cache only")
  }
  return new EmbeddingCache(new LruEmbeddingCache(256), shared, ttlSeconds)
}

function validateVector(vector: number[], dimensions?: number): void {
  if (!Array.isArray(vector) || vector.length === 0) throw new TypeError("Embedding vector must not be empty")
  if (dimensions !== undefined && vector.length !== dimensions) throw new TypeError("Embedding dimensions do not match")
  if (vector.some(value => !Number.isFinite(value))) throw new TypeError("Embedding vector must contain finite values")
}
