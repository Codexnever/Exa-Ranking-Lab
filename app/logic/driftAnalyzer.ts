// lib/drift-analyzer.ts
//
// Uses Google Gemini Embedding 2 (gemini-embedding-2-preview) for semantic
// similarity. Requires: GEMINI_API_KEY environment variable.
//
// Model specs (GA April 2026):
//   - Model ID: gemini-embedding-2-preview
//   - Input token limit: 8,192 (~32,000 chars)
//   - Output dimensions: flexible 128–3072 (default 3072; we use 768 for speed)
//   - Multimodal: text, image, video, audio, PDF
//   - REST: https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2-preview:embedContent
//   - Batch: batchEmbedContents — up to 100 requests per call
//   - taskType: SEMANTIC_SIMILARITY optimal for drift/coherence comparisons

import type {
  RankingSnapshot,
  DriftAnalysisResult,
  DriftTimelinePoint,
  RankChange,
  SearchResult,
} from "@/types/type"
import { createHash } from "crypto"

// ─── Constants ────────────────────────────────────────────────────────────────

const GEMINI_MODEL = "gemini-embedding-2"
const GEMINI_BASE  = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}`

// Gemini Embedding 2: 8192 tokens ≈ 32,000 chars; we cap at 16,000 for safety
const MAX_CHARS = 16_000

// Output dimension — 768 is the recommended balanced option (speed vs quality).
// Change to 1536 or 3072 for higher quality at the cost of storage/latency.
const OUTPUT_DIMENSIONALITY = 768

// Gemini batch limit per call
const BATCH_LIMIT = 100

// ─── API key helper ───────────────────────────────────────────────────────────

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error("[DriftAnalyzer] GEMINI_API_KEY not set in environment")
  return key
}

// ─── Gemini Embedding 2 REST API ─────────────────────────────────────────────

/**
 * Single text embedding via embedContent.
 */

/**
 * Gemini Embedding 2 uses task instructions in the text itself.
 * For drift analysis we're performing symmetric semantic similarity.
 */
function prepareSimilarityText(text: string): string {
  return `task: sentence similarity | query: ${text}`
}
async function fetchGeminiEmbedding(text: string): Promise<number[]> {
  const key = getApiKey()

  const res = await fetch(`${GEMINI_BASE}:embedContent?key=${key}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
  model: `models/${GEMINI_MODEL}`,
  content: {
    parts: [{
      text: prepareSimilarityText(
        text.slice(0, MAX_CHARS)
      )
    }]
  },
  outputDimensionality: OUTPUT_DIMENSIONALITY,
}),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(
      `[DriftAnalyzer] Gemini embedContent failed (${res.status}): ${err?.error?.message ?? res.statusText}`
    )
  }

  const data   = await res.json()
  const values = data?.embedding?.values as number[] | undefined
  if (!values?.length) throw new Error("[DriftAnalyzer] Gemini returned empty embedding")
  return values
}

/**
 * Batch embed multiple texts via batchEmbedContents.
 * Handles chunking (max 100 per call) and falls back to sequential on error.
 * Returns embeddings in the same order as input texts.
 */
async function fetchGeminiBatchEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []
  if (texts.length === 1) return [await fetchGeminiEmbedding(texts[0])]

  const key     = getApiKey()
  const results: number[][] = []

  for (let i = 0; i < texts.length; i += BATCH_LIMIT) {
    const chunk = texts.slice(i, i + BATCH_LIMIT)

    const res = await fetch(`${GEMINI_BASE}:batchEmbedContents?key=${key}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
       requests: chunk.map(text => ({
  model: `models/${GEMINI_MODEL}`,
  content: {
    parts: [{
      text: prepareSimilarityText(
        text.slice(0, MAX_CHARS)
      )
    }]
  },
  outputDimensionality: OUTPUT_DIMENSIONALITY,
})),
      }),
    })

    if (!res.ok) {
      // Batch failed — fall back to sequential for this chunk
      console.warn(`[DriftAnalyzer] batchEmbedContents failed (${res.status}), falling back to sequential`)
      const fallback = await Promise.all(chunk.map(fetchGeminiEmbedding))
      results.push(...fallback)
      continue
    }

    const data = await res.json()
    const embeddings = data?.embeddings as Array<{ values: number[] }> | undefined

    if (!embeddings?.length) {
      throw new Error("[DriftAnalyzer] Gemini batchEmbedContents returned empty response")
    }

    results.push(...embeddings.map(e => e.values))
  }

  return results
}

// ─── Cosine similarity (local — no external dep) ──────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a?.length || !b?.length || a.length !== b.length) return 0
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na  += a[i] * a[i]
    nb  += b[i] * b[i]
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom === 0 ? 0 : Math.max(-1, Math.min(1, dot / denom))
}

// ─── Content hash ─────────────────────────────────────────────────────────────

function computeContentHash(title: string, snippet: string, url: string, fulltext: string): string {
  const s = `${title ?? ""}|${snippet ?? ""}|${fulltext.slice(0, 5000)}|${url ?? ""}`.trim().toLowerCase()
  return createHash("sha256").update(s).digest("hex")
}

// ─── Embedding cache ──────────────────────────────────────────────────────────
// Critical for cost control — every cache miss = one billable Gemini API call.

interface CacheEntry { vector: number[]; timestamp: number; hits: number }

class EmbeddingCache {
  private map   = new Map<string, CacheEntry>()
  private order: string[] = []  // insertion order → O(1) LRU eviction

  // 768-dim float64 ≈ 6KB; 2000 entries ≈ 12MB in-process
  private readonly TTL      = 24 * 60 * 60 * 1000
  private readonly MAX_SIZE = 2000

  private key(text: string, contentHash?: string): string {
    if (contentHash) return `h_${contentHash}`
    // djb2 + length suffix for collision resistance
    let h = 0
    for (let i = 0; i < text.length; i++) h = ((h << 5) - h + text.charCodeAt(i)) | 0
    return `t_${h}_${text.length}`
  }

  get(text: string, contentHash?: string): number[] | null {
    const k     = this.key(text, contentHash)
    const entry = this.map.get(k)
    if (!entry) return null
    if (Date.now() - entry.timestamp > this.TTL) { this.evict(k); return null }
    entry.hits++
    return entry.vector
  }

  set(text: string, vector: number[], contentHash?: string): void {
    const k = this.key(text, contentHash)
    if (this.map.has(k)) {
      this.order = this.order.filter(x => x !== k)
    } else if (this.map.size >= this.MAX_SIZE) {
      // O(1) LRU — evict single oldest
      const oldest = this.order.shift()
      if (oldest) this.map.delete(oldest)
    }
    this.map.set(k, { vector, timestamp: Date.now(), hits: 1 })
    this.order.push(k)
  }

  private evict(k: string): void {
    this.map.delete(k)
    this.order = this.order.filter(x => x !== k)
  }

  shouldRecalculate(oldHashes: string[], newHashes: string[]): boolean {
    if (oldHashes.length !== newHashes.length) return true
    const oldSet = new Set(oldHashes)
    for (const h of newHashes) if (!oldSet.has(h)) return true
    return false
  }

  get size() { return this.map.size }
}

const embeddingCache = new EmbeddingCache()

// ─── Cache-aware batch embedding ─────────────────────────────────────────────

/**
 * Returns embeddings for all texts, hitting the cache first and only
 * calling the Gemini batch API for uncached texts.
 * Preserves input order.
 */
async function getBatchEmbeddings(
  texts:         string[],
  contentHashes?: string[]
): Promise<number[][]> {
  const results: (number[] | null)[] = new Array(texts.length).fill(null)
  const uncachedTexts:    string[]   = []
  const uncachedHashes:   (string | undefined)[] = []
  const uncachedIndices:  number[]   = []

  // Cache pass — collect what's already cached
  for (let i = 0; i < texts.length; i++) {
    const cached = embeddingCache.get(texts[i], contentHashes?.[i])
    if (cached) {
      results[i] = cached
    } else {
      uncachedTexts.push(texts[i])
      uncachedHashes.push(contentHashes?.[i])
      uncachedIndices.push(i)
    }
  }

  if (uncachedTexts.length === 0) return results as number[][]

  // Single batch API call for all uncached texts
  const vectors = await fetchGeminiBatchEmbeddings(uncachedTexts)

  for (let j = 0; j < uncachedIndices.length; j++) {
    const i = uncachedIndices[j]
    results[i] = vectors[j]
    embeddingCache.set(texts[i], vectors[j], uncachedHashes[j])
  }

  return results as number[][]
}

// ─── SearchResult helpers ─────────────────────────────────────────────────────

function getCombinedText(r: SearchResult): string {
  return [
    `title: ${r.title ?? "none"}`,
    `text: ${r.snippet ?? ""}`,
    `fullText: ${r.fullText?.slice(0, 5000) ?? ""}`,
    `url: ${r.url ?? ""}`
  ].join(" | ")
}
function getContentHash(r: SearchResult): string {
  return r.contentHash || computeContentHash(r.title ?? "", r.snippet ?? "", r.url ?? "", r.fullText?.slice(0, 5000) ?? "")
}

// ─── Config ───────────────────────────────────────────────────────────────────

interface DriftConfig {
  topN:                       number
  positionWeight:             "linear" | "exponential"
  similarityThreshold:        number
  newResultPenalty:           number
  droppedResultPenalty:       number
  useContentHashOptimization: boolean
  contentChangeBonus:         number
}

const DEFAULT_DRIFT_CONFIG: DriftConfig = {
  topN:                       10,
  positionWeight:             "linear",
  similarityThreshold:        0.8,
  newResultPenalty:           5,
  droppedResultPenalty:       3,
  useContentHashOptimization: true,
  contentChangeBonus:         2.0,
}

// ─── Position-only drift (fast path — no API calls) ───────────────────────────

function calculatePositionOnlyDrift(
  prev:   SearchResult[],
  curr:   SearchResult[],
  config: DriftConfig
): number {
  const prevMap = new Map(prev.map((r, i) => [r.url, i]))
  let total = 0
  for (let ci = 0; ci < curr.length; ci++) {
    const pi = prevMap.get(curr[ci].url)
    if (pi === undefined) continue
    const w = config.positionWeight === "exponential"
      ? Math.exp(-ci / config.topN)
      : 1 - ci / config.topN
    total += Math.abs(pi - ci) * w
  }
  return Math.min(100, (total / (config.topN * 5)) * 100)
}

// ─── Core drift score ─────────────────────────────────────────────────────────

export async function calculateDriftScore(
  prev:   RankingSnapshot,
  curr:   RankingSnapshot,
  config: DriftConfig = DEFAULT_DRIFT_CONFIG
): Promise<{
  driftScore:           number
  rankChanges:          RankChange[]
  newResults:           number
  droppedResults:       number
  contentChanges:       number
  processingTime:       number
  identicalContentRate: number
}> {
  const t0 = performance.now()

  try {
    const prevResults = prev.results.slice(0, config.topN)
    const currResults = curr.results.slice(0, config.topN)

    // ── Fast path: identical content hashes — skip all API calls ──────────
    if (config.useContentHashOptimization) {
      const prevHashes = prevResults.map(getContentHash)
      const currHashes = currResults.map(getContentHash)
      if (!embeddingCache.shouldRecalculate(prevHashes, currHashes)) {
        return {
          driftScore:           calculatePositionOnlyDrift(prevResults, currResults, config),
          rankChanges:          [],
          newResults:           0,
          droppedResults:       0,
          contentChanges:       0,
          processingTime:       performance.now() - t0,
          identicalContentRate: 1.0,
        }
      }
    }

    const prevUrlMap = new Map(prevResults.map(r => [r.url, r]))

    // ── Collect unique texts for a single batch API call ──────────────────
    const textByHash  = new Map<string, string>()
    for (const r of [...prevResults, ...currResults]) {
      const h = getContentHash(r)
      if (!textByHash.has(h)) textByHash.set(h, getCombinedText(r))
    }

    const uniqueHashes = [...textByHash.keys()]
    const uniqueTexts  = [...textByHash.values()]

    // One batch call covers all unique content in this snapshot pair
    const vectors  = await getBatchEmbeddings(uniqueTexts, uniqueHashes)
    const vecMap   = new Map<string, number[]>()
    uniqueHashes.forEach((h, i) => vecMap.set(h, vectors[i]))

    // ── Score each result ──────────────────────────────────────────────────
    const rankChanges:  RankChange[] = []
    let totalDrift     = 0
    let newResults     = 0
    let contentChanges = 0
    let identicalCount = 0

    for (let ci = 0; ci < currResults.length; ci++) {
      const currR = currResults[ci]
      const prevR = prevUrlMap.get(currR.url)

      if (prevR) {
        const pi            = prevResults.findIndex(r => r.url === currR.url)
        const positionDelta = pi - ci
        const prevHash      = getContentHash(prevR)
        const currHash      = getContentHash(currR)
        const contentChanged = prevHash !== currHash

        let simScore: number
        if (!contentChanged) {
          simScore = 1.0  // identical content — no vector math needed
          identicalCount++
        } else {
          const v1 = vecMap.get(prevHash)
          const v2 = vecMap.get(currHash)
          simScore = v1 && v2 ? cosineSimilarity(v1, v2) : 0
        }

        if (contentChanged) contentChanges++

        const w      = config.positionWeight === "exponential"
          ? Math.exp(-ci / config.topN)
          : 1 - ci / config.topN
        const decay  = Math.max(0, 1 - simScore)
        const cmult  = contentChanged ? config.contentChangeBonus : 1
        const tbonus = simScore < config.similarityThreshold ? 1.5 : 1
        totalDrift  += Math.abs(positionDelta) * w * (1 + decay) * cmult * tbonus

        rankChanges.push({
          url:              currR.url,
          title:            currR.title,
          previousPosition: pi + 1,
          currentPosition:  ci + 1,
          positionDelta,
          similarityScore:  simScore,
          contentChanged,
        })
      } else {
        newResults++
        const w = config.positionWeight === "exponential"
          ? Math.exp(-ci / config.topN)
          : 1 - ci / config.topN
        totalDrift += config.newResultPenalty * w
      }
    }

    const droppedResults = prevResults.filter(
      pr => !currResults.some(cr => cr.url === pr.url)
    ).length
    totalDrift += droppedResults * config.droppedResultPenalty

    return {
      driftScore:           Math.min(100, (totalDrift / (config.topN * 15)) * 100),
      rankChanges,
      newResults,
      droppedResults,
      contentChanges,
      processingTime:       performance.now() - t0,
      identicalContentRate: rankChanges.length > 0
        ? identicalCount / rankChanges.length
        : 0,
    }
  } catch (err) {
    console.error("[DriftAnalyzer] calculateDriftScore failed:", err)
    return {
      driftScore: 0, rankChanges: [], newResults: 0,
      droppedResults: 0, contentChanges: 0,
      processingTime: performance.now() - t0, identicalContentRate: 0,
    }
  }
}

// ─── Full drift analysis for one query ───────────────────────────────────────

export async function analyzeDrift(
  queryId:   string,
  queryName: string,
  snapshots: RankingSnapshot[]
): Promise<DriftAnalysisResult> {
  const sorted = [...snapshots].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )

  const timeline:          DriftTimelinePoint[] = []
  let totalDrift           = 0
  let maxDrift             = 0
  let totalContentChanges  = 0
  let totalIdenticalRate   = 0
  let totalProcessingTime  = 0

  for (let i = 1; i < sorted.length; i++) {
    const result = await calculateDriftScore(sorted[i - 1], sorted[i])

    timeline.push({
      timestamp:          new Date(sorted[i].timestamp),
      snapshotId:         sorted[i].id,
      previousSnapshotId: sorted[i - 1].id,
      driftScore:         result.driftScore,
      rankChanges:        result.rankChanges,
      newResults:         result.newResults,
      droppedResults:     result.droppedResults,
      contentChanges:     result.contentChanges,
      processingTime:     result.processingTime,
    })

    totalDrift          += result.driftScore
    maxDrift             = Math.max(maxDrift, result.driftScore)
    totalContentChanges += result.contentChanges
    totalIdenticalRate  += result.identicalContentRate
    totalProcessingTime += result.processingTime
  }

  const n            = timeline.length
  const averageDrift = n > 0 ? totalDrift / n : 0
  const latestDrift  = n > 0 ? timeline[n - 1].driftScore : 0

  const stability: DriftAnalysisResult["stability"] =
    averageDrift < 20 ? "stable" : averageDrift < 50 ? "medium" : "volatile"

  let driftTrend: DriftAnalysisResult["driftTrend"] = "stable"
  if (n >= 3) {
    const recent = timeline.slice(-3).map(p => p.driftScore)
    const slope  = (recent[2] - recent[0]) / 2
    driftTrend   = slope < -5 ? "improving" : slope > 5 ? "worsening" : "stable"
  }

  return {
    queryId,
    queryName,
    driftTimeline:       timeline,
    averageDrift,
    maxDrift,
    latestDrift,
    stability,
    driftTrend,
    totalContentChanges,
    averageCacheHitRate: n > 0 ? totalIdenticalRate / n : 0,
    totalProcessingTime,
  }
}

// ─── Multi-query drift analysis ───────────────────────────────────────────────

export async function analyzeDriftForQueries(
  queries:      { id: string; name: string }[],
  allSnapshots: RankingSnapshot[]
): Promise<DriftAnalysisResult[]> {
  const settled = await Promise.allSettled(
    queries.map(async q => {
      const snaps = allSnapshots.filter(s => s.queryId === q.id)
      if (snaps.length < 2) return null
      return analyzeDrift(q.id, q.name, snaps)
    })
  )

  return settled
    .filter((r): r is PromiseFulfilledResult<DriftAnalysisResult | null> =>
      r.status === "fulfilled" && r.value !== null
    )
    .map(r => r.value!)
    .filter(r => r.driftTimeline.length > 0)
}