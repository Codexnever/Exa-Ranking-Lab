// lib/services/DriftDecomposer.ts
//
// Splits a single driftScore into three typed signals, each requiring
// a different response from an SEO/content strategist:
//
//   CONTENT DRIFT    — URL kept its position, page content changed semantically
//   COMPETITOR DRIFT — new URL entered the SERP, displaced a known result
//   RERANK DRIFT     — URL moved position, content unchanged (pure algo signal)
//
// INTEGRATION: call DriftDecomposer.decompose() inside analyzeDrift(),
// attach DecomposedDrift to DriftTimelinePoint and DriftAnalysisResult.

import { cosineSimilarity } from "@/utils/vector-utils"
import type { RankingSnapshot, SearchResult } from "@/types/type"

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DecomposedDrift {
  // Semantic content changed on a URL that stayed in the results
  // High contentDrift = page is answering a different question than before
  contentDrift: number

  // New URLs entered top-K, displacing URLs that were there before
  // High competitorDrift = competitive landscape changed
  competitorDrift: number

  // URLs moved positions but their content is unchanged
  // High rerankDrift = pure algorithmic re-ordering
  rerankDrift: number

  // Weighted total (backward-compatible with existing driftScore usage)
  total: number

  // Human-readable dominant cause
  dominantCause: "content" | "competitor" | "rerank" | "mixed" | "stable"

  // Detailed breakdown for UI display
  breakdown: {
    contentChangedUrls:   string[]  // URLs whose content changed
    newCompetitorUrls:    string[]  // URLs that newly appeared
    droppedUrls:          string[]  // URLs that disappeared
    rerankedUrls:         Array<{
      url:           string
      previousRank:  number
      currentRank:   number
      delta:         number
    }>
  }
}

export interface DecomposeInput {
  prev:           RankingSnapshot
  curr:           RankingSnapshot
  prevEmbeddings: Map<string, number[]>  // contentHash → vector
  currEmbeddings: Map<string, number[]>
  topN?:          number
}

// ─── Weights ─────────────────────────────────────────────────────────────────
// How much each drift type contributes to the final total score.
// Tunable — content drift weighted highest because it's the most actionable
// signal (it means your content strategy is misaligned with intent drift).

const WEIGHTS = {
  content:    0.50,
  competitor: 0.30,
  rerank:     0.20,
}

// ─── DriftDecomposer ─────────────────────────────────────────────────────────

export class DriftDecomposer {

  /**
   * Main decomposition entry point.
   * Returns all three typed drift scores + dominant cause + full breakdown.
   */
  static decompose(input: DecomposeInput): DecomposedDrift {
    const topN        = input.topN ?? 10
    const prevResults = input.prev.results.slice(0, topN)
    const currResults = input.curr.results.slice(0, topN)

    const prevUrlMap = new Map(prevResults.map(r => [r.url, r]))
    const currUrlSet = new Set(currResults.map(r => r.url))

    const contentChangedUrls: string[] = []
    const newCompetitorUrls:  string[] = []
    const droppedUrls:        string[] = []
    const rerankedUrls:       DecomposedDrift["breakdown"]["rerankedUrls"] = []

    let contentDriftTotal    = 0
    let competitorDriftTotal = 0
    let rerankDriftTotal     = 0

    // ── Iterate current results ─────────────────────────────────────────────
    for (let ci = 0; ci < currResults.length; ci++) {
      const currR = currResults[ci]
      const prevR = prevUrlMap.get(currR.url)
      const weight = 1 - ci / topN  // top results weighted more heavily

      if (prevR) {
        // URL exists in both snapshots
        const prevHash = prevR.contentHash  ?? ""
        const currHash = currR.contentHash  ?? ""
        const contentChanged = prevHash !== currHash && prevHash !== "" && currHash !== ""

        const pi = prevResults.findIndex(r => r.url === currR.url)
        const positionDelta = Math.abs(pi - ci)

        if (contentChanged) {
          // CONTENT DRIFT — same URL, different content
          const prevVec = input.prevEmbeddings.get(prevHash)
          const currVec = input.currEmbeddings.get(currHash)
          const similarity = prevVec && currVec
            ? cosineSimilarity(prevVec, currVec)
            : 0  // no vector = assume maximum drift

          const semanticDrop = Math.max(0, 1 - similarity)  // 0 = identical, 1 = completely different
          contentDriftTotal += semanticDrop * weight * 100
          contentChangedUrls.push(currR.url)
        }

        if (positionDelta > 0) {
          if (!contentChanged) {
            // RERANK DRIFT — position changed, content same = pure algo signal
            rerankDriftTotal += (positionDelta / topN) * weight * 100
            rerankedUrls.push({
              url:          currR.url,
              previousRank: pi + 1,
              currentRank:  ci + 1,
              delta:        ci - pi,  // positive = fell, negative = rose
            })
          }
          // (if content also changed, that contribution is already in contentDrift)
        }
      } else {
        // COMPETITOR DRIFT — URL not in previous results = new entrant
        competitorDriftTotal += weight * 100
        newCompetitorUrls.push(currR.url)
      }
    }

    // ── Dropped URLs ────────────────────────────────────────────────────────
    for (const prevR of prevResults) {
      if (!currUrlSet.has(prevR.url)) {
        droppedUrls.push(prevR.url)
        // Dropped results also contribute to competitor drift
        // (something pushed them out)
        const pi     = prevResults.findIndex(r => r.url === prevR.url)
        const weight = 1 - pi / topN
        competitorDriftTotal += weight * 30  // lower penalty than new entrant
      }
    }

    // ── Normalize to 0-100 ──────────────────────────────────────────────────
    const normalize = (v: number) => Math.min(100, Math.max(0, v))
    const contentDrift    = normalize(contentDriftTotal)
    const competitorDrift = normalize(competitorDriftTotal)
    const rerankDrift     = normalize(rerankDriftTotal)

    // Weighted total — backward-compatible replacement for the old driftScore
    const total = normalize(
      contentDrift    * WEIGHTS.content    +
      competitorDrift * WEIGHTS.competitor +
      rerankDrift     * WEIGHTS.rerank
    )

    // ── Dominant cause ──────────────────────────────────────────────────────
    const dominantCause = DriftDecomposer.computeDominantCause(
      contentDrift, competitorDrift, rerankDrift, total
    )

    return {
      contentDrift,
      competitorDrift,
      rerankDrift,
      total,
      dominantCause,
      breakdown: {
        contentChangedUrls,
        newCompetitorUrls,
        droppedUrls,
        rerankedUrls,
      },
    }
  }

  /**
   * Aggregate decomposed drift across an entire drift timeline.
   * Returns per-type averages and the overall dominant cause.
   */
  static aggregateTimeline(points: DecomposedDrift[]): {
    avgContentDrift:    number
    avgCompetitorDrift: number
    avgRerankDrift:     number
    dominantCause:      DecomposedDrift["dominantCause"]
  } {
    if (points.length === 0) {
      return { avgContentDrift: 0, avgCompetitorDrift: 0, avgRerankDrift: 0, dominantCause: "stable" }
    }

    const avgContentDrift    = points.reduce((s, p) => s + p.contentDrift,    0) / points.length
    const avgCompetitorDrift = points.reduce((s, p) => s + p.competitorDrift, 0) / points.length
    const avgRerankDrift     = points.reduce((s, p) => s + p.rerankDrift,     0) / points.length

    const dominantCause = DriftDecomposer.computeDominantCause(
      avgContentDrift, avgCompetitorDrift, avgRerankDrift,
      (avgContentDrift + avgCompetitorDrift + avgRerankDrift) / 3
    )

    return { avgContentDrift, avgCompetitorDrift, avgRerankDrift, dominantCause }
  }

  // ── Helper ────────────────────────────────────────────────────────────────

  private static computeDominantCause(
    content:    number,
    competitor: number,
    rerank:     number,
    total:      number
  ): DecomposedDrift["dominantCause"] {
    if (total < 10) return "stable"

    const max = Math.max(content, competitor, rerank)
    const threshold = 0.5 * (content + competitor + rerank)

    // "mixed" if no single type contributes more than 50%
    if (max < threshold) return "mixed"

    if (max === content)    return "content"
    if (max === competitor) return "competitor"
    return "rerank"
  }
}