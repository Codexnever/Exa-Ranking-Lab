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
import {
  type EmbeddingCacheNamespace,
  createEmbeddingCacheFromEnvironment,
} from "@/app/services/embedding/embedding-cache"

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

export type WeaviateQuantization = "none" | "rq-8"

interface WeaviateClassDefinition {
  class?: string
  vectorIndexType?: string
  vectorIndexConfig?: Record<string, unknown>
  [key: string]: unknown
}

export function getRequestedWeaviateQuantization(value = process.env.WEAVIATE_QUANTIZATION): WeaviateQuantization {
  const normalized = value?.trim().toLowerCase() || "none"
  if (normalized === "none" || normalized === "rq-8") return normalized
  throw new Error("WEAVIATE_QUANTIZATION must be either 'none' or 'rq-8'")
}

export function planNativeRqUpdate(
  existing: WeaviateClassDefinition,
  requested: WeaviateQuantization,
  serverVersion: string,
): { action: "none" | "update"; classDefinition: WeaviateClassDefinition; status: WeaviateQuantization } {
  const config = existing.vectorIndexConfig ?? {}
  const rq = config.rq as { enabled?: boolean; bits?: number } | undefined
  if (rq?.enabled) {
    if ((rq.bits ?? 8) !== 8) throw new Error("Existing Weaviate RQ uses a conflicting bit width; it will not be overwritten")
    return { action: "none", classDefinition: existing, status: "rq-8" }
  }
  if (requested === "none") return { action: "none", classDefinition: existing, status: "none" }
  const [major, minor] = serverVersion.split(".").map(Number)
  if (!Number.isFinite(major) || !Number.isFinite(minor) || major < 1 || (major === 1 && minor < 32)) {
    throw new Error(`WEAVIATE_QUANTIZATION=rq-8 requires Weaviate 1.32+; detected ${serverVersion}`)
  }
  if ((existing.vectorIndexType ?? "hnsw") !== "hnsw") {
    throw new Error("WEAVIATE_QUANTIZATION=rq-8 in-place enablement is limited to HNSW collections")
  }
  for (const name of ["bq", "pq", "sq"] as const) {
    const quantizer = config[name] as { enabled?: boolean } | undefined
    if (quantizer?.enabled) throw new Error(`Existing Weaviate ${name.toUpperCase()} quantization will not be overwritten`)
  }
  return {
    action: "update",
    status: "rq-8",
    classDefinition: {
      ...existing,
      vectorIndexConfig: {
        ...config,
        rq: { enabled: true, bits: 8, rescoreLimit: 20 },
      },
    },
  }
}

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

export function isFiniteVector(value: unknown): value is number[] {
  return Array.isArray(value) && value.length > 0 && value.every(item => typeof item === "number" && Number.isFinite(item))
}

export function cosineSimilarity(a: number[], b: number[]): number | null {
  if (!isFiniteVector(a) || !isFiniteVector(b) || a.length !== b.length) return null
  let dot = 0, normA = 0, normB = 0
  for (let index = 0; index < a.length; index++) {
    dot += a[index] * b[index]
    normA += a[index] ** 2
    normB += b[index] ** 2
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB)
  return denominator ? Math.max(-1, Math.min(1, dot / denominator)) : null
}

interface VectorAnomalyRow {
  queryId?: string
  url?: string
  title?: string
  position?: number
  timestamp?: string
  _additional?: { vector?: unknown }
}

export interface ContentAnomaly {
  type: "content_anomaly"
  queryId: string
  url?: string
  title?: string
  position?: number
  timestamp?: string
  anomalyScore: number
  avgSimilarity: number
  expectedSimilarity: number
  detectionMethod: "full-vector cosine centroid"
}

export function calculateFullVectorAnomalies(rows: VectorAnomalyRow[]): ContentAnomaly[] {
  const groups = new Map<string, Array<{ row: VectorAnomalyRow; vector: number[] }>>()
  for (const row of rows) {
    const vector = row?._additional?.vector
    if (!row?.queryId || !isFiniteVector(vector)) continue
    const existing = groups.get(row.queryId) ?? []
    if (existing.length && existing[0].vector.length !== vector.length) continue
    existing.push({ row, vector })
    groups.set(row.queryId, existing)
  }
  const anomalies: ContentAnomaly[] = []
  for (const [queryId, items] of groups) {
    if (items.length < 3) continue
    const dimensions = items[0].vector.length
    const centroid = new Array<number>(dimensions).fill(0)
    for (const { vector } of items) for (let index = 0; index < dimensions; index++) centroid[index] += vector[index]
    for (let index = 0; index < dimensions; index++) centroid[index] /= items.length
    const similarities = items.map(item => cosineSimilarity(item.vector, centroid)).filter((value): value is number => value !== null)
    if (similarities.length !== items.length) continue
    const mean = similarities.reduce((sum, value) => sum + value, 0) / similarities.length
    const deviation = Math.sqrt(similarities.reduce((sum, value) => sum + (value - mean) ** 2, 0) / similarities.length)
    items.forEach(({ row }, index) => {
      if (similarities[index] >= mean - 2 * deviation) return
      anomalies.push({
        type: "content_anomaly",
        queryId,
        url: row.url,
        title: row.title,
        position: row.position,
        timestamp: row.timestamp,
        anomalyScore: deviation > 0 ? (mean - similarities[index]) / deviation : 0,
        avgSimilarity: similarities[index],
        expectedSimilarity: mean,
        detectionMethod: "full-vector cosine centroid",
      })
    })
  }
  return anomalies.sort((a, b) => b.anomalyScore - a.anomalyScore)
}

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
const GEMINI_CACHE_NAMESPACE: EmbeddingCacheNamespace = {
  provider: "gemini",
  model: GEMINI_MODEL,
  task: "semantic-similarity",
  dimensions: GEMINI_DIM,
  preparationVersion: "weaviate-semantic-similarity-v1",
}

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

// Vector-index compression and rescoring are owned by Weaviate. Legacy
// binaryCode/pqCode properties remain readable but are no longer produced.
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

  private readonly embeddingCache = createEmbeddingCacheFromEnvironment()

  private chunker: TokenAwareChunker
  private quantizationStatus: "none" | "rq-8" = "none"

  private readonly MAX_RETRIES        = 3
  private readonly RETRY_DELAY        = 2000
  private readonly CONNECTION_TIMEOUT = 30_000
  private readonly BATCH_SIZE         = 20

  constructor() {
    this.chunker     = new TokenAwareChunker(380, 40, 120)
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

    await this.ensureSchema(version)
    this.isConnected = true
    console.log(`[WeaviateService] Ready. Native quantization: ${this.quantizationStatus}`)
  }

  // ── Schema (unified single collection) ─────────────────────────────────────

  private async ensureSchema(serverVersion: string): Promise<void> {
    const existing = await this.withRetry(
      () => this._client.schema.getter().do(),
      "Schema getter"
    )
    if (!existing) throw new Error("[WeaviateService] Schema getter returned null")

    const classes = (existing.classes ?? []) as WeaviateClassDefinition[]
    const names = new Set(classes.map(collection => collection.class))

    if (names.has(COLLECTION_NAME)) {
      console.log(`[WeaviateService] Collection "${COLLECTION_NAME}" already exists.`)
      const collection = classes.find(candidate => candidate.class === COLLECTION_NAME)!
      const plan = planNativeRqUpdate(collection, getRequestedWeaviateQuantization(), serverVersion)
      this.quantizationStatus = plan.status
      if (plan.action === "update") {
        await this.withRetry(
          () => this.updateClassDefinition(plan.classDefinition),
          `Enable native RQ-8 on ${COLLECTION_NAME}`,
        )
        console.warn("[WeaviateService] Enabled native RQ-8. This quantizer cannot be disabled in place.")
      }
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

    const requestedQuantization = getRequestedWeaviateQuantization()
    if (requestedQuantization === "rq-8") {
      planNativeRqUpdate({ vectorIndexType: "hnsw" }, requestedQuantization, serverVersion)
    }
    const unifiedClass = {
      class:       COLLECTION_NAME,
      vectorizer:  "none",
      vectorIndexType: "hnsw",
      ...(requestedQuantization === "rq-8"
        ? { vectorIndexConfig: { rq: { enabled: true, bits: 8, rescoreLimit: 20 } } }
        : {}),
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
      this.quantizationStatus = requestedQuantization
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

  private async updateClassDefinition(classDefinition: WeaviateClassDefinition): Promise<void> {
    const configuredUrl = process.env.WEAVIATE_URL?.trim() ?? ""
    const apiKey = process.env.WEAVIATE_API_KEY?.trim() ?? ""
    const origin = /^https?:\/\//i.test(configuredUrl) ? configuredUrl : `https://${configuredUrl}`
    const response = await fetch(`${origin.replace(/\/$/, "")}/v1/schema/${encodeURIComponent(COLLECTION_NAME)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(classDefinition),
      signal: AbortSignal.timeout(this.CONNECTION_TIMEOUT),
    })
    if (!response.ok) throw new Error(`Weaviate schema update failed (${response.status})`)
  }

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

  /** Single embedding — cache-first, then Gemini. */
  private async getEmbedding(text: string, contentKey?: string): Promise<number[]> {
    const request = { namespace: GEMINI_CACHE_NAMESPACE, identity: contentKey ?? text.slice(0, GEMINI_MAX_CHARS) }
    const [cached] = await this.embeddingCache.getMany([request])
    if (cached) return cached
    const vector = await fetchGeminiEmbedding(text)
    await this.embeddingCache.setMany([request], [vector])
    return vector
  }

  /**
   * Batch embedding — cache-first, single Gemini batchEmbedContents call
   * for all cache misses. Preserves input order.
   */
  private async getBatchEmbeddings(texts: string[], keys: string[]): Promise<number[][]> {
    const requests = keys.map(identity => ({ namespace: GEMINI_CACHE_NAMESPACE, identity }))
    const results = await this.embeddingCache.getMany(requests)
    const missIndices = results.flatMap((value, index) => value ? [] : [index])
    if (missIndices.length === 0) return results as number[][]
    const vectors = await fetchGeminiBatchEmbeddings(missIndices.map(index => texts[index]))
    await this.embeddingCache.setMany(missIndices.map(index => requests[index]), vectors)

    for (let j = 0; j < missIndices.length; j++) {
      const i = missIndices[j]
      results[i] = vectors[j]
    }

    return results as number[][]
  }

  // ── Public helpers ─────────────────────────────────────────────────────────

  isWeaviateConnected(): boolean { return this.isConnected }

  getCacheStats() {
    const stats = this.embeddingCache.stats
    return {
      ...stats,
      size: stats.l1Size,
      hitRate: Math.round(stats.hitRate * 100) / 100,
      maxSize: stats.l1MaxSize,
      nativeQuantization: this.quantizationStatus,
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

    // Phase 3: send full vectors; Weaviate owns optional index compression.
    const toInsert = pending.map((p, idx) => {
      return {
        class: COLLECTION_NAME,
        properties: p.properties,
        vector: vectors[idx],
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

    const vector = await this.getEmbedding(`${query.name} ${query.query}`)

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
        .withFields(`url title snippet domain position score queryId timestamp contentHash category _additional { certainty distance }`)
        .withNearVector({ vector: qVec, certainty })
        .withWhere(where)
        .withLimit(candidateLimit)
        .do(),
      "semantic search"
    )

    const items: any[] = result.data?.Get?.[COLLECTION_NAME] ?? []

    const hits = items.map(it => ({
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

    // Preserve native Weaviate order and deduplicate before the final limit.
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
        .withFields("_additional { vector } name query category userId timestamp lastRun queryId")
        .withWhere(refWhere)
        .withLimit(1)
        .do(),
      "ref query"
    )

    const refItem = ref.data?.Get?.[COLLECTION_NAME]?.[0]
    if (!refItem) return []

    const refVec = refItem._additional?.vector as number[] | undefined
    if (!isFiniteVector(refVec)) return []

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
        .withFields("queryId name query category userId timestamp lastRun _additional { certainty }")
        .withNearVector({ vector: refVec!, certainty: 0.6 })
        .withWhere(similarWhere)
        .withLimit(limit * 3)
        .do(),
      "similar queries"
    )

    const rows: any[] = similar.data?.Get?.[COLLECTION_NAME] ?? []

    return rows.slice(0, limit).map(row => ({
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
        .withFields("url title snippet position timestamp queryId _additional { vector }")
        .withWhere(where)
        .withLimit(1000)
        .do(),
      "anomaly fetch"
    )

    const rows: any[] = res.data?.Get?.[COLLECTION_NAME] ?? []
    if (rows.length < 10) return []

    return calculateFullVectorAnomalies(rows)
  }
}
