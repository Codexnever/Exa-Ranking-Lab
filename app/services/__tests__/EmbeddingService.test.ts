import { EmbeddingService, type EmbeddingProviders } from "../EmbeddingService"
import { EmbeddingCache, LruEmbeddingCache, type SharedEmbeddingStore } from "../embedding/embedding-cache"

const vector = (value: number) => new Array(768).fill(value)

class MemoryStore implements SharedEmbeddingStore {
  values = new Map<string, string>()
  async mget(keys: string[]) { return keys.map(key => this.values.get(key) ?? null) }
  async mset(entries: Array<{ key: string; value: string }>) { entries.forEach(entry => this.values.set(entry.key, entry.value)) }
}

describe("EmbeddingService provider cache behavior", () => {
  test("a Redis miss calls Gemini, caches the result, and a later hit prevents a provider call", async () => {
    const gemini = jest.fn(async () => [vector(1)])
    const service = new EmbeddingService({
      cache: new EmbeddingCache(new LruEmbeddingCache(10), new MemoryStore()),
      providers: { gemini, openai: jest.fn() } as EmbeddingProviders,
    })
    expect((await service.embed("hello")).cached).toBe(false)
    expect((await service.embed("hello")).cached).toBe(true)
    expect(gemini).toHaveBeenCalledTimes(1)
  })

  test("Gemini and OpenAI namespaces cannot collide", async () => {
    const providers: EmbeddingProviders = {
      gemini: jest.fn().mockRejectedValue(new Error("down")),
      openai: jest.fn(async () => [vector(2)]),
    }
    const service = new EmbeddingService({ cache: new EmbeddingCache(new LruEmbeddingCache(10)), providers })
    const first = await service.embed("same")
    const second = await service.embed("same")
    expect(first.mode).toBe("openai")
    expect(second.mode).toBe("openai")
    expect(providers.gemini).toHaveBeenCalledTimes(2)
    expect(providers.openai).toHaveBeenCalledTimes(1)
  })

  test("does not cache invalid provider vectors and preserves position-only degradation", async () => {
    const providers: EmbeddingProviders = {
      gemini: jest.fn(async () => [[]]),
      openai: jest.fn().mockRejectedValue(new Error("down")),
    }
    const service = new EmbeddingService({ cache: new EmbeddingCache(new LruEmbeddingCache(10)), providers })
    expect(await service.embed("bad")).toEqual({ vector: [], mode: "position-only", cached: false })
    await service.embed("bad")
    expect(providers.gemini).toHaveBeenCalledTimes(2)
  })

  test("batch cache lookup restores exact input order", async () => {
    const gemini = jest.fn(async (texts: string[]) => texts.map(text => vector(text.charCodeAt(0))))
    const service = new EmbeddingService({
      cache: new EmbeddingCache(new LruEmbeddingCache(10), new MemoryStore()),
      providers: { gemini, openai: jest.fn() } as EmbeddingProviders,
    })
    await service.embed("b")
    const result = await service.embedBatch(["a", "b", "c"])
    expect(result.vectors.map(item => item?.[0])).toEqual([97, 98, 99])
    expect(gemini).toHaveBeenLastCalledWith(["a", "c"])
  })
})
