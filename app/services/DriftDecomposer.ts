// lib/services/DriftDecomposer.ts
//
// Decomposes observed ranking drift into three independent signals:
//
//   CONTENT DRIFT
//     Existing documents whose observed content representation changed.
//
//   SERP TURNOVER
//     New documents entering the top-K and previous documents leaving it.
//
//   RERANK DRIFT
//     Content-stable documents changing position within the top-K.
//
// These are observational signals. They describe what changed between
// two observed result sets and do not prove an internal ranking-algorithm
// change.
//
// INTEGRATION:
//   Call DriftDecomposer.decompose() from analyzeDrift() and attach the
//   returned DecomposedDrift to the corresponding DriftTimelinePoint.

import { cosineSimilarity } from "@/utils/vector-utils"
import type { RankingSnapshot, SearchResult } from "@/types/type"
import { getDocumentIdentity } from "@/utils/canonicalize-document-url"
import { getContentHash } from "@/utils/content-identity"

// ─── Helpers ────────────────────────────────────────────────────────────────

function getDocumentKey(result: SearchResult): string {
  return getDocumentIdentity(result.url).documentKey
}

function getRankWeight(index: number, topN: number): number {
  if (topN <= 0) return 0

  // Rank 1 = 1.0
  // Rank 2 = 0.9 for topN=10
  // ...
  // Rank 10 = 0.1 for topN=10
  return Math.max(0, 1 - index / topN)
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
}

function average(values: number[]): number {
  if (values.length === 0) return 0

  return values.reduce((sum, value) => sum + value, 0) / values.length
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DecomposedDrift {
  /**
   * Semantic change observed on documents that existed in both snapshots.
   *
   * Higher values mean the observed content representation became
   * semantically less similar.
   */
  contentDrift: number

  /**
   * Weighted result-set turnover.
   *
   * Measures how much of the observed top-K result set was replaced by
   * new/dropped documents.
   */
  competitorDrift: number

  /**
   * Observed positional reordering among documents whose content remained
   * unchanged.
   *
   * This is an observational ranking signal, not proof of an algorithm
   * change.
   */
  rerankDrift: number

  /**
   * Weighted combined score.
   *
   * Kept as `total` for compatibility with the existing API.
   */
  total: number

  /**
   * Dominant observed cause.
   */
  dominantCause: "content" | "competitor" | "rerank" | "mixed" | "stable"

  /**
   * Human-readable evidence for the decomposition.
   */
  breakdown: {
    contentChangedUrls: string[]
    newCompetitorUrls: string[]
    droppedUrls: string[]

    rerankedUrls: Array<{
      url: string
      previousRank: number
      currentRank: number
      delta: number
    }>
  }
}

export interface DecomposeInput {
  prev: RankingSnapshot
  curr: RankingSnapshot

  /**
   * Embeddings keyed by content hash.
   */
  prevEmbeddings: Map<string, number[]>
  currEmbeddings: Map<string, number[]>

  topN?: number
}

// ─── Weights ────────────────────────────────────────────────────────────────

/**
 * Product-level calibration weights.
 *
 * These determine how the three observed signals contribute to `total`.
 * They do not claim that one type of drift is objectively more important
 * than another.
 */
const WEIGHTS = {
  content: 0.50,
  competitor: 0.30,
  rerank: 0.20,
} as const

// ─── DriftDecomposer ────────────────────────────────────────────────────────

export class DriftDecomposer {
  /**
   * Decompose drift between two ranking snapshots.
   */
  static decompose(input: DecomposeInput): DecomposedDrift {
    const topN = Math.max(1, input.topN ?? 10)

    const prevResults = input.prev.results.slice(0, topN)
    const currResults = input.curr.results.slice(0, topN)

    // -----------------------------------------------------------------------
    // Build canonical document maps.
    //
    // A document is identified independently from its observed content.
    // This lets us distinguish:
    //
    //   same document + changed content
    //   same document + changed position
    //   new document
    //   dropped document
    // -----------------------------------------------------------------------

    const prevDocumentMap = new Map<string, SearchResult>()
    const prevIndexMap = new Map<string, number>()

    for (let index = 0; index < prevResults.length; index++) {
      const result = prevResults[index]
      const documentKey = getDocumentKey(result)

      // Keep the first occurrence if duplicate canonical URLs appear.
      if (!prevDocumentMap.has(documentKey)) {
        prevDocumentMap.set(documentKey, result)
        prevIndexMap.set(documentKey, index)
      }
    }

    const currDocumentMap = new Map<string, SearchResult>()
    const currIndexMap = new Map<string, number>()

    for (let index = 0; index < currResults.length; index++) {
      const result = currResults[index]
      const documentKey = getDocumentKey(result)

      if (!currDocumentMap.has(documentKey)) {
        currDocumentMap.set(documentKey, result)
        currIndexMap.set(documentKey, index)
      }
    }

    const contentChangedUrls: string[] = []
    const newCompetitorUrls: string[] = []
    const droppedUrls: string[] = []

    const rerankedUrls: DecomposedDrift["breakdown"]["rerankedUrls"] = []

    let contentDriftTotal = 0
    let rerankDriftTotal = 0

    // -----------------------------------------------------------------------
    // CONTENT + RERANK + NEW RESULTS
    // -----------------------------------------------------------------------

    for (let ci = 0; ci < currResults.length; ci++) {
      const currResult = currResults[ci]
      const documentKey = getDocumentKey(currResult)

      const prevResult = prevDocumentMap.get(documentKey)
      const currentWeight = getRankWeight(ci, topN)

      // ── New result ───────────────────────────────────────────────────────
      if (!prevResult) {
        newCompetitorUrls.push(currResult.url)
        continue
      }

      const previousIndex = prevIndexMap.get(documentKey)

      if (previousIndex === undefined) {
        continue
      }

      const prevHash = getContentHash(prevResult)
      const currHash = getContentHash(currResult)

      const contentChanged =
        prevHash !== currHash &&
        prevHash !== "" &&
        currHash !== ""

      // ── Content drift ────────────────────────────────────────────────────
      if (contentChanged) {
        const prevVector = input.prevEmbeddings.get(prevHash)
        const currVector = input.currEmbeddings.get(currHash)

        let similarity = 0

        if (prevVector && currVector) {
          similarity = cosineSimilarity(prevVector, currVector)
        }

        // cosineSimilarity should normally already be bounded, but clamp
        // here so malformed/edge-case values cannot create invalid scores.
        similarity = Math.min(1, Math.max(0, similarity))

        const semanticDrop = 1 - similarity

        contentDriftTotal +=
          semanticDrop *
          currentWeight *
          100

        contentChangedUrls.push(currResult.url)
      }

      // ── Rerank drift ─────────────────────────────────────────────────────
      //
      // Only count positional movement when the observed content did not
      // change. Otherwise the same event belongs to content drift as well
      // and should not be double-counted as pure reranking.
      if (!contentChanged) {
        const positionDelta = Math.abs(previousIndex - ci)

        if (positionDelta > 0) {
          const normalizedMovement =
            positionDelta / Math.max(1, topN - 1)

          rerankDriftTotal +=
            normalizedMovement *
            currentWeight *
            100

          rerankedUrls.push({
            url: currResult.url,
            previousRank: previousIndex + 1,
            currentRank: ci + 1,
            delta: ci - previousIndex,
          })
        }
      }
    }

    // -----------------------------------------------------------------------
    // DROPPED RESULTS
    // -----------------------------------------------------------------------

    for (let pi = 0; pi < prevResults.length; pi++) {
      const prevResult = prevResults[pi]
      const documentKey = getDocumentKey(prevResult)

      if (!currDocumentMap.has(documentKey)) {
        droppedUrls.push(prevResult.url)
      }
    }

    // -----------------------------------------------------------------------
    // NORMALIZE CONTENT DRIFT
    // -----------------------------------------------------------------------

    /**
     * Content drift is based on semantic change for each changed document.
     *
     * The maximum raw value is the sum of the rank weights * 100, so using
     * the same weighted denominator makes the score represent the weighted
     * average semantic change rather than simply accumulating until it
     * reaches 100.
     */
    const totalCurrentWeight = currResults.reduce(
      (sum, _, index) => sum + getRankWeight(index, topN),
      0,
    )

    const contentDrift =
      totalCurrentWeight > 0
        ? clampScore(
            contentDriftTotal / (totalCurrentWeight * 100) * 100,
          )
        : 0

    // -----------------------------------------------------------------------
    // NORMALIZE SERP TURNOVER
    // -----------------------------------------------------------------------

    /**
     * New and dropped documents describe the same underlying result-set
     * turnover from opposite sides:
     *
     *   current-only documents = new entrants
     *   previous-only documents = dropped documents
     *
     * We calculate a weighted replacement ratio for each side and average
     * them. This avoids double-counting a replacement as 200 points and
     * avoids the old behavior where one rank-1 new result alone saturated
     * the entire metric at 100.
     */

    const currentOnlyWeight = currResults.reduce((sum, result, index) => {
      const documentKey = getDocumentKey(result)

      if (prevDocumentMap.has(documentKey)) {
        return sum
      }

      return sum + getRankWeight(index, topN)
    }, 0)

    const previousOnlyWeight = prevResults.reduce((sum, result, index) => {
      const documentKey = getDocumentKey(result)

      if (currDocumentMap.has(documentKey)) {
        return sum
      }

      return sum + getRankWeight(index, topN)
    }, 0)

    const previousTotalWeight = prevResults.reduce(
      (sum, _, index) => sum + getRankWeight(index, topN),
      0,
    )

    const currentTotalWeight = currResults.reduce(
      (sum, _, index) => sum + getRankWeight(index, topN),
      0,
    )

    const newResultRatio =
      currentTotalWeight > 0
        ? currentOnlyWeight / currentTotalWeight
        : 0

    const droppedResultRatio =
      previousTotalWeight > 0
        ? previousOnlyWeight / previousTotalWeight
        : 0

    const competitorDrift = clampScore(
      ((newResultRatio + droppedResultRatio) / 2) * 100,
    )

    // -----------------------------------------------------------------------
    // NORMALIZE RERANK DRIFT
    // -----------------------------------------------------------------------

    /**
     * Maximum possible movement for a result is topN - 1 positions.
     *
     * Divide by the total current rank weight so the score represents the
     * weighted average positional movement among content-stable results.
     */
    let rerankDrift = 0

    if (totalCurrentWeight > 0) {
      rerankDrift = clampScore(
        rerankDriftTotal /
          (totalCurrentWeight * 100) *
          100,
      )
    }

    // -----------------------------------------------------------------------
    // WEIGHTED TOTAL
    // -----------------------------------------------------------------------

    const total = clampScore(
      contentDrift * WEIGHTS.content +
      competitorDrift * WEIGHTS.competitor +
      rerankDrift * WEIGHTS.rerank,
    )

    // -----------------------------------------------------------------------
    // DOMINANT OBSERVED CAUSE
    // -----------------------------------------------------------------------

    const dominantCause = DriftDecomposer.computeDominantCause(
      contentDrift,
      competitorDrift,
      rerankDrift,
      total,
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
   * Aggregate decomposed drift across a complete timeline.
   */
  static aggregateTimeline(points: DecomposedDrift[]): {
    avgContentDrift: number
    avgCompetitorDrift: number
    avgRerankDrift: number
    dominantCause: DecomposedDrift["dominantCause"]
  } {
    if (points.length === 0) {
      return {
        avgContentDrift: 0,
        avgCompetitorDrift: 0,
        avgRerankDrift: 0,
        dominantCause: "stable",
      }
    }

    const avgContentDrift = average(
      points.map((point) => point.contentDrift),
    )

    const avgCompetitorDrift = average(
      points.map((point) => point.competitorDrift),
    )

    const avgRerankDrift = average(
      points.map((point) => point.rerankDrift),
    )

    const aggregateTotal =
      avgContentDrift * WEIGHTS.content +
      avgCompetitorDrift * WEIGHTS.competitor +
      avgRerankDrift * WEIGHTS.rerank

    const dominantCause =
      DriftDecomposer.computeDominantCause(
        avgContentDrift,
        avgCompetitorDrift,
        avgRerankDrift,
        aggregateTotal,
      )

    return {
      avgContentDrift,
      avgCompetitorDrift,
      avgRerankDrift,
      dominantCause,
    }
  }

  // ─── Dominant cause ──────────────────────────────────────────────────────

  private static computeDominantCause(
    content: number,
    competitor: number,
    rerank: number,
    total: number,
  ): DecomposedDrift["dominantCause"] {
    // Keep the existing low-signal stability threshold.
    if (total < 10) {
      return "stable"
    }

    const max = Math.max(
      content,
      competitor,
      rerank,
    )

    const sum =
      content +
      competitor +
      rerank

    if (sum === 0) {
      return "stable"
    }

    /**
     * A signal must explain at least half of the observed decomposition
     * to be treated as dominant.
     */
    const dominanceThreshold = 0.5 * sum

    if (max < dominanceThreshold) {
      return "mixed"
    }

    // Equal strongest signals are ambiguous, so report mixed rather than
    // arbitrarily selecting one.
    const maxCount =
      [content, competitor, rerank].filter(
        (value) => value === max,
      ).length

    if (maxCount > 1) {
      return "mixed"
    }

    if (max === content) {
      return "content"
    }

    if (max === competitor) {
      return "competitor"
    }

    return "rerank"
  }
}