// lib/drift-analyzer.ts

import { createHash } from "crypto"

import type {
  RankingSnapshot,
  DriftAnalysisResult,
  DriftTimelinePoint,
  RankChange,
  SearchResult,
} from "@/types/type"

import {
  getEmbeddingService,
  type EmbeddingMode,
} from "@/app/services/EmbeddingService"
import { DriftDecomposer } from "@/app/services/DriftDecomposer"

export function cosineSimilarity(
  a: number[],
  b: number[],
): number {
  if (!a?.length || !b?.length || a.length !== b.length) {
    return 0
  }

  let dot = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB)

  if (denominator === 0) {
    return 0
  }

  return Math.max(
    -1,
    Math.min(1, dot / denominator),
  )
}

function computeContentHash(
  title: string,
  snippet: string,
  url: string,
  fulltext: string,
): string {
  const content = [
    title ?? "",
    snippet ?? "",
    fulltext.slice(0, 5000),
    url ?? "",
  ]
    .join("|")
    .trim()
    .toLowerCase()

  return createHash("sha256")
    .update(content)
    .digest("hex")
}

function getCombinedText(result: SearchResult): string {
  return [
    `title: ${result.title ?? "none"}`,
    `text: ${result.snippet ?? ""}`,
    `fullText: ${result.fullText?.slice(0, 5000) ?? ""}`,
    `url: ${result.url ?? ""}`,
  ].join(" | ")
}

function getContentHash(result: SearchResult): string {
  if (result.contentHash) {
    return result.contentHash
  }

  return computeContentHash(
    result.title ?? "",
    result.snippet ?? "",
    result.url ?? "",
    result.fullText?.slice(0, 5000) ?? "",
  )
}

interface DriftConfig {
  topN: number
  positionWeight: "linear" | "exponential"
  similarityThreshold: number
  newResultPenalty: number
  droppedResultPenalty: number
  useContentHashOptimization: boolean
  contentChangeBonus: number
}

const DEFAULT_DRIFT_CONFIG: DriftConfig = {
  topN: 10,
  positionWeight: "linear",
  similarityThreshold: 0.8,
  newResultPenalty: 5,
  droppedResultPenalty: 3,
  useContentHashOptimization: true,
  contentChangeBonus: 2.0,
}

function calculatePositionOnlyDrift(
  previousResults: SearchResult[],
  currentResults: SearchResult[],
  config: DriftConfig,
): number {
  const previousPositions = new Map(
    previousResults.map((result, index) => [
      result.url,
      index,
    ]),
  )

  let total = 0

  for (
    let currentIndex = 0;
    currentIndex < currentResults.length;
    currentIndex++
  ) {
    const previousIndex = previousPositions.get(
      currentResults[currentIndex].url,
    )

    if (previousIndex === undefined) {
      continue
    }

    const weight =
      config.positionWeight === "exponential"
        ? Math.exp(-currentIndex / config.topN)
        : 1 - currentIndex / config.topN

    total +=
      Math.abs(previousIndex - currentIndex) *
      weight
  }

  return Math.min(
    100,
    (total / (config.topN * 5)) * 100,
  )
}

export async function calculateDriftScore(
  previousSnapshot: RankingSnapshot,
  currentSnapshot: RankingSnapshot,
  config: DriftConfig = DEFAULT_DRIFT_CONFIG,
): Promise<{
  driftScore: number
  rankChanges: RankChange[]
  newResults: number
  droppedResults: number
  contentChanges: number
  processingTime: number
  identicalContentRate: number
  resultsCompared: number
  embeddingMode: EmbeddingMode
  decomposedDrift: ReturnType<
    typeof DriftDecomposer.decompose
  >
}> {
  const startedAt = performance.now()

  try {
    const previousResults =
      previousSnapshot.results.slice(0, config.topN)

    const currentResults =
      currentSnapshot.results.slice(0, config.topN)

    if (config.useContentHashOptimization) {
      const previousHashes =
        previousResults.map(getContentHash)

      const currentHashes =
        currentResults.map(getContentHash)

      const allIdentical =
        previousHashes.length === currentHashes.length &&
        previousHashes.every(
          (hash, index) =>
            hash === currentHashes[index],
        )

      if (allIdentical) {
        // Avoid embedding calls when the compared content is unchanged.
        const positionOnlyScore =
          calculatePositionOnlyDrift(
            previousResults,
            currentResults,
            config,
          )

        const emptyEmbeddings =
          new Map<string, number[]>()

        const decomposedDrift =
          DriftDecomposer.decompose({
            prev: previousSnapshot,
            curr: currentSnapshot,
            prevEmbeddings: emptyEmbeddings,
            currEmbeddings: emptyEmbeddings,
            topN: config.topN,
          })

        return {
          driftScore: positionOnlyScore,
          rankChanges: [],
          newResults: 0,
          droppedResults: 0,
          contentChanges: 0,
          processingTime:
            performance.now() - startedAt,
          identicalContentRate: 1,
          resultsCompared: currentResults.length,
          embeddingMode: "gemini",
          decomposedDrift,
        }
      }
    }

    const previousResultsByUrl = new Map(
      previousResults.map((result) => [
        result.url,
        result,
      ]),
    )

    // Deduplicate content before embedding so identical content is embedded once.
    const textByHash = new Map<string, string>()

    for (const result of [
      ...previousResults,
      ...currentResults,
    ]) {
      const hash = getContentHash(result)

      if (!textByHash.has(hash)) {
        textByHash.set(
          hash,
          getCombinedText(result),
        )
      }
    }

    const uniqueHashes = [...textByHash.keys()]
    const uniqueTexts = [...textByHash.values()]

    // EmbeddingService owns caching, provider fallback, and graceful degradation.
    const embeddingService =
      getEmbeddingService()

    const batchResult =
      await embeddingService.embedBatch(
        uniqueTexts,
        uniqueHashes,
      )

    const {
      vectors,
      mode: embeddingMode,
    } = batchResult

    const isPositionOnly =
      embeddingMode === "position-only"

    const embeddingsByHash =
      new Map<string, number[]>()

    uniqueHashes.forEach((hash, index) => {
      const vector = vectors[index]

      if (vector?.length) {
        embeddingsByHash.set(hash, vector)
      }
    })

    const rankChanges: RankChange[] = []

    let totalDrift = 0
    let newResults = 0
    let contentChanges = 0
    let identicalCount = 0

    for (
      let currentIndex = 0;
      currentIndex < currentResults.length;
      currentIndex++
    ) {
      const currentResult =
        currentResults[currentIndex]

      const previousResult =
        previousResultsByUrl.get(
          currentResult.url,
        )

      if (previousResult) {
        const previousIndex =
          previousResults.findIndex(
            (result) =>
              result.url === currentResult.url,
          )

        const positionDelta =
          previousIndex - currentIndex

        const previousHash =
          getContentHash(previousResult)

        const currentHash =
          getContentHash(currentResult)

        const contentChanged =
          previousHash !== currentHash

        let similarityScore: number

        if (!contentChanged) {
          similarityScore = 1
          identicalCount++
        } else if (isPositionOnly) {
          // Use a neutral similarity value when embedding providers are unavailable.
          similarityScore = 0.5
        } else {
          const previousVector =
            embeddingsByHash.get(previousHash)

          const currentVector =
            embeddingsByHash.get(currentHash)

          similarityScore =
            previousVector && currentVector
              ? cosineSimilarity(
                  previousVector,
                  currentVector,
                )
              : 0
        }

        if (contentChanged) {
          contentChanges++
        }

        const weight =
          config.positionWeight === "exponential"
            ? Math.exp(
                -currentIndex / config.topN,
              )
            : 1 -
              currentIndex / config.topN

        const similarityDecay = Math.max(
          0,
          1 - similarityScore,
        )

        const contentMultiplier =
          contentChanged
            ? config.contentChangeBonus
            : 1

        const thresholdMultiplier =
          similarityScore <
          config.similarityThreshold
            ? 1.5
            : 1

        totalDrift +=
          Math.abs(positionDelta) *
          weight *
          (1 + similarityDecay) *
          contentMultiplier *
          thresholdMultiplier

        rankChanges.push({
          url: currentResult.url,
          title: currentResult.title,
          previousPosition: previousIndex + 1,
          currentPosition: currentIndex + 1,
          positionDelta,
          similarityScore,
          contentChanged,
        })

        continue
      }

      newResults++

      const weight =
        config.positionWeight === "exponential"
          ? Math.exp(
              -currentIndex / config.topN,
            )
          : 1 -
            currentIndex / config.topN

      totalDrift +=
        config.newResultPenalty * weight
    }

    const droppedResults =
      previousResults.filter(
        (previousResult) =>
          !currentResults.some(
            (currentResult) =>
              currentResult.url ===
              previousResult.url,
          ),
      ).length

    totalDrift +=
      droppedResults *
      config.droppedResultPenalty

    // Reuse the generated vectors when decomposing the final drift signal.
    const decomposedDrift =
      DriftDecomposer.decompose({
        prev: previousSnapshot,
        curr: currentSnapshot,
        prevEmbeddings: embeddingsByHash,
        currEmbeddings: embeddingsByHash,
        topN: config.topN,
      })

    return {
      driftScore: Math.min(
        100,
        (totalDrift /
          (config.topN * 15)) *
          100,
      ),
      rankChanges,
      newResults,
      droppedResults,
      contentChanges,
      processingTime:
        performance.now() - startedAt,
      identicalContentRate:
        rankChanges.length > 0
          ? identicalCount /
            rankChanges.length
          : 0,
      resultsCompared: rankChanges.length,
      embeddingMode,
      decomposedDrift,
    }
  } catch (error) {
    console.error(
      "[DriftAnalyzer] calculateDriftScore failed:",
      error,
    )

    // Preserve a valid drift response even when embedding or scoring fails.
    const decomposedDrift =
      DriftDecomposer.decompose({
        prev: previousSnapshot,
        curr: currentSnapshot,
        prevEmbeddings: new Map(),
        currEmbeddings: new Map(),
        topN: config.topN,
      })

    return {
      driftScore: 0,
      rankChanges: [],
      newResults: 0,
      droppedResults: 0,
      contentChanges: 0,
      processingTime:
        performance.now() - startedAt,
      identicalContentRate: 0,
      resultsCompared: 0,
      embeddingMode: "position-only",
      decomposedDrift,
    }
  }
}

export async function analyzeDrift(
  queryId: string,
  queryName: string,
  snapshots: RankingSnapshot[],
): Promise<DriftAnalysisResult> {
  const sortedSnapshots = [...snapshots].sort(
    (a, b) =>
      new Date(a.timestamp).getTime() -
      new Date(b.timestamp).getTime(),
  )

  const timeline: DriftTimelinePoint[] = []

  let totalDrift = 0
  let maxDrift = 0
  let totalContentChanges = 0
  let totalIdenticalRate = 0
  let totalProcessingTime = 0
  let totalResultsCompared = 0

  let totalContentDrift = 0
  let totalCompetitorDrift = 0
  let totalRerankDrift = 0

  const embeddingModes: EmbeddingMode[] = []

  for (
    let index = 1;
    index < sortedSnapshots.length;
    index++
  ) {
    const previousSnapshot =
      sortedSnapshots[index - 1]

    const currentSnapshot =
      sortedSnapshots[index]

    const result = await calculateDriftScore(
      previousSnapshot,
      currentSnapshot,
    )

    timeline.push({
      timestamp: new Date(
        currentSnapshot.timestamp,
      ),
      snapshotId: currentSnapshot.id,
      previousSnapshotId:
        previousSnapshot.id,
      driftScore: result.driftScore,
      rankChanges: result.rankChanges,
      newResults: result.newResults,
      droppedResults: result.droppedResults,
      contentChanges: result.contentChanges,
      processingTime: result.processingTime,
      decomposedDrift:
        result.decomposedDrift,
    })

    totalDrift += result.driftScore
    maxDrift = Math.max(
      maxDrift,
      result.driftScore,
    )

    totalContentChanges +=
      result.contentChanges

    totalIdenticalRate +=
      result.identicalContentRate

    totalProcessingTime +=
      result.processingTime

    totalResultsCompared +=
      result.resultsCompared

    totalContentDrift +=
      result.decomposedDrift.contentDrift

    totalCompetitorDrift +=
      result.decomposedDrift.competitorDrift

    totalRerankDrift +=
      result.decomposedDrift.rerankDrift

    embeddingModes.push(
      result.embeddingMode,
    )
  }

  const comparisonCount = timeline.length

  const averageDrift =
    comparisonCount > 0
      ? totalDrift / comparisonCount
      : 0

  const latestDrift =
    comparisonCount > 0
      ? timeline[comparisonCount - 1]
          .driftScore
      : 0

  const stability: DriftAnalysisResult["stability"] =
    averageDrift < 20
      ? "stable"
      : averageDrift < 50
        ? "medium"
        : "volatile"

  let driftTrend: DriftAnalysisResult["driftTrend"] =
    "stable"

  if (comparisonCount >= 3) {
    const recentScores = timeline
      .slice(-3)
      .map((point) => point.driftScore)

    const slope =
      (recentScores[2] -
        recentScores[0]) /
      2

    driftTrend =
      slope < -5
        ? "improving"
        : slope > 5
          ? "worsening"
          : "stable"
  }

  const modeCounts =
    embeddingModes.reduce(
      (counts, mode) => {
        counts[mode] =
          (counts[mode] ?? 0) + 1

        return counts
      },
      {} as Record<EmbeddingMode, number>,
    )

  const dominantMode = (
    Object.entries(modeCounts).sort(
      (a, b) => b[1] - a[1],
    )[0]?.[0] ?? "gemini"
  ) as EmbeddingMode

  // Aggregate typed drift signals across the complete snapshot timeline.
  const aggregateDecomposed =
    DriftDecomposer.aggregateTimeline(
      timeline
        .map(
          (point) =>
            point.decomposedDrift,
        )
        .filter(Boolean) as ReturnType<
        typeof DriftDecomposer.decompose
      >[],
    )

  return {
    queryId,
    queryName,
    driftTimeline: timeline,
    averageDrift,
    maxDrift,
    latestDrift,
    stability,
    driftTrend,
    totalContentChanges,
    totalResultsCompared,
    averageCacheHitRate:
      getEmbeddingService().cacheStats
        .lruHitRate,
    contentStabilityRate:
      comparisonCount > 0
        ? totalIdenticalRate /
          comparisonCount
        : 0,
    totalProcessingTime,
    embeddingMode: dominantMode,
    avgContentDrift:
      comparisonCount > 0
        ? totalContentDrift /
          comparisonCount
        : 0,
    avgCompetitorDrift:
      comparisonCount > 0
        ? totalCompetitorDrift /
          comparisonCount
        : 0,
    avgRerankDrift:
      comparisonCount > 0
        ? totalRerankDrift /
          comparisonCount
        : 0,
    dominantDriftCause:
      aggregateDecomposed.dominantCause,
    decomposedDrift:
      timeline[comparisonCount - 1]
        ?.decomposedDrift ?? null,
  }
}

export async function analyzeDriftForQueries(
  queries: {
    id: string
    name: string
  }[],
  allSnapshots: RankingSnapshot[],
): Promise<DriftAnalysisResult[]> {
  const settled =
    await Promise.allSettled(
      queries.map(async (query) => {
        const snapshots =
          allSnapshots.filter(
            (snapshot) =>
              snapshot.queryId === query.id,
          )

        if (snapshots.length < 2) {
          return null
        }

        return analyzeDrift(
          query.id,
          query.name,
          snapshots,
        )
      }),
    )

  return settled
    .filter(
      (
        result,
      ): result is PromiseFulfilledResult<
        DriftAnalysisResult | null
      > =>
        result.status === "fulfilled" &&
        result.value !== null,
    )
    .map((result) => result.value!)
    .filter(
      (result) =>
        result.driftTimeline.length > 0,
    )
}