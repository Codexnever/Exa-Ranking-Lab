// app/services/weaviate-service.ts
//
// Uses Google Gemini Embedding 2 (gemini-embedding-2-preview) for vectors.
// Requires: GEMINI_API_KEY, WEAVIATE_URL, WEAVIATE_API_KEY env vars.
//
// ⚠️  UNIFIED SCHEMA: this Weaviate instance has a 1-collection limit
//     (USAGE_LIMIT_EXCEEDED on 2nd class creation). All record types
//     (search results, query intents, drift patterns) live in a SINGLE
//     collection "ExaRankingData" distinguished by a `recordType` property.
//
//     If you previously ran the old 3-class version and it partially
//     created "SearchResult" / "QueryIntent" / "DriftPattern" classes,
//     DELETE THOSE from the Weaviate console — they occupy your only
//     collection slot and will block creation of "ExaRankingData".

import weaviate, { WeaviateClient, ApiKey } from "weaviate-ts-client"
import type { RankingSnapshot, QueryConfig } from "@/types/type"
import { getDocumentIdentity } from "@/utils/canonicalize-document-url"

// ─── Public types ─────────────────────────────────────────────────────────────

export interface SimilarQuery {
  id:         string
  name:       string
  query:      string
  category:   QueryConfig["category"]
  userId:     string
  createdAt:  Date
  lastRun?:   Date
  similarity: number
}

export interface SearchHit {
  id:                string
  url:               string
  title:             string
  snippet:           string
  domain:            string
  position:          number
  score:             number
  contentHash:       string
  timestamp:         Date
  similarity:        number
  semanticDistance:  number
}

type ExaCategory =
  | "company" | "research paper" | "news" | "pdf"
  | "github" | "tweet" | "personal site"
  | "linkedin profile" | "financial report"

type RecordType = "search_result" | "query_intent" | "drift_pattern"

export interface SemanticSearchScope {
  sourceQueryId: string
  snapshotIds: string[]
}

interface SearchWhereOperand {
  path?: string[]
  operator: "Equal" | "Or"
  valueText?: string
  operands?: SearchWhereOperand[]
}

const SEARCH_CANDIDATE_MULTIPLIER = 10
const MIN_SEARCH_CANDIDATES = 40
const MAX_SEARCH_CANDIDATES = 1000

export function buildSearchResultWhere(
  userId: string,
  category?: ExaCategory,
  scope?: SemanticSearchScope,
) {
  if (
    scope &&
    (!scope.sourceQueryId.trim() ||
      !scope.snapshotIds.length ||
      scope.snapshotIds.some(snapshotId => !snapshotId.trim()))
  ) {
    throw new TypeError("Semantic search scope requires a source query and snapshot IDs")
  }
  const operands: SearchWhereOperand[] = [
    { path: ["recordType"], operator: "Equal", valueText: "search_result" },
    { path: ["userId"], operator: "Equal", valueText: userId },
  ]
  if (category) operands.push({ path: ["category"], operator: "Equal", valueText: category })
  if (scope) {
    operands.push({ path: ["queryId"], operator: "Equal", valueText: scope.sourceQueryId })
    operands.push(scope.snapshotIds.length === 1
      ? { path: ["snapshotId"], operator: "Equal", valueText: scope.snapshotIds[0] }
      : {
          operator: "Or",
          operands: scope.snapshotIds.map(snapshotId => ({
            path: ["snapshotId"],
            operator: "Equal",
            valueText: snapshotId,
          })),
        })
  }
  return { operator: "And" as const, operands }
}

export function takeUniqueCanonicalSearchHits<T extends { url: string }>(
  ranked: T[],
  limit: number,
): T[] {
  const seen = new Set<string>()
  const unique: T[] = []
  for (const hit of ranked) {
    let key: string
    try {
      key = getDocumentIdentity(hit.url).documentKey
    } catch {
      key = `raw:${hit.url.trim()}`
    }
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(hit)
    if (unique.length === limit) break
  }
  return unique
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function arrMin(arr: number[]): number { return arr.reduce((m, v) => v < m ? v : m, arr[0] ?? 0) }
function arrMax(arr: number[]): number { return arr.reduce((m, v) => v > m ? v : m, arr[0] ?? 0) }

/**
 * Extract a readable message from any error shape.
 *
 * weaviate-ts-client and fetch-based clients throw inconsistent error
 * shapes — sometimes `Error` with a useful message, sometimes a plain
 * object `{ message, code }`, sometimes just a status code as a string.
 * This normalises all of them into one readable string so logs always
 * show WHICH service (Weaviate vs Gemini) and WHY, instead of a bare "429".
 */
function formatError(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === "string") return err
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>
    const parts: string[] = []
    if (e.message)    parts.push(String(e.message))
    if (e.code)        parts.push(`code=${e.code}`)
    if (e.status)      parts.push(`status=${e.status}`)
    if (e.errorCode)   parts.push(`errorCode=${e.errorCode}`)
    if (parts.length)  return parts.join(" | ")
    try { return JSON.stringify(e) } catch { return String(e) }
  }
  return String(err)
}

// ─── Gemini Embedding 2 ────────────────────────────────────────────────────────
//
// Model: gemini-embedding-2-preview (GA April 2026)
//   - 8192 token input limit (~32000 chars; we cap at 16000 for safety)
//   - Flexible output dimensions 128–3072; we use 768
//   - taskType: SEMANTIC_SIMILARITY — chosen for symmetry, since BQ/PQ
//     Hamming/ADC distances assume query and document vectors live in
//     the same metric space. RETRIEVAL_DOCUMENT/RETRIEVAL_QUERY produce
//     asymmetric embeddings that could improve search relevance but would
//     require re-embedding all stored vectors if adopted later.

const GEMINI_MODEL  = "gemini-embedding-2-preview"
const GEMINI_BASE   = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}`
const GEMINI_DIM    = 768
const GEMINI_MAX_CHARS = 16_000
const GEMINI_BATCH_LIMIT = 100

function getGeminiApiKey(): string {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error("[WeaviateService] GEMINI_API_KEY not set")
  return key
}

async function fetchGeminiEmbedding(text: string): Promise<number[]> {
  const key = getGeminiApiKey()
  const res = await fetch(`${GEMINI_BASE}:embedContent?key=${key}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model:    `models/${GEMINI_MODEL}`,
      content:  { parts: [{ text: text.slice(0, GEMINI_MAX_CHARS) }] },
      taskType: "SEMANTIC_SIMILARITY",
      outputDimensionality: GEMINI_DIM,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`[Gemini] embedContent failed (${res.status}): ${err?.error?.message ?? res.statusText}`)
  }
  const data = await res.json()
  const values = data?.embedding?.values as number[] | undefined
  if (!values?.length) throw new Error("[Gemini] empty embedding returned")
  return values
}

async function fetchGeminiBatchEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []
  if (texts.length === 1) return [await fetchGeminiEmbedding(texts[0])]

  const key = getGeminiApiKey()
  const results: number[][] = []

  for (let i = 0; i < texts.length; i += GEMINI_BATCH_LIMIT) {
    const chunk = texts.slice(i, i + GEMINI_BATCH_LIMIT)
    const res = await fetch(`${GEMINI_BASE}:batchEmbedContents?key=${key}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: chunk.map(text => ({
          model:    `models/${GEMINI_MODEL}`,
          content:  { parts: [{ text: text.slice(0, GEMINI_MAX_CHARS) }] },
          taskType: "SEMANTIC_SIMILARITY",
          outputDimensionality: GEMINI_DIM,
        })),
      }),
    })

    if (!res.ok) {
      console.warn(`[Gemini] batchEmbedContents failed (${res.status}), falling back to sequential`)
      results.push(...await Promise.all(chunk.map(fetchGeminiEmbedding)))
      continue
    }

    const data = await res.json()
    const embeddings = data?.embeddings as Array<{ values: number[] }> | undefined
    if (!embeddings?.length) throw new Error("[Gemini] batchEmbedContents returned empty response")
    results.push(...embeddings.map(e => e.values))
  }

  return results
}

// ─── Token-aware chunker ──────────────────────────────────────────────────────

class TokenAwareChunker {
  constructor(
    private maxTokens      = 380,
    private overlapTokens  = 40,
    private minChunkTokens = 120
  ) {}

  async chunk(text: string): Promise<string[]> {
    if (!text?.trim()) return []

    const blocks = text
      .split(/\n{2,}/g)
      .flatMap(blk => blk.split(/(?=^#{1,6}\s)|(?=^\S.*:\s*$)/gm))
      .map(x => x.trim())
      .filter(Boolean)

    const chunks: string[] = []
    let buf: string[] = []
    let bufTokens = 0

    const pushBuf = (force = false) => {
      if (!buf.length) return
      if (force || bufTokens >= this.minChunkTokens) {
        chunks.push(buf.join("\n"))
        if (this.overlapTokens > 0) {
          const back = this.takeLastTokens(buf.join("\n"), this.overlapTokens)
          buf       = back ? [back] : []
          bufTokens = this.estimateTokens(back)
        } else {
          buf = []; bufTokens = 0
        }
      }
    }

    for (const block of blocks) {
      const tok = this.estimateTokens(block)
      if (tok > this.maxTokens) {
        const sentences = block
          .replace(/([.!?])\s+(?=[A-Z(])/g, "$1|S|")
          .split("|S|").map(s => s.trim()).filter(Boolean)
        let cur: string[] = [], curTok = 0
        for (const s of sentences) {
          const sTok = this.estimateTokens(s)
          if (curTok + sTok > this.maxTokens && cur.length) {
            const merged = cur.join(" ")
            buf.push(merged); bufTokens += this.estimateTokens(merged)
            if (bufTokens >= this.maxTokens) pushBuf(true)
            cur = []; curTok = 0
          }
          cur.push(s); curTok += sTok
        }
        if (cur.length) {
          const merged = cur.join(" ")
          buf.push(merged); bufTokens += this.estimateTokens(merged)
          if (bufTokens >= this.maxTokens) pushBuf(true)
        }
      } else {
        if (bufTokens + tok > this.maxTokens) pushBuf(true)
        buf.push(block); bufTokens += tok
      }
    }
    pushBuf(true)
    return chunks
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.split(/\s+/).filter(Boolean).length * 0.75)
  }

  private takeLastTokens(text: string, t: number): string {
    const words = text.split(/\s+/).filter(Boolean)
    return words.slice(-Math.ceil(t / 0.75)).join(" ")
  }
}

// ─── Binary quantizer ─────────────────────────────────────────────────────────

class BinaryQuantizer {
  private readonly BPB = 8
  constructor(private dimension: number) {}

  quantize(vector: number[]): Uint8Array {
    if (vector.length !== this.dimension)
      throw new Error(`BQ dim mismatch: expected ${this.dimension}, got ${vector.length}`)
    const bytes = new Uint8Array(Math.ceil(this.dimension / this.BPB))
    for (let i = 0; i < this.dimension; i++) {
      if (vector[i] > 0) bytes[(i / this.BPB) | 0] |= 1 << (7 - (i % this.BPB))
    }
    return bytes
  }

  dequantize(bytes: Uint8Array): number[] {
    const v = new Array(this.dimension).fill(0)
    for (let i = 0; i < this.dimension; i++) {
      const mask = 1 << (7 - (i % this.BPB))
      v[i] = bytes[(i / this.BPB) | 0] & mask ? 1 : -1
    }
    return v
  }

  hammingDistance(a: Uint8Array, b: Uint8Array): number {
    if (a.length !== b.length) return -1
    let d = 0
    for (let i = 0; i < a.length; i++) d += this.popCount(a[i] ^ b[i])
    return d
  }

  hammingToSimilarity(hd: number): number {
    if (hd < 0) return 0
    return 1 - hd / this.dimension
  }

  getCompressionRatio(): number {
    return (this.dimension * 4) / Math.ceil(this.dimension / 8)
  }

  getMemorySavings() {
    const orig = (this.dimension * 4) / (1024 * 1024)
    const comp = Math.ceil(this.dimension / 8) / (1024 * 1024)
    return {
      original:   `${orig.toFixed(2)}MB`,
      compressed: `${comp.toFixed(2)}MB`,
      savings:    `${(((orig - comp) / orig) * 100).toFixed(1)}%`,
    }
  }

  private popCount(x: number): number {
    let c = 0; while (x) { c++; x &= x - 1 } return c
  }
}

// ─── OPQ-lite ─────────────────────────────────────────────────────────────────

class VarianceBalancedOPQ {
  private perm: Uint16Array | null = null
  private inv:  Uint16Array | null = null

  train(vectors: number[][], nSub: number) {
    if (!vectors.length) return
    const dim  = vectors[0].length
    const mean = new Float64Array(dim)
    for (const v of vectors) for (let i = 0; i < dim; i++) mean[i] += v[i]
    for (let i = 0; i < dim; i++) mean[i] /= vectors.length

    const varD = new Float64Array(dim)
    for (const v of vectors) for (let i = 0; i < dim; i++) { const d = v[i]-mean[i]; varD[i]+=d*d }

    const idx     = Array.from({length:dim},(_,i)=>i).sort((a,b)=>varD[b]-varD[a])
    const buckets: number[][] = Array.from({length:nSub},()=>[])
    idx.forEach((d,i)=>buckets[i%nSub].push(d))

    const permArr: number[] = []
    buckets.forEach(b=>permArr.push(...b))
    this.perm = new Uint16Array(permArr)
    this.inv  = new Uint16Array(dim)
    for (let i = 0; i < dim; i++) this.inv[this.perm[i]] = i
  }

  apply(v: number[]): number[] {
    if (!this.perm) return v
    const o = new Array(v.length)
    for (let i = 0; i < v.length; i++) o[i] = v[this.perm[i]]
    return o
  }

  isReady() { return !!this.perm }
}

// ─── Product quantizer ────────────────────────────────────────────────────────

class ProductQuantizer {
  private codebooks: Float32Array[][] = []
  private subDim:    number
  private trained    = false

  constructor(
    private vectorDim    = GEMINI_DIM,
    private nSub         = 8,
    // ✅ 768-dim vectors double the per-codebook compute vs the old 384-dim
    //    MiniLM vectors. Codebook size reduced from 256→128 to keep
    //    training (k-means++, 15 iters) fast at the 2000-sample threshold.
    private codebookSize = 128,
    private maxIters     = 15
  ) {
    if (vectorDim % nSub !== 0) throw new Error("vectorDim must be divisible by nSub")
    this.subDim = vectorDim / nSub
  }

  isTrained() { return this.trained }

  train(raw: number[][], opq?: VarianceBalancedOPQ) {
    if (!raw.length) return
    const vecs = opq?.isReady() ? raw.map(v => opq.apply(v)) : raw
    const subspaces: number[][][] = Array.from({length:this.nSub},()=>[])
    for (const v of vecs) {
      for (let s = 0; s < this.nSub; s++) {
        subspaces[s].push(v.slice(s*this.subDim, (s+1)*this.subDim))
      }
    }
    this.codebooks = subspaces.map(d => this.kmeans(d, this.codebookSize, this.maxIters))
    this.trained = true
  }

  encode(vector: number[], opq?: VarianceBalancedOPQ): Uint8Array {
    if (vector.length !== this.vectorDim) throw new Error("dim mismatch")
    const v = opq?.isReady() ? opq.apply(vector) : vector
    const codes = new Uint8Array(this.nSub)
    for (let s = 0; s < this.nSub; s++) {
      codes[s] = this.argmin(this.codebooks[s], v.slice(s*this.subDim, (s+1)*this.subDim))
    }
    return codes
  }

  adcDistance(query: number[], codes: Uint8Array, opq?: VarianceBalancedOPQ): number {
    const q = opq?.isReady() ? opq.apply(query) : query
    let sum = 0
    for (let s = 0; s < this.nSub; s++) {
      const sub = q.slice(s*this.subDim, (s+1)*this.subDim)
      sum += this.l2sq(sub, this.codebooks[s][codes[s]])
    }
    return sum
  }

  getCompressionRatio(dim: number): number {
    return (dim * 4) / this.nSub
  }

  private argmin(centroids: Float32Array[], x: number[]): number {
    let best = 0, bestD = Infinity
    for (let i = 0; i < centroids.length; i++) {
      const d = this.l2sq(x, centroids[i])
      if (d < bestD) { bestD = d; best = i }
    }
    return best
  }

  private l2sq(a: number[], b: Float32Array): number {
    let s = 0
    for (let i = 0; i < a.length; i++) { const d = a[i]-b[i]; s+=d*d }
    return s
  }

  private l2sqArr(a: number[], b: number[]): number {
    let s = 0
    for (let i = 0; i < a.length; i++) { const d = a[i]-b[i]; s+=d*d }
    return s
  }

  private kmeans(data: number[][], k: number, maxIters: number): Float32Array[] {
    if (data.length < k) {
      const copies = [...data]
      while (copies.length < k) copies.push(data[Math.floor(Math.random()*data.length)])
      return copies.map(v => Float32Array.from(v))
    }
    const centroids: number[][] = [data[Math.floor(Math.random()*data.length)]]
    while (centroids.length < k) {
      const d2 = data.map(x => {
        let best = Infinity
        for (const c of centroids) { const d=this.l2sqArr(x,c); if(d<best) best=d }
        return best
      })
      const total = d2.reduce((a,b)=>a+b,0)
      let r = Math.random()*total, idx = 0
      for (; idx<d2.length-1; idx++) { r-=d2[idx]; if(r<=0) break }
      centroids.push(data[idx])
    }
    const assigns = new Uint16Array(data.length)
    for (let iter = 0; iter < maxIters; iter++) {
      let changed = 0
      for (let i = 0; i < data.length; i++) {
        let best=0, bestD=Infinity
        for (let c=0; c<k; c++) { const d=this.l2sqArr(data[i],centroids[c]); if(d<bestD){bestD=d;best=c} }
        if (assigns[i]!==best) { assigns[i]=best; changed++ }
      }
      if (!changed && iter>0) break
      const sums: number[][] = Array.from({length:k},()=>Array(data[0].length).fill(0))
      const counts = new Uint32Array(k)
      for (let i=0;i<data.length;i++) {
        const a=assigns[i]; counts[a]++
        for (let d=0;d<data[i].length;d++) sums[a][d]+=data[i][d]
      }
      for (let c=0;c<k;c++) {
        if (!counts[c]) centroids[c]=data[Math.floor(Math.random()*data.length)]
        else            centroids[c]=sums[c].map(v=>v/counts[c])
      }
    }
    return centroids.map(c=>Float32Array.from(c))
  }
}

// ─── Hybrid quantizer ─────────────────────────────────────────────────────────

class HybridQuantizer {
  readonly bq:  BinaryQuantizer
  readonly pq:  ProductQuantizer
  readonly opq: VarianceBalancedOPQ
  private trainingPool: number[][] = []
  private trained = false

  constructor(private dim: number, pqSub=8, pqK=128) {
    this.bq  = new BinaryQuantizer(dim)
    this.pq  = new ProductQuantizer(dim, pqSub, pqK)
    this.opq = new VarianceBalancedOPQ()
  }

  maybeCollectAndTrain(v: number[]) {
    if (this.trained) return
    this.trainingPool.push(v)
    if (this.trainingPool.length >= 2000) {
      this.opq.train(this.trainingPool, 8)
      this.pq.train(this.trainingPool, this.opq)
      this.trainingPool = []
      this.trained = true
      console.log("[HybridQuantizer] OPQ-lite + PQ trained.")
    }
  }

  quantizeBQ(v: number[])  { return this.bq.quantize(v) }
  encodePQ(v: number[])    { return this.pq.isTrained() ? this.pq.encode(v, this.opq) : null }
  adcDistance(q: number[], codes: Uint8Array) { return this.pq.adcDistance(q, codes, this.opq) }
  isPQReady()              { return this.pq.isTrained() }

  getStats() {
    const b = this.bq.getMemorySavings()
    return {
      compressionRatio: this.bq.getCompressionRatio(),
      memorySavings:    b,
      pqReady:          this.isPQReady(),
      pqCompression:    this.pq.getCompressionRatio(this.dim),
    }
  }
}

// ─── Embedding cache (vectors only — BQ/PQ codes computed on demand) ─────────

interface CacheEntry { vector: number[]; timestamp: number }

class LRUEmbeddingCache {
  private map   = new Map<string, CacheEntry>()
  private order: string[] = []

  // 768-dim float64 ≈ 6KB; 5000 entries ≈ 30MB
  constructor(private maxSize = 5000, private ttlMs = 24 * 60 * 60 * 1000) {}

  get(key: string): number[] | undefined {
    const e = this.map.get(key)
    if (!e) return undefined
    if (Date.now() - e.timestamp > this.ttlMs) { this.delete(key); return undefined }
    return e.vector
  }

  set(key: string, vector: number[]) {
    if (this.map.has(key)) {
      this.order = this.order.filter(k => k !== key)
    } else if (this.map.size >= this.maxSize) {
      const oldest = this.order.shift()
      if (oldest) this.map.delete(oldest)
    }
    this.map.set(key, { vector, timestamp: Date.now() })
    this.order.push(key)
  }

  delete(key: string) {
    this.map.delete(key)
    this.order = this.order.filter(k => k !== key)
  }

  get size() { return this.map.size }
}

// ─── Weaviate Service ─────────────────────────────────────────────────────────

//  Single unified collection — this instance allows only 1 collection.
//  Exported so WeaviateAnalyticsService.ts (and any other consumer) uses
//    the same collection name — single source of truth.
export const COLLECTION_NAME = "ExaRankingData"

// Legacy class names from the old 3-class schema. If these exist, they
// occupy the 1-collection slot and must be deleted via the Weaviate console.
export const LEGACY_CLASS_NAMES = ["SearchResult", "QueryIntent", "DriftPattern"]

export class WeaviateService {
  private _client!:     WeaviateClient
  private isConnected   = false
  private initPromise:  Promise<void> | null = null

  //  Circuit breaker — after a failed initialize(), don't retry for a
  //    cooldown period. Without this, every query run (run/route.ts)
  //    calls initialize() again, which re-hits the same rate limit and
  //    produces a fresh 429 on every single request.
  private lastInitError:     { time: number; error: unknown } | null = null
  private readonly INIT_RETRY_COOLDOWN_MS = 60_000   // 1 minute

  private vectorCache:  LRUEmbeddingCache
  private cacheHits     = 0
  private cacheRequests = 0

  private chunker: TokenAwareChunker
  private quant:   HybridQuantizer

  private readonly MAX_RETRIES        = 3
  private readonly RETRY_DELAY        = 2000
  private readonly CONNECTION_TIMEOUT = 30_000
  private readonly BATCH_SIZE         = 20

  constructor() {
    this.vectorCache = new LRUEmbeddingCache()
    this.chunker     = new TokenAwareChunker(380, 40, 120)
    this.quant       = new HybridQuantizer(GEMINI_DIM, 8, 128)
  }

  get client(): WeaviateClient {
    if (!this._client) throw new Error("[WeaviateService] Client not initialized. Call initialize() first.")
    return this._client
  }

  // ── Initialization ─────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    if (this.isConnected) return
    if (this.initPromise) return this.initPromise

    // ✅ Circuit breaker — if we failed recently, don't retry yet.
    //    Throws the SAME cached error so callers see a consistent message,
    //    without making another network call that will likely also 429.
    if (this.lastInitError) {
      const elapsed = Date.now() - this.lastInitError.time
      if (elapsed < this.INIT_RETRY_COOLDOWN_MS) {
        const waitSec = Math.ceil((this.INIT_RETRY_COOLDOWN_MS - elapsed) / 1000)
        throw new Error(
          `[WeaviateService] Skipping init — recent failure ${Math.round(elapsed/1000)}s ago ` +
          `(retry in ${waitSec}s). Original error: ${formatError(this.lastInitError.error)}`
        )
      }
      // Cooldown elapsed — allow a fresh attempt
      this.lastInitError = null
    }

    this.initPromise = this._doInitialize()
    try {
      await this.initPromise
      this.lastInitError = null   // ✅ clear on success
    } catch (err) {
      this.lastInitError = { time: Date.now(), error: err }
      throw err
    } finally {
      this.initPromise = null
    }
  }

  private async _doInitialize(): Promise<void> {
    const url = process.env.WEAVIATE_URL    ?? ""
    const key = process.env.WEAVIATE_API_KEY ?? ""

    if (!url) throw new Error("[WeaviateService] WEAVIATE_URL not set")
    if (!key) throw new Error("[WeaviateService] WEAVIATE_API_KEY not set")
    // ✅ Fail fast if Gemini key missing — every embedding call needs it
    getGeminiApiKey()

    console.log(`[WeaviateService] Initializing with URL: ${url}`)

    this._client = weaviate.client({
      scheme: "https",
      host:   url,
      apiKey: new ApiKey(key),
      headers: { "X-Request-Timeout": this.CONNECTION_TIMEOUT.toString() },
    })

    console.log("[WeaviateService] Testing connection...")
    const meta = await this.withRetry(
      () => this._client.misc.metaGetter().do(),
      "Connection test"
    )
    const version = (meta as any)?.version ?? (meta as any)?.info?.version ?? "unknown"
    console.log("[WeaviateService] Weaviate version:", version)

    await this.ensureSchema()
    this.isConnected = true
    const s = this.quant.getStats()
    console.log("[WeaviateService] Ready. BQ ratio:", s.compressionRatio.toFixed(1), "PQ:", s.pqReady)
  }

  // ── Schema (unified single collection) ─────────────────────────────────────

  private async ensureSchema(): Promise<void> {
    const existing = await this.withRetry(
      () => this._client.schema.getter().do(),
      "Schema getter"
    )
    if (!existing) throw new Error("[WeaviateService] Schema getter returned null")

    const names = new Set((existing.classes ?? []).map((c: any) => c.class))

    if (names.has(COLLECTION_NAME)) {
      console.log(`[WeaviateService] Collection "${COLLECTION_NAME}" already exists.`)
      return
    }

    // ✅ Warn if legacy classes are occupying the only collection slot
    const legacyPresent = LEGACY_CLASS_NAMES.filter(n => names.has(n))
    if (legacyPresent.length > 0) {
      console.warn(
        `[WeaviateService] ⚠️  Legacy class(es) found: ${legacyPresent.join(", ")}. ` +
        `This instance has a 1-collection limit. Delete these from the Weaviate ` +
        `console to free up the slot for "${COLLECTION_NAME}".`
      )
    }

    const unifiedClass = {
      class:       COLLECTION_NAME,
      vectorizer:  "none",
      description: "Unified collection for search results, query intents, and drift patterns",
      properties: [
        // ── Discriminator ──────────────────────────────────────────────────
        { name: "recordType",         dataType: ["text"]   },  // search_result | query_intent | drift_pattern

        // ── Common fields ───────────────────────────────────────────────────
        { name: "userId",             dataType: ["text"]   },
        { name: "queryId",            dataType: ["text"]   },
        { name: "timestamp",          dataType: ["date"]   },
        { name: "binaryCode",         dataType: ["blob"]   },
        { name: "pqCode",             dataType: ["blob"]   },
        { name: "quantizationMethod", dataType: ["text"]   },

        // ── search_result fields ────────────────────────────────────────────
        { name: "url",                dataType: ["text"]   },
        { name: "title",              dataType: ["text"]   },
        { name: "snippet",            dataType: ["text"]   },
        { name: "domain",             dataType: ["text"]   },
        { name: "position",           dataType: ["int"]    },
        { name: "score",              dataType: ["number"] },
        { name: "snapshotId",         dataType: ["text"]   },
        { name: "contentHash",        dataType: ["text"]   },
        { name: "category",           dataType: ["text"]   },

        // ── query_intent fields ─────────────────────────────────────────────
        { name: "name",               dataType: ["text"]   },
        { name: "query",              dataType: ["text"]   },
        { name: "lastRun",            dataType: ["date"]   },

        // ── drift_pattern fields ────────────────────────────────────────────
        { name: "previousSnapshotId", dataType: ["text"]   },
        { name: "driftScore",         dataType: ["number"] },
        { name: "contentChanges",     dataType: ["int"]    },
      ],
    }

    try {
      await this.withRetry(
        () => this._client.schema.classCreator().withClass(unifiedClass).do(),
        `Create collection ${COLLECTION_NAME}`
      )
      console.log(`[WeaviateService] Created collection: ${COLLECTION_NAME}`)
    } catch (err: any) {
      const msg = err?.message ?? String(err)
      if (msg.includes("USAGE_LIMIT_EXCEEDED") || msg.includes("429")) {
        console.error(
          `[WeaviateService] ❌ Cannot create "${COLLECTION_NAME}" — collection limit reached. ` +
          (legacyPresent.length
            ? `Delete legacy class(es) [${legacyPresent.join(", ")}] from the Weaviate console, then restart.`
            : `Check your Weaviate instance's collection usage in the console — limit is 1 for this plan.`)
        )
      }
      throw err
    }
  }

  // ── Retry helper ───────────────────────────────────────────────────────────

  private async withRetry<T>(fn: () => Promise<T>, ctx: string): Promise<T> {
    let last: any
    for (let i = 1; i <= this.MAX_RETRIES; i++) {
      try { return await fn() }
      catch (e: any) {
        last = e
        // ✅ formatError() extracts message/code/status from any error
        //    shape — weaviate-ts-client sometimes throws plain objects
        //    or bare status codes instead of Error instances.
        const msg = formatError(e)
        if (/\b4\d{2}\b/.test(msg) || (e?.status >= 400 && e?.status < 500)) {
          console.warn(`[WeaviateService][Weaviate] ${ctx} — non-retryable: ${msg}`)
          throw e
        }
        console.warn(`[WeaviateService][Weaviate] ${ctx} attempt ${i}/${this.MAX_RETRIES}: ${msg}`)
        if (i < this.MAX_RETRIES) await new Promise(r => setTimeout(r, this.RETRY_DELAY * i))
      }
    }
    throw last
  }

  // ── Embedding (Gemini, cache-aware) ────────────────────────────────────────

  private hashText(text: string): string {
    let h = 0
    for (let i = 0; i < text.length; i++) h = ((h << 5) - h + text.charCodeAt(i)) | 0
    return `${h}_${text.length}`
  }

  /** Single embedding — cache-first, then Gemini. */
  private async getEmbedding(text: string, contentKey?: string): Promise<number[]> {
    this.cacheRequests++
    const key    = contentKey ?? this.hashText(text)
    const cached = this.vectorCache.get(key)
    if (cached) { this.cacheHits++; return cached }

    const vector = await fetchGeminiEmbedding(text)
    this.quant.maybeCollectAndTrain(vector)
    this.vectorCache.set(key, vector)
    return vector
  }

  /**
   * Batch embedding — cache-first, single Gemini batchEmbedContents call
   * for all cache misses. Preserves input order.
   */
  private async getBatchEmbeddings(texts: string[], keys: string[]): Promise<number[][]> {
    const results: (number[] | null)[] = new Array(texts.length).fill(null)
    const missTexts:   string[] = []
    const missKeys:    string[] = []
    const missIndices: number[] = []

    for (let i = 0; i < texts.length; i++) {
      this.cacheRequests++
      const cached = this.vectorCache.get(keys[i])
      if (cached) {
        this.cacheHits++
        results[i] = cached
      } else {
        missTexts.push(texts[i])
        missKeys.push(keys[i])
        missIndices.push(i)
      }
    }

    if (missTexts.length === 0) return results as number[][]

    const vectors = await fetchGeminiBatchEmbeddings(missTexts)

    for (let j = 0; j < missIndices.length; j++) {
      const i = missIndices[j]
      results[i] = vectors[j]
      this.quant.maybeCollectAndTrain(vectors[j])
      this.vectorCache.set(missKeys[j], vectors[j])
    }

    return results as number[][]
  }

  // ── Public helpers ─────────────────────────────────────────────────────────

  isWeaviateConnected(): boolean { return this.isConnected }

  getCacheStats() {
    const hitRate = this.cacheRequests ? this.cacheHits / this.cacheRequests : 0
    const s = this.quant.getStats()
    return {
      size:             this.vectorCache.size,
      hitRate:          Math.round(hitRate * 100) / 100,
      maxSize:          5000,
      compressionRatio: s.compressionRatio,
      memorySavings:    s.memorySavings,
      pqReady:          s.pqReady,
      pqCompression:    s.pqCompression,
    }
  }

  private inferExaCategory(domain: string, title: string, snippet = ""): ExaCategory {
    const d = domain.toLowerCase(), combined = `${title} ${snippet}`.toLowerCase()
    if (d.includes("github.com"))                              return "github"
    if (d.includes("linkedin.com"))                            return "linkedin profile"
    if (d.includes("twitter.com") || d.includes("x.com"))     return "tweet"
    if (combined.includes(".pdf") || /\bpdf\b/.test(combined)) return "pdf"
    if (d.includes("sec.gov") || /\b(10-k|10-q|earnings|financial report)\b/i.test(combined)) return "financial report"
    if (/\b(research|paper|study|journal|arxiv|academic)\b/i.test(combined))  return "research paper"
    if (/\b(news|breaking|headlines|report|article|press)\b/i.test(combined)) return "news"
    if (/\b(personal|blog|portfolio|about me|resume|cv)\b/i.test(combined))   return "personal site"
    return "company"
  }

  // ── Core operations ────────────────────────────────────────────────────────

  /**
   * Sync a snapshot's search results into the unified collection
   * as recordType="search_result".
   *
   * ✅ All chunk texts across all results are collected first, then embedded
   *    in ONE batchEmbedContents call (vs N individual Gemini calls before).
   */
  async syncSnapshot(snapshot: RankingSnapshot): Promise<void> {
    if (!this.isConnected) await this.initialize()

    // Phase 1: chunk all results, collect texts to embed
    interface PendingObj {
      properties: Record<string, unknown>
      text:       string
      key:        string
    }
    const pending: PendingObj[] = []

    for (let i = 0; i < snapshot.results.length; i++) {
      const r = snapshot.results[i]
      const fullText = `${r.title ?? ""}\n${r.snippet ?? ""}`.trim()
      if (!fullText) {
        console.warn(`[WeaviateService] syncSnapshot: empty text for result ${i} in snapshot ${snapshot.id}`)
        continue
      }

      const chunks   = await this.chunker.chunk(fullText)
      const category = this.inferExaCategory(r.domain ?? "", r.title ?? "", r.snippet ?? "")

      chunks.forEach((chunk, ci) => {
        pending.push({
          text: chunk,
          key:  `${r.contentHash}_${ci}`,
          properties: {
            recordType:  "search_result",
            url:         r.url    ?? "",
            title:       r.title  ?? "",
            snippet:     chunk,
            domain:      r.domain ?? "",
            position:    r.position ?? (i + 1),
            score:       r.score  ?? 0,
            queryId:     snapshot.queryId,
            snapshotId:  snapshot.id,
            userId:      snapshot.userId ?? "",
            timestamp:   snapshot.timestamp.toISOString(),
            contentHash: `${r.contentHash ?? ""}_chunk_${ci}`,
            category,
          },
        })
      })
    }

    if (pending.length === 0) return

    // Phase 2: ONE batch embedding call for everything
    const vectors = await this.getBatchEmbeddings(
      pending.map(p => p.text),
      pending.map(p => p.key)
    )

    // Phase 3: quantize + build Weaviate objects
    const toInsert = pending.map((p, idx) => {
      const vector     = vectors[idx]
      const binaryCode = this.quant.quantizeBQ(vector)
      const pqCode     = this.quant.isPQReady() ? this.quant.encodePQ(vector) ?? undefined : undefined

      return {
        class: COLLECTION_NAME,
        properties: {
          ...p.properties,
          binaryCode:         Buffer.from(binaryCode).toString("base64"),
          pqCode:             pqCode ? Buffer.from(pqCode).toString("base64") : undefined,
          quantizationMethod: pqCode ? "BQ+PQ" : "BQ",
        },
        vector,
      }
    })

    // Phase 4: batch insert in chunks of BATCH_SIZE
    for (let i = 0; i < toInsert.length; i += this.BATCH_SIZE) {
      const batch = toInsert.slice(i, i + this.BATCH_SIZE)
      await this.withRetry(
        () => this._client.batch.objectsBatcher().withObjects(...batch).do(),
        `batch insert snapshot ${snapshot.id} (${i}-${i + batch.length})`
      )
      if (i + this.BATCH_SIZE < toInsert.length) {
        await new Promise(r => setTimeout(r, 300))
      }
    }
  }

  /** Sync a query intent as recordType="query_intent". */
  async syncQuery(query: SimilarQuery): Promise<void> {
    if (!this.isConnected) await this.initialize()

    const vector     = await this.getEmbedding(`${query.name} ${query.query}`)
    const binaryCode = this.quant.quantizeBQ(vector)
    const pqCode     = this.quant.isPQReady() ? this.quant.encodePQ(vector) ?? undefined : undefined

    await this.withRetry(
      () => this._client.data
        .creator()
        .withClassName(COLLECTION_NAME)
        .withProperties({
          recordType: "query_intent",
          queryId:    query.id,
          name:       query.name,
          query:      query.query,
          category:   query.category,
          userId:     query.userId,
          timestamp:  query.createdAt.toISOString(),
          lastRun:    query.lastRun?.toISOString() ?? null,
          binaryCode: Buffer.from(binaryCode).toString("base64"),
          pqCode:     pqCode ? Buffer.from(pqCode).toString("base64") : undefined,
          quantizationMethod: pqCode ? "BQ+PQ" : "BQ",
        })
        .withVector(vector)
        .do(),
      `sync query ${query.id}`
    )
  }

  async semanticSearch(
    query:     string,
    userId:    string,
    limit      = 20,
    certainty  = 0.7,
    category?: ExaCategory,
    scope?: SemanticSearchScope,
  ): Promise<SearchHit[]> {
    if (!this.isConnected) await this.initialize()

    const qVec = await this.getEmbedding(query)
    const qBQ  = this.quant.quantizeBQ(qVec)

    // Historical storage remains broad. Benchmark callers add an explicit
    // source-query + frozen snapshot scope without changing analytics queries.
    const where = buildSearchResultWhere(userId, category, scope)
    const candidateLimit = Math.min(
      MAX_SEARCH_CANDIDATES,
      Math.max(MIN_SEARCH_CANDIDATES, limit * SEARCH_CANDIDATE_MULTIPLIER),
    )

    const result = await this.withRetry(
      () => this._client.graphql
        .get()
        .withClassName(COLLECTION_NAME)
        .withFields(`url title snippet domain position score queryId timestamp contentHash category binaryCode pqCode _additional { certainty distance }`)
        .withNearVector({ vector: qVec, certainty })
        .withWhere(where)
        .withLimit(candidateLimit)
        .do(),
      "semantic search"
    )

    const items: any[] = result.data?.Get?.[COLLECTION_NAME] ?? []

    let ranked: { it: any; bqSim: number; adc?: number }[] = items.map(it => {
      let sim = it._additional?.certainty ?? 0
      if (it.binaryCode) {
        try {
          const code = new Uint8Array(Buffer.from(it.binaryCode, "base64"))
          const hd   = this.quant.bq.hammingDistance(qBQ, code)
          if (hd >= 0) sim = this.quant.bq.hammingToSimilarity(hd)
        } catch { /* malformed base64 — keep certainty score */ }
      }
      return { it, bqSim: sim }
    })

    ranked.sort((a, b) => b.bqSim - a.bqSim)
    ranked = ranked.slice(0, candidateLimit)

    if (this.quant.isPQReady()) {
      const withAdc = ranked.map(({ it, bqSim }) => {
        let adc = Infinity
        if (it.pqCode) {
          try {
            const codes = new Uint8Array(Buffer.from(it.pqCode, "base64"))
            adc = this.quant.adcDistance(qVec, codes)
          } catch { }
        }
        return { it, bqSim, adc }
      })

      const finite = withAdc.filter(x => isFinite(x.adc)).map(x => x.adc)
      if (finite.length) {
        const min = arrMin(finite), max = arrMax(finite)
        const range = max - min || 1e-9
        withAdc.forEach(r => {
          const adcScore = isFinite(r.adc) ? 1 - (r.adc - min) / range : 0
          ;(r as any).final = 0.35 * r.bqSim + 0.65 * adcScore
        })
        withAdc.sort((a: any, b: any) => b.final - a.final)
        ranked = withAdc
      }
    }

    const hits = ranked.map(({ it }) => ({
      id:               `${it.queryId}_${it.position}`,
      url:              it.url,
      title:            it.title,
      snippet:          it.snippet,
      domain:           it.domain,
      position:         it.position,
      score:            it.score,
      contentHash:      it.contentHash,
      timestamp:        new Date(it.timestamp),
      similarity:       it._additional?.certainty ?? 0,
      semanticDistance: it._additional?.distance  ?? 0,
    }))

    // Deduplicate after all project-specific BQ/PQ ranking, but before the
    // requested limit, so lower-ranked unique documents fill duplicate slots.
    return takeUniqueCanonicalSearchHits(hits, limit)
  }

  async findSimilarQueries(queryId: string, limit = 5): Promise<SimilarQuery[]> {
    if (!this.isConnected) await this.initialize()

    const refWhere = {
      operator: "And" as const,
      operands: [
        { path: ["recordType"], operator: "Equal" as const, valueText: "query_intent" },
        { path: ["queryId"],    operator: "Equal" as const, valueText: queryId },
      ],
    }

    const ref = await this.withRetry(
      () => this._client.graphql
        .get()
        .withClassName(COLLECTION_NAME)
        .withFields("_additional { vector } binaryCode pqCode name query category userId timestamp lastRun queryId")
        .withWhere(refWhere)
        .withLimit(1)
        .do(),
      "ref query"
    )

    const refItem = ref.data?.Get?.[COLLECTION_NAME]?.[0]
    if (!refItem) return []

    const refVec = refItem._additional?.vector as number[] | undefined
    const refBQ  = refItem.binaryCode
      ? new Uint8Array(Buffer.from(refItem.binaryCode, "base64"))
      : undefined

    const similarWhere = {
      operator: "And" as const,
      operands: [
        { path: ["recordType"], operator: "Equal" as const, valueText: "query_intent" },
        { path: ["queryId"],    operator: "NotEqual" as const, valueText: queryId },
      ],
    }

    const similar = await this.withRetry(
      () => this._client.graphql
        .get()
        .withClassName(COLLECTION_NAME)
        .withFields("queryId name query category userId timestamp lastRun binaryCode pqCode _additional { certainty }")
        .withNearVector({ vector: refVec!, certainty: 0.6 })
        .withWhere(similarWhere)
        .withLimit(limit * 3)
        .do(),
      "similar queries"
    )

    const rows: any[] = similar.data?.Get?.[COLLECTION_NAME] ?? []

    let ranked: { row: any; bqSim: number; adc?: number }[] = rows.map(row => {
      let s = row._additional?.certainty ?? 0
      if (refBQ && row.binaryCode) {
        try {
          const code = new Uint8Array(Buffer.from(row.binaryCode, "base64"))
          const hd   = this.quant.bq.hammingDistance(refBQ, code)
          if (hd >= 0) s = this.quant.bq.hammingToSimilarity(hd)
        } catch { }
      }
      return { row, bqSim: s }
    })

    ranked.sort((a, b) => b.bqSim - a.bqSim)
    ranked = ranked.slice(0, limit * 2)

    if (this.quant.isPQReady() && refVec) {
      const withAdc = ranked.map(({ row, bqSim }) => {
        let adc = Infinity
        if (row.pqCode) {
          try {
            const codes = new Uint8Array(Buffer.from(row.pqCode, "base64"))
            adc = this.quant.adcDistance(refVec, codes)
          } catch { }
        }
        return { row, bqSim, adc }
      })

      const finite = withAdc.filter(x => isFinite(x.adc)).map(x => x.adc)
      if (finite.length) {
        const min = arrMin(finite), max = arrMax(finite)
        const range = max - min || 1e-9
        withAdc.forEach((r: any) => {
          const adcScore = isFinite(r.adc) ? 1 - (r.adc - min) / range : 0
          r.final = 0.35 * r.bqSim + 0.65 * adcScore
        })
        withAdc.sort((a: any, b: any) => b.final - a.final)
        ranked = withAdc
      }
    }

    return ranked.slice(0, limit).map(({ row }) => ({
      id:        row.queryId,
      name:      row.name,
      query:     row.query,
      category:  row.category,
      userId:    row.userId,
      createdAt: new Date(row.timestamp),
      lastRun:   row.lastRun ? new Date(row.lastRun) : undefined,
      similarity: row._additional?.certainty ?? 0,
    }))
  }

  async detectContentAnomalies(userId: string, timeRangeMs: number): Promise<any[]> {
    if (!this.isConnected) await this.initialize()

    const cutoff = new Date(Date.now() - timeRangeMs).toISOString()

    const where = {
      operator: "And" as const,
      operands: [
        { path: ["recordType"], operator: "Equal" as const,       valueText: "search_result" },
        { path: ["userId"],     operator: "Equal" as const,       valueText: userId  },
        { path: ["timestamp"],  operator: "GreaterThan" as const,  valueDate: cutoff  },
      ],
    }

    const res = await this.withRetry(
      () => this._client.graphql
        .get()
        .withClassName(COLLECTION_NAME)
        .withFields("url title snippet position timestamp queryId binaryCode _additional { certainty }")
        .withWhere(where)
        .withLimit(1000)
        .do(),
      "anomaly fetch"
    )

    const rows: any[] = res.data?.Get?.[COLLECTION_NAME] ?? []
    if (rows.length < 10) return []

    const groups = new Map<string, any[]>()
    for (const r of rows) {
      if (!r.queryId) continue
      const bucket = groups.get(r.queryId) ?? []
      bucket.push(r)
      groups.set(r.queryId, bucket)
    }

    const anomalies: any[] = []

    for (const [qid, items] of groups) {
      const coded = items
        .map(it => {
          if (!it.binaryCode) return { it, code: null as Uint8Array | null }
          try {
            const buffer = Buffer.from(it.binaryCode, "base64")
            return { it, code: new Uint8Array(buffer) as Uint8Array }
          } catch {
            return { it, code: null as Uint8Array | null }
          }
        })
        .filter((x): x is { it: any; code: Uint8Array } => x.code !== null)

      if (coded.length < 3) continue

      const dequantized = coded.map(x => this.quant.bq.dequantize(x.code))
      const dim         = dequantized[0].length

      const centroid = new Array<number>(dim).fill(0)
      for (const v of dequantized) for (let i = 0; i < dim; i++) centroid[i] += v[i]
      for (let i = 0; i < dim; i++) centroid[i] /= dequantized.length

      const sims = dequantized.map(v => {
        let dot = 0, na = 0, nb = 0
        for (let i = 0; i < dim; i++) { dot += v[i]*centroid[i]; na += v[i]*v[i]; nb += centroid[i]*centroid[i] }
        const denom = Math.sqrt(na) * Math.sqrt(nb)
        return denom === 0 ? 0 : Math.max(-1, Math.min(1, dot / denom))
      })

      const mean = sims.reduce((a, b) => a + b, 0) / sims.length
      const varc = sims.reduce((a, b) => a + (b - mean) ** 2, 0) / sims.length
      const sd   = Math.sqrt(varc)

      coded.forEach(({ it }, i) => {
        if (sims[i] < mean - 2 * sd) {
          anomalies.push({
            type:               "content_anomaly",
            queryId:            qid,
            url:                it.url,
            title:              it.title,
            position:           it.position,
            timestamp:          it.timestamp,
            anomalyScore:       sd > 0 ? (mean - sims[i]) / sd : 0,
            avgSimilarity:      sims[i],
            expectedSimilarity: mean,
            detectionMethod:    "BQ centroid",
          })
        }
      })
    }

    return anomalies.sort((a, b) => b.anomalyScore - a.anomalyScore)
  }
}
