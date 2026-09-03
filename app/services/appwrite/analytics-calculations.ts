// lib/analytics-calculations.ts

import type {
  ContentCoherenceResult,
  SemanticStabilityResult,
} from "@/types/type"

import { VectorUtils } from "../../../utils/vector-utils"

export { calculateTimeRangeMs } from "@/app/logic/analyticsLogic"

export {
  cosineSimilarity,
  calculateCentroid,
} from "../../../utils/vector-utils"

/**
 * Calculates average pairwise cosine similarity across all vector pairs.
 *
 * This operation is O(n²), so it should only be used with relatively
 * small vector collections.
 */
export function calculateVectorCoherence(
  vectors: number[][],
): number {
  const n = vectors.length

  if (n < 2) {
    return 1
  }

  let total = 0
  let pairs = 0

  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      total += VectorUtils.cosineSimilarity(
        vectors[i],
        vectors[j],
      )

      pairs++
    }
  }

  return pairs > 0
    ? total / pairs
    : 1
}

/**
 * Measures semantic stability across consecutive periods.
 *
 * Each period is represented by the centroid of its vectors. Stability
 * is the average cosine similarity between consecutive centroids.
 */
export function calculateSemanticStabilityOverTime(
  periods: Array<{ vectors: number[][] }>,
): number {
  if (periods.length < 2) {
    return 1
  }

  let total = 0
  let count = 0

  for (let i = 1; i < periods.length; i++) {
    const previousCentroid =
      VectorUtils.calculateCentroid(
        periods[i - 1].vectors,
      )

    const currentCentroid =
      VectorUtils.calculateCentroid(
        periods[i].vectors,
      )

    if (
      previousCentroid.length > 0 &&
      previousCentroid.length ===
        currentCentroid.length
    ) {
      total += VectorUtils.cosineSimilarity(
        previousCentroid,
        currentCentroid,
      )

      count++
    }
  }

  return count > 0
    ? total / count
    : 1
}

/**
 * Calculates domain diversity using normalized Shannon entropy.
 *
 * The result is normalized to a 0-100 scale so distributions with
 * different numbers of unique domains remain comparable.
 */
export function calculateDiversityIndex(
  domains: string[],
): number {
  if (!domains.length) {
    return 0
  }

  const counts = new Map<string, number>()

  for (const domain of domains) {
    counts.set(
      domain,
      (counts.get(domain) ?? 0) + 1,
    )
  }

  const total = domains.length
  const uniqueDomains = counts.size
  const maxEntropy =
    uniqueDomains > 1
      ? Math.log2(uniqueDomains)
      : 1

  let entropy = 0

  for (const count of counts.values()) {
    const probability = count / total

    entropy -=
      probability *
      Math.log2(probability)
  }

  return maxEntropy > 0
    ? Math.round(
        (entropy / maxEntropy) *
          100 *
          10,
      ) / 10
    : 0
}

/**
 * Counts vector outliers using cosine distance from the centroid.
 *
 * When no threshold is provided, the cutoff is set to the mean distance
 * plus one population standard deviation.
 */
export function detectAnomalies(
  vectors: number[][],
  threshold?: number,
): number {
  if (!vectors.length) {
    return 0
  }

  const centroid =
    VectorUtils.calculateCentroid(vectors)

  const distances = vectors.map(
    (vector) =>
      1 -
      VectorUtils.cosineSimilarity(
        vector,
        centroid,
      ),
  )

  const mean =
    distances.reduce(
      (sum, distance) =>
        sum + distance,
      0,
    ) / distances.length

  const standardDeviation =
    calculateStandardDeviation(distances)

  const cutoff =
    threshold ??
    mean + standardDeviation

  return distances.filter(
    (distance) => distance > cutoff,
  ).length
}

/**
 * Calculates content coherence using available vector representations.
 *
 * When at least two vectors are available, pairwise semantic coherence is
 * used. Otherwise the calculation falls back to the requested text method.
 */
export function calculateUMassCoherence(
  documents: Array<{
    title: string
    content: string
    vector?: number[]
  }>,
  method: "umass" | "cv" | "npmi" = "umass",
): ContentCoherenceResult {
  const vectors = documents
    .map((document) => document.vector)
    .filter(
      (vector): vector is number[] =>
        !!vector?.length,
    )

  if (vectors.length >= 2) {
    const score =
      calculateVectorCoherence(vectors) *
      100

    return {
      overallCoherence: score,
      method: "vector-based",
      confidence: 95,
      pValue: 0.01,
      sampleSize: documents.length,
      calculatedAt: Date.now(),
      score,
    }
  }

  return calculateTextBasedCoherence(
    documents,
    method,
  )
}

/**
 * Calculates semantic stability for time-series content.
 *
 * Vector-based stability is preferred when enough vector data exists.
 * Text-based stability is used as a fallback when vector coverage is
 * insufficient.
 */
export function calculateSemanticStability(
  timeSeriesData: Array<{
    timestamp: number
    content: string
    vectors?: number[][]
  }>,
): SemanticStabilityResult {
  if (timeSeriesData.length < 2) {
    return {
      stabilityScore: 100,
      trendConsistency: 100,
      vocabularyDrift: 0,
      confidenceInterval: {
        lower: 95,
        upper: 100,
      },
      isSignificant: false,
      calculatedAt: Date.now(),
    }
  }

  const periodsWithVectors =
    timeSeriesData
      .map((item) => ({
        vectors: item.vectors ?? [],
      }))
      .filter(
        (period) =>
          period.vectors.length > 0,
      )

  if (periodsWithVectors.length >= 2) {
    const rawScore =
      calculateSemanticStabilityOverTime(
        periodsWithVectors,
      ) * 100

    const score =
      Math.round(rawScore * 100) / 100

    return {
      stabilityScore: score,
      trendConsistency: Math.max(
        0,
        score - 10,
      ),
      vocabularyDrift: Math.max(
        0,
        100 - score,
      ),
      confidenceInterval: {
        lower: Math.max(
          0,
          score - 5,
        ),
        upper: Math.min(
          100,
          score + 5,
        ),
      },
      isSignificant: score > 70,
      calculatedAt: Date.now(),
    }
  }

  return calculateTextBasedStability(
    timeSeriesData,
  )
}

/**
 * Calculates text-based coherence when vector representations are unavailable.
 *
 * Supported methods are UMass, NPMI, and the existing simplified C_v-style
 * approximation used by this analytics pipeline.
 */
function calculateTextBasedCoherence(
  documents: Array<{
    title: string
    content: string
  }>,
  method: "umass" | "cv" | "npmi",
): ContentCoherenceResult {
  const topWords = extractTopWords(
    documents,
    20,
  )

  let coherenceScore = 0
  let validPairs = 0

  if (method === "umass") {
    for (
      let i = 1;
      i < topWords.length;
      i++
    ) {
      for (let j = 0; j < i; j++) {
        const cooccurrence =
          countCooccurrence(
            topWords[i],
            topWords[j],
            documents,
          )

        const wordCount = countWord(
          topWords[j],
          documents,
        )

        if (wordCount > 0) {
          coherenceScore += Math.log(
            (cooccurrence + 1) /
              wordCount,
          )

          validPairs++
        }
      }
    }
  } else if (method === "npmi") {
    const documentCount =
      documents.length

    for (
      let i = 1;
      i < topWords.length;
      i++
    ) {
      for (let j = 0; j < i; j++) {
        const cooccurrence =
          countCooccurrence(
            topWords[i],
            topWords[j],
            documents,
          )

        const firstWordCount =
          countWord(
            topWords[i],
            documents,
          )

        const secondWordCount =
          countWord(
            topWords[j],
            documents,
          )

        if (
          cooccurrence > 0 &&
          firstWordCount > 0 &&
          secondWordCount > 0
        ) {
          const pmi = Math.log(
            (cooccurrence *
              documentCount) /
              (firstWordCount *
                secondWordCount),
          )

          const npmi =
            pmi /
            -Math.log(
              cooccurrence /
                documentCount,
            )

          coherenceScore += npmi
          validPairs++
        }
      }
    }
  } else {
    /*
     * The existing C_v path is a simplified PMI-based approximation rather
     * than a full reference implementation of the C_v coherence metric.
     */
    const documentCount =
      documents.length

    for (
      let i = 1;
      i < topWords.length;
      i++
    ) {
      for (let j = 0; j < i; j++) {
        const cooccurrence =
          countCooccurrence(
            topWords[i],
            topWords[j],
            documents,
          )

        const firstWordCount =
          countWord(
            topWords[i],
            documents,
          )

        const secondWordCount =
          countWord(
            topWords[j],
            documents,
          )

        if (
          firstWordCount > 0 &&
          secondWordCount > 0
        ) {
          coherenceScore += Math.log(
            (cooccurrence + 1) /
              ((firstWordCount /
                documentCount) *
                (secondWordCount /
                  documentCount) *
                documentCount),
          )

          validPairs++
        }
      }
    }
  }

  const normalizedScore = validPairs
    ? Math.max(
        0,
        Math.min(
          100,
          50 +
            (coherenceScore /
              validPairs) *
              10,
        ),
      )
    : 50

  const pValue = calculatePValue(
    coherenceScore,
    validPairs,
  )

  const confidence =
    pValue < 0.05
      ? 95
      : pValue < 0.1
        ? 90
        : 75

  return {
    overallCoherence: normalizedScore,
    method,
    confidence,
    pValue,
    sampleSize: documents.length,
    calculatedAt: Date.now(),
    score: normalizedScore,
  }
}

/**
 * Calculates semantic stability from lexical similarity when vector data
 * is unavailable.
 *
 * Consecutive periods are compared using both bag-of-words cosine
 * similarity and vocabulary overlap.
 */
function calculateTextBasedStability(
  timeSeriesData: Array<{
    timestamp: number
    content: string
  }>,
): SemanticStabilityResult {
  const vocabularySets =
    timeSeriesData.map(
      (item) =>
        new Set(
          extractWords(item.content),
        ),
    )

  const similarities: number[] = []

  for (
    let i = 1;
    i < timeSeriesData.length;
    i++
  ) {
    const cosineSimilarity =
      calculateTextCosineSimilarity(
        timeSeriesData[i - 1].content,
        timeSeriesData[i].content,
      )

    const previousVocabulary =
      vocabularySets[i - 1]

    const currentVocabulary =
      vocabularySets[i]

    const union = new Set([
      ...previousVocabulary,
      ...currentVocabulary,
    ])

    const intersectionSize =
      [...previousVocabulary].filter(
        (word) =>
          currentVocabulary.has(word),
      ).length

    const vocabularyStability =
      union.size > 0
        ? intersectionSize /
          union.size
        : 0

    similarities.push(
      (cosineSimilarity +
        vocabularyStability) /
        2,
    )
  }

  const mean =
    similarities.reduce(
      (sum, value) =>
        sum + value,
      0,
    ) / similarities.length

  const score = mean * 100

  const trendConsistency =
    calculateTrendConsistency(
      similarities,
    )

  const vocabularyDrift =
    calculateVocabularyDrift(
      vocabularySets,
    )

  const {
    confidenceInterval,
    isSignificant,
  } = calculateConfidenceInterval(
    similarities,
    0.95,
  )

  return {
    stabilityScore:
      Math.round(score * 100) / 100,
    trendConsistency,
    vocabularyDrift,
    confidenceInterval,
    isSignificant,
    calculatedAt: Date.now(),
  }
}

/**
 * Extracts the most frequent normalized words across the document set.
 *
 * Tokens shorter than four characters are ignored.
 */
export function extractTopWords(
  documents: Array<{
    content: string
  }>,
  count = 20,
): string[] {
  const frequencies =
    new Map<string, number>()

  for (const document of documents) {
    const words = document.content
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter(
        (word) => word.length > 3,
      )

    for (const word of words) {
      frequencies.set(
        word,
        (frequencies.get(word) ?? 0) +
          1,
      )
    }
  }

  return Array.from(
    frequencies.entries(),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([word]) => word)
}

/**
 * Counts documents containing both requested words.
 */
export function countCooccurrence(
  word1: string,
  word2: string,
  documents: Array<{
    content: string
  }>,
): number {
  let count = 0

  for (const document of documents) {
    const content =
      document.content.toLowerCase()

    if (
      content.includes(word1) &&
      content.includes(word2)
    ) {
      count++
    }
  }

  return count
}

/**
 * Counts documents containing the requested word.
 */
export function countWord(
  word: string,
  documents: Array<{
    content: string
  }>,
): number {
  let count = 0

  for (const document of documents) {
    if (
      document.content
        .toLowerCase()
        .includes(word)
    ) {
      count++
    }
  }

  return count
}

/**
 * Normalizes text into lowercase word tokens used by lexical metrics.
 */
export function extractWords(
  content: string,
): string[] {
  return content
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter(
      (word) => word.length > 3,
    )
}

/**
 * Calculates cosine similarity between two texts using word-frequency vectors.
 */
export function calculateTextCosineSimilarity(
  text1: string,
  text2: string,
): number {
  const firstFrequencies =
    new Map<string, number>()

  const secondFrequencies =
    new Map<string, number>()

  for (const word of extractWords(text1)) {
    firstFrequencies.set(
      word,
      (firstFrequencies.get(word) ??
        0) + 1,
    )
  }

  for (const word of extractWords(text2)) {
    secondFrequencies.set(
      word,
      (secondFrequencies.get(word) ??
        0) + 1,
    )
  }

  const allWords = new Set([
    ...firstFrequencies.keys(),
    ...secondFrequencies.keys(),
  ])

  const firstVector: number[] = []
  const secondVector: number[] = []

  for (const word of allWords) {
    firstVector.push(
      firstFrequencies.get(word) ?? 0,
    )

    secondVector.push(
      secondFrequencies.get(word) ?? 0,
    )
  }

  return VectorUtils.cosineSimilarity(
    firstVector,
    secondVector,
  )
}

/**
 * Backward-compatible alias for the legacy text cosine similarity name.
 */
export const calculateCosineSimilarity =
  calculateTextCosineSimilarity

/**
 * Measures how consistently consecutive similarity values change.
 *
 * Larger differences between adjacent values reduce the final score.
 */
export function calculateTrendConsistency(
  similarities: number[],
): number {
  if (similarities.length < 2) {
    return 100
  }

  const differences =
    similarities
      .slice(1)
      .map(
        (similarity, index) =>
          Math.abs(
            similarity -
              similarities[index],
          ),
      )

  const averageDifference =
    differences.reduce(
      (sum, difference) =>
        sum + difference,
      0,
    ) / differences.length

  return Math.max(
    0,
    Math.round(
      (1 - averageDifference) *
        100 *
        10,
    ) / 10,
  )
}

/**
 * Calculates average vocabulary drift between consecutive vocabulary sets.
 *
 * Drift is measured as one minus Jaccard similarity and returned on a
 * 0-100 scale.
 */
export function calculateVocabularyDrift(
  sets: Set<string>[],
): number {
  if (sets.length < 2) {
    return 0
  }

  let totalDrift = 0
  let comparisons = 0

  for (let i = 1; i < sets.length; i++) {
    const previousSet = sets[i - 1]
    const currentSet = sets[i]

    const union = new Set([
      ...previousSet,
      ...currentSet,
    ])

    const intersectionSize =
      [...previousSet].filter(
        (word) =>
          currentSet.has(word),
      ).length

    totalDrift +=
      union.size > 0
        ? (1 -
            intersectionSize /
              union.size) *
          100
        : 0

    comparisons++
  }

  return comparisons > 0
    ? Math.round(
        (totalDrift / comparisons) *
          10,
      ) / 10
    : 0
}

/**
 * Estimates a confidence interval around the sample mean.
 *
 * The implementation uses sample variance and standard error. The existing
 * critical-value approximation is preserved for compatibility.
 */
export function calculateConfidenceInterval(
  data: number[],
  confidenceLevel = 0.95,
): {
  confidenceInterval: {
    lower: number
    upper: number
  }
  isSignificant: boolean
} {
  if (data.length < 2) {
    const value = data[0] ?? 0

    return {
      confidenceInterval: {
        lower: value,
        upper: value,
      },
      isSignificant: false,
    }
  }

  const n = data.length

  const mean =
    data.reduce(
      (sum, value) =>
        sum + value,
      0,
    ) / n

  // Use sample variance because this interval estimates uncertainty from a sample.
  const variance =
    data.reduce(
      (sum, value) =>
        sum +
        Math.pow(
          value - mean,
          2,
        ),
      0,
    ) /
    (n - 1)

  const standardError =
    Math.sqrt(variance) /
    Math.sqrt(n)

  const criticalValue =
    confidenceLevel === 0.99
      ? 2.576
      : confidenceLevel === 0.9
        ? 1.645
        : 1.96

  const margin =
    criticalValue *
    standardError

  const confidenceInterval = {
    lower: mean - margin,
    upper: mean + margin,
  }

  const isSignificant =
    confidenceInterval.lower > 0 ||
    confidenceInterval.upper < 0

  return {
    confidenceInterval,
    isSignificant,
  }
}

/**
 * Returns the existing approximate two-tailed p-value bucket for a score.
 *
 * This function uses fixed statistic thresholds rather than an exact
 * probability distribution calculation.
 */
export function calculatePValue(
  score: number,
  sampleSize: number,
): number {
  if (sampleSize <= 0) {
    return 1
  }

  const statistic =
    Math.abs(score) /
    Math.sqrt(
      Math.max(1, sampleSize),
    )

  if (statistic >= 2.576) {
    return 0.01
  }

  if (statistic >= 1.96) {
    return 0.05
  }

  if (statistic >= 1.645) {
    return 0.1
  }

  return 0.2
}

/**
 * Fits a simple linear regression over sequential values.
 *
 * Array indexes are used as the independent variable.
 */
export function calculateLinearRegression(
  values: number[],
): {
  slope: number
  intercept: number
  rSquared: number
} {
  const n = values.length

  if (n < 2) {
    return {
      slope: 0,
      intercept: values[0] ?? 0,
      rSquared: 0,
    }
  }

  const sumX = values.reduce(
    (sum, _, index) =>
      sum + index,
    0,
  )

  const sumY = values.reduce(
    (sum, value) =>
      sum + value,
    0,
  )

  const sumXY = values.reduce(
    (sum, value, index) =>
      sum + index * value,
    0,
  )

  const sumX2 = values.reduce(
    (sum, _, index) =>
      sum + index * index,
    0,
  )

  const sumY2 = values.reduce(
    (sum, value) =>
      sum + value * value,
    0,
  )

  const denominator =
    n * sumX2 -
    sumX * sumX

  if (denominator === 0) {
    return {
      slope: 0,
      intercept: sumY / n,
      rSquared: 0,
    }
  }

  const slope =
    (n * sumXY -
      sumX * sumY) /
    denominator

  const intercept =
    (sumY -
      slope * sumX) /
    n

  const meanY = sumY / n

  const totalSumOfSquares =
    values.reduce(
      (sum, value) =>
        sum +
        Math.pow(
          value - meanY,
          2,
        ),
      0,
    )

  const residualSumOfSquares =
    values.reduce(
      (sum, value, index) =>
        sum +
        Math.pow(
          value -
            (intercept +
              slope * index),
          2,
        ),
      0,
    )

  const rSquared =
    totalSumOfSquares === 0
      ? 0
      : 1 -
        residualSumOfSquares /
          totalSumOfSquares

  return {
    slope,
    intercept,
    rSquared,
  }
}

/**
 * Calculates population standard deviation using an n denominator.
 */
export function calculateStandardDeviation(
  values: number[],
): number {
  if (values.length < 2) {
    return 0
  }

  const mean =
    values.reduce(
      (sum, value) =>
        sum + value,
      0,
    ) / values.length

  return Math.sqrt(
    values.reduce(
      (sum, value) =>
        sum +
        Math.pow(
          value - mean,
          2,
        ),
      0,
    ) / values.length,
  )
}

/**
 * Estimates standard error adjusted by the regression fit.
 */
export function calculateStandardError(
  positions: number[],
  rSquared: number,
): number {
  const standardDeviation =
    calculateStandardDeviation(positions)

  return positions.length > 0
    ? (
        standardDeviation *
        Math.sqrt(
          Math.max(
            0,
            1 - rSquared,
          ),
        )
      ) /
        Math.sqrt(positions.length)
    : 0
}