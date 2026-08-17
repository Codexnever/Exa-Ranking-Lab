// lib/drift-analyzer.ts
//
// Uses EmbeddingService (Gemini → OpenAI fallback → position-only) for
// semantic similarity. Direct Gemini calls replaced with the abstraction
// layer that adds persistent Weaviate cache + provider fallback chain.
//
// Also integrates DriftDecomposer — every snapshot-pair comparison now
// returns typed drift (content / competitor / rerank) in addition to the
// single driftScore for backward compatibility.
//
// Model specs (GA April 2026):
//   - Model ID: gemini-embedding-2-preview (corrected from gemini-embedding-2)
//   - Input token limit: 8,192 (~32,000 chars)
//   - Output dimensions: 768 (balanced speed/quality)
//   - REST: https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2-preview

import type {
  RankingSnapshot,
  DriftAnalysisResult,
  DriftTimelinePoint,
  RankChange,
  SearchResult,
} from "@/types/type"
import { createHash } from "crypto"

//  NEW: EmbeddingService replaces all direct Gemini calls
import { getEmbeddingService, type EmbeddingMode } from "@/app/services/EmbeddingService"

//  NEW: DriftDecomposer splits single score into 3 typed signals
import { DriftDecomposer } from "@/app/services/DriftDecomposer"

// ─── Cosine similarity ────────────────────────────────────────────────────────

export function cosineSimilarity(a: number[], b: number[]): number {
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

function computeContentHash(
  title:    string,
  snippet:  string,
  url:      string,
  fulltext: string
): string {
  const s = `${title ?? ""}|${snippet ?? ""}|${fulltext.slice(0, 5000)}|${url ?? ""}`
    .trim()
    .toLowerCase()
  return createHash("sha256").update(s).digest("hex")
}

// ─── SearchResult helpers ─────────────────────────────────────────────────────

function getCombinedText(r: SearchResult): string {
  return [
    `title: ${r.title ?? "none"}`,
    `text: ${r.snippet ?? ""}`,
    `fullText: ${r.fullText?.slice(0, 5000) ?? ""}`,
    `url: ${r.url ?? ""}`,
  ].join(" | ")
}

function getContentHash(r: SearchResult): string {
  return r.contentHash || computeContentHash(
    r.title ?? "", r.snippet ?? "", r.url ?? "",
    r.fullText?.slice(0, 5000) ?? ""
  )
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
  resultsCompared:      number
  //  NEW: embedding mode used for this comparison
  embeddingMode:        EmbeddingMode
  //  NEW: full decomposed breakdown (content / competitor / rerank)
  decomposedDrift:      ReturnType<typeof DriftDecomposer.decompose>
}> {
  const t0 = performance.now()

  try {
    const prevResults = prev.results.slice(0, config.topN)
    const currResults = curr.results.slice(0, config.topN)

    // ── Fast path: identical content hashes — skip all API calls ──────────
    if (config.useContentHashOptimization) {
      const prevHashes = prevResults.map(getContentHash)
      const currHashes = currResults.map(getContentHash)

      const allIdentical = prevHashes.length === currHashes.length &&
        prevHashes.every((h, i) => h === currHashes[i])

      if (allIdentical) {
        //  Still run DriftDecomposer on fast path — position drift may
        // still exist even with identical content hashes
        const positionOnlyScore = calculatePositionOnlyDrift(prevResults, currResults, config)

        // Build identity vecMap (no real vectors needed — decomposer
        // handles empty maps gracefully, relying on hash comparison)
        const emptyVecMap = new Map<string, number[]>()

        const decomposed = DriftDecomposer.decompose({
          prev,
          curr,
          prevEmbeddings: emptyVecMap,
          currEmbeddings: emptyVecMap,
          topN:           config.topN,
        })

        return {
          driftScore:           positionOnlyScore,
          rankChanges:          [],
          newResults:           0,
          droppedResults:       0,
          contentChanges:       0,
          processingTime:       performance.now() - t0,
          identicalContentRate: 1.0,
          resultsCompared:      currResults.length,
          embeddingMode:        "gemini",  // fast path — no model needed
          decomposedDrift:      decomposed,
        }
      }
    }

    const prevUrlMap = new Map(prevResults.map(r => [r.url, r]))

    // ── Collect unique texts for a single batch embedding call ────────────
    const textByHash = new Map<string, string>()
    for (const r of [...prevResults, ...currResults]) {
      const h = getContentHash(r)
      if (!textByHash.has(h)) textByHash.set(h, getCombinedText(r))
    }

    const uniqueHashes = [...textByHash.keys()]
    const uniqueTexts  = [...textByHash.values()]

    //  CHANGED: use EmbeddingService instead of direct Gemini calls.
    // EmbeddingService handles:
    //   1. Persistent Weaviate cache (survives cold starts)
    //   2. In-process LRU cache (sub-ms hot path)
    //   3. Gemini gemini-embedding-2-preview (primary)
    //   4. OpenAI text-embedding-3-small (fallback)
    //   5. Position-only degradation (if both providers fail)
    const embSvc = getEmbeddingService()
    const batchResult = await embSvc.embedBatch(uniqueTexts, uniqueHashes)

    const { vectors, mode: embeddingMode } = batchResult

    // If position-only degradation: vectors are null — skip cosine similarity
    const isPositionOnly = embeddingMode === "position-only"

    const vecMap = new Map<string, number[]>()
    uniqueHashes.forEach((h, i) => {
      if (vectors[i]?.length) vecMap.set(h, vectors[i]!)
    })

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
        const pi             = prevResults.findIndex(r => r.url === currR.url)
        const positionDelta  = pi - ci
        const prevHash       = getContentHash(prevR)
        const currHash       = getContentHash(currR)
        const contentChanged = prevHash !== currHash

        let simScore: number
        if (!contentChanged) {
          simScore = 1.0
          identicalCount++
        } else if (isPositionOnly) {
          // Position-only degradation — no cosine similarity available
          simScore = 0.5  // neutral assumption when AI is unavailable
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

    // ✅ NEW: run DriftDecomposer with the real vecMaps we just built
    const decomposedDrift = DriftDecomposer.decompose({
      prev,
      curr,
      prevEmbeddings: vecMap,
      currEmbeddings: vecMap,
      topN:           config.topN,
    })

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
      resultsCompared:      rankChanges.length,
      embeddingMode,
      decomposedDrift,
    }
  } catch (err) {
    console.error("[DriftAnalyzer] calculateDriftScore failed:", err)

    // ✅ Fallback decomposed drift on error
    const emptyDecomposed = DriftDecomposer.decompose({
      prev,
      curr,
      prevEmbeddings: new Map(),
      currEmbeddings: new Map(),
      topN: config.topN,
    })

    return {
      driftScore:           0,
      rankChanges:          [],
      newResults:           0,
      droppedResults:       0,
      contentChanges:       0,
      processingTime:       performance.now() - t0,
      identicalContentRate: 0,
      resultsCompared:      0,
      embeddingMode:        "position-only",
      decomposedDrift:      emptyDecomposed,
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

  const timeline:              DriftTimelinePoint[]                        = []
  let   totalDrift             = 0
  let   maxDrift               = 0
  let   totalContentChanges    = 0
  let   totalIdenticalRate     = 0
  let   totalProcessingTime    = 0
  let   totalResultsCompared   = 0
  //  NEW: aggregate decomposed drift across timeline
  let   totalContentDrift      = 0
  let   totalCompetitorDrift   = 0
  let   totalRerankDrift       = 0
  //  Track which embedding mode was used most (for UI badge)
  const embeddingModes: EmbeddingMode[] = []

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
      // ✅ NEW: attach decomposed breakdown to each timeline point
      decomposedDrift:    result.decomposedDrift,
    })

    totalDrift           += result.driftScore
    maxDrift              = Math.max(maxDrift, result.driftScore)
    totalContentChanges  += result.contentChanges
    totalIdenticalRate   += result.identicalContentRate
    totalProcessingTime  += result.processingTime
    totalResultsCompared += result.resultsCompared
    // ✅ NEW
    totalContentDrift    += result.decomposedDrift.contentDrift
    totalCompetitorDrift += result.decomposedDrift.competitorDrift
    totalRerankDrift     += result.decomposedDrift.rerankDrift
    embeddingModes.push(result.embeddingMode)
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

  // ✅ Dominant embedding mode across this analysis run
  const modeCount = embeddingModes.reduce((acc, m) => {
    acc[m] = (acc[m] ?? 0) + 1
    return acc
  }, {} as Record<EmbeddingMode, number>)
  const dominantMode = (Object.entries(modeCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "gemini") as EmbeddingMode

  // ✅ Aggregate decomposed drift for the whole query timeline
  const aggregateDecomposed = DriftDecomposer.aggregateTimeline(
    timeline.map(t => t.decomposedDrift).filter(Boolean) as ReturnType<typeof DriftDecomposer.decompose>[]
  )

  return {
    queryId,
    queryName,
    driftTimeline:          timeline,
    averageDrift,
    maxDrift,
    latestDrift,
    stability,
    driftTrend,
    totalContentChanges,
    totalResultsCompared,
    //  FIXED: real embedding cache hit rate from EmbeddingService
    averageCacheHitRate:    getEmbeddingService().cacheStats.lruHitRate,
    //  Content stability rate — separate from cache hit rate
    contentStabilityRate:   n > 0 ? totalIdenticalRate / n : 0,
    totalProcessingTime,
    //  NEW: embedding mode used during this analysis
    embeddingMode:          dominantMode,
    //  NEW: decomposed drift aggregates
    avgContentDrift:        n > 0 ? totalContentDrift    / n : 0,
    avgCompetitorDrift:     n > 0 ? totalCompetitorDrift / n : 0,
    avgRerankDrift:         n > 0 ? totalRerankDrift     / n : 0,
    dominantDriftCause:     aggregateDecomposed.dominantCause,
    //  Latest snapshot's decomposed drift for the detail page
    decomposedDrift:        timeline[n - 1]?.decomposedDrift ?? null,
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
