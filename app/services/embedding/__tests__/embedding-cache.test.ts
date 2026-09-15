import {
  EmbeddingCache,
  LruEmbeddingCache,
  createEmbeddingCacheKey,
  decodeCachedEmbedding,
  encodeCachedEmbedding,
  type EmbeddingCacheNamespace,
  type SharedEmbeddingStore,
} from "../embedding-cache"

const ns: EmbeddingCacheNamespace = {
  provider: "gemini",
  model: "model-a",
  task: "search",
  dimensions: 3,
  preparationVersion: "v1",
}
const request = (identity: string, namespace = ns) => ({ namespace, identity })

class SharedStore implements SharedEmbeddingStore {
  values = new Map<string, string>()
  reads = 0
  writes = 0
  ttl = 0
  failReads = false
  async mget(keys: string[]) {
    this.reads++
    if (this.failReads) throw new Error("offline")
    return keys.map(key => this.values.get(key) ?? null)
  }
  async mset(entries: Array<{ key: string; value: string }>, ttlSeconds: number) {
    this.writes++
    this.ttl = ttlSeconds
    entries.forEach(entry => this.values.set(entry.key, entry.value))
  }
}

describe("embedding cache", () => {
  test("Redis diagnostics are opt-in and distinguish acknowledged batches from write failures", async () => {
    const previous = process.env.EMBEDDING_CACHE_DEBUG
    const info = jest.spyOn(console, "info").mockImplementation(() => undefined)
    try {
      delete process.env.EMBEDDING_CACHE_DEBUG
      const shared = new SharedStore()
      const cache = new EmbeddingCache(new LruEmbeddingCache(10), shared, 123)
      await cache.getMany([request("private-content")])
      expect(info).not.toHaveBeenCalled()
      process.env.EMBEDDING_CACHE_DEBUG = "true"
      await cache.setMany([request("private-content")], [[1, 2, 3]])
      const restarted = new EmbeddingCache(new LruEmbeddingCache(10), shared)
      await restarted.getMany([request("private-content"), request("absent")])
      expect(info.mock.calls).toEqual(expect.arrayContaining([
        ["[EmbeddingCache] REDIS_WRITE_END", expect.objectContaining({ writtenCount: 1, success: true })],
        ["[EmbeddingCache] REDIS_READ_END", expect.objectContaining({ requestedCount: 2, hitCount: 1, missCount: 1 })],
      ]))
      info.mockClear()
      jest.spyOn(shared, "mset").mockRejectedValue(new Error("sensitive transport details"))
      await cache.setMany([request("other")], [[3, 2, 1]])
      const logs = JSON.stringify(info.mock.calls)
      expect(logs).toContain("REDIS_ERROR")
      expect(logs).not.toContain("REDIS_WRITE_END")
      expect(logs).not.toContain("sensitive transport details")
      expect(logs).not.toContain("private-content")
    } finally {
      info.mockRestore()
      if (previous === undefined) delete process.env.EMBEDDING_CACHE_DEBUG
      else process.env.EMBEDDING_CACHE_DEBUG = previous
    }
  })
  test("refreshes recency, evicts the least recently used item, and stays bounded", () => {
    const cache = new LruEmbeddingCache(2)
    cache.set("a", [1]); cache.set("b", [2]); expect(cache.get("a")).toEqual([1]); cache.set("c", [3])
    expect(cache.get("b")).toBeUndefined()
    expect(cache.get("a")).toEqual([1])
    expect(cache.size).toBe(2)
  })

  test("treats expired entries as misses", () => {
    let now = 0
    const cache = new LruEmbeddingCache(2, 10, () => now)
    cache.set("a", [1]); now = 10
    expect(cache.get("a")).toBeUndefined()
  })

  test("uses stable SHA-256 keys and isolates every namespace dimension", () => {
    const base = createEmbeddingCacheKey(request("same"))
    expect(base).toBe(createEmbeddingCacheKey(request("same")))
    expect(new Set([
      base,
      createEmbeddingCacheKey(request("else")),
      createEmbeddingCacheKey(request("same", { ...ns, provider: "openai" })),
      createEmbeddingCacheKey(request("same", { ...ns, model: "model-b" })),
      createEmbeddingCacheKey(request("same", { ...ns, task: "document" })),
      createEmbeddingCacheKey(request("same", { ...ns, dimensions: 4 })),
      createEmbeddingCacheKey(request("same", { ...ns, preparationVersion: "v2" })),
    ]).size).toBe(7)
    expect(base).toMatch(/^embedding:v1:[a-f0-9]{64}$/)
  })

  test("round-trips Float32 Base64 within tolerance", () => {
    const decoded = decodeCachedEmbedding(encodeCachedEmbedding(ns, [0.1, -2.5, 3.25]), ns)
    expect(decoded).not.toBeNull()
    expect(decoded![0]).toBeCloseTo(0.1, 6)
    expect(decoded!.slice(1)).toEqual([-2.5, 3.25])
  })

  test("rejects malformed, incompatible, dimension-mismatched, and non-finite payloads", () => {
    expect(decodeCachedEmbedding("bad", ns)).toBeNull()
    expect(decodeCachedEmbedding(encodeCachedEmbedding(ns, [1, 2, 3]), { ...ns, model: "other" })).toBeNull()
    expect(decodeCachedEmbedding(JSON.stringify({ version: 1, provider: "gemini", model: "model-a", dimensions: 3, encoding: "float32-base64", vector: "AA==", createdAt: new Date().toISOString() }), ns)).toBeNull()
    expect(() => encodeCachedEmbedding(ns, [1, Number.NaN, 3])).toThrow(/finite/)
  })

  test("uses one remote batch read, preserves order, and populates L1", async () => {
    const shared = new SharedStore()
    shared.values.set(createEmbeddingCacheKey(request("b")), encodeCachedEmbedding(ns, [2, 2, 2]))
    const cache = new EmbeddingCache(new LruEmbeddingCache(10), shared)
    const values = await cache.getMany([request("a"), request("b"), request("c")])
    expect(values).toEqual([null, [2, 2, 2], null])
    expect(shared.reads).toBe(1)
    expect((await cache.getMany([request("b")]))[0]).toEqual([2, 2, 2])
    expect(shared.reads).toBe(1)
  })

  test("fails open when Redis fails", async () => {
    const shared = new SharedStore(); shared.failReads = true
    const cache = new EmbeddingCache(new LruEmbeddingCache(10), shared)
    expect(await cache.getMany([request("a")])).toEqual([null])
    expect(cache.stats.redisFailures).toBe(1)
  })

  test("writes a batch through one pipeline-equivalent operation with TTL", async () => {
    const shared = new SharedStore()
    const cache = new EmbeddingCache(new LruEmbeddingCache(10), shared, 123)
    await cache.setMany([request("a"), request("b")], [[1, 2, 3], [4, 5, 6]])
    expect(shared.writes).toBe(1)
    expect(shared.ttl).toBe(123)
    expect(shared.values.size).toBe(2)
  })

  test("a second cache instance restores the same fixed content from Redis", async () => {
    const shared = new SharedStore()
    const first = new EmbeddingCache(new LruEmbeddingCache(10), shared)
    const fixed = request("fixed-snapshot-content-hash")
    expect(await first.getMany([fixed])).toEqual([null])
    await first.setMany([fixed], [[1, 2, 3]])

    const restarted = new EmbeddingCache(new LruEmbeddingCache(10), shared)
    expect(await restarted.getMany([fixed])).toEqual([[1, 2, 3]])
    expect(restarted.stats.redisHits).toBe(1)
  })

  test("deduplicates simultaneous provider work for one uncached identity", async () => {
    const cache = new EmbeddingCache(new LruEmbeddingCache(10), new SharedStore())
    let release!: (vectors: number[][]) => void
    const loader = jest.fn(() => new Promise<number[][]>(resolve => { release = resolve }))
    const fixed = request("same-content")
    const first = cache.resolveMany([fixed], loader)
    await Promise.resolve()
    const second = cache.resolveMany([fixed], loader)
    await Promise.resolve()
    release([[1, 2, 3]])

    await expect(first).resolves.toEqual([[1, 2, 3]])
    await expect(second).resolves.toEqual([[1, 2, 3]])
    expect(loader).toHaveBeenCalledTimes(1)
    expect(cache.stats.inflightHits).toBe(1)
  })

  test("debug events expose fingerprints but not the original identity", async () => {
    const previous = process.env.EMBEDDING_CACHE_DEBUG
    process.env.EMBEDDING_CACHE_DEBUG = "true"
    const info = jest.spyOn(console, "info").mockImplementation(() => undefined)
    try {
      const cache = new EmbeddingCache(new LruEmbeddingCache(10), new SharedStore())
      await cache.resolveMany([request("private query text")], async () => [[1, 2, 3]])
      const rendered = JSON.stringify(info.mock.calls)
      expect(rendered).toContain("L1_MISS")
      expect(rendered).toContain("REDIS_MISS")
      expect(rendered).toContain("PROVIDER_START")
      expect(rendered).toContain("PROVIDER_END")
      expect(rendered).toContain("REDIS_SET")
      expect(rendered).not.toContain("private query text")
    } finally {
      info.mockRestore()
      if (previous === undefined) delete process.env.EMBEDDING_CACHE_DEBUG
      else process.env.EMBEDDING_CACHE_DEBUG = previous
    }
  })
})
