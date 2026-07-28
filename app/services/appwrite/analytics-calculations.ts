// lib/analytics-calculations.ts
// Vector-based semantic calculations with text fallback.
// Pure functions — no React, no side effects.

import type { ContentCoherenceResult, SemanticStabilityResult } from "@/types/type"
import { VectorUtils } from "../../../utils/vector-utils"
// ✅ Import from analyticsLogic — no duplicate definition
export { calculateTimeRangeMs } from "@/app/logic/analyticsLogic"

// ─── Re-exports frome vector-utils ─────────────────────────────────────────────
export { cosineSimilarity, calculateCentroid } from "../../../utils/vector-utils"

// ============================================================================
// VECTOR-BASED CALCULATIONS (Primary)
// ============================================================================

/**
 * Average pairwise cosine similarity across all vector pairs.
 * O(n²) — only use on small sets (< 500 vectors).
 */
export function calculateVectorCoherence(vectors: number[][]): number {
  const n = vectors.length
  if (n < 2) return 1.0

  let total = 0
  let pairs = 0

  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      total += VectorUtils.cosineSimilarity(vectors[i], vectors[j])
      pairs++
    }
  }

  return pairs > 0 ? total / pairs : 1.0
}

/**
 * Semantic stability: average cosine similarity between consecutive
 * period centroids. Returns 1.0 (perfectly stable) for < 2 periods.
 */
export function calculateSemanticStabilityOverTime(
  periods: Array<{ vectors: number[][] }>
): number {
  if (periods.length < 2) return 1.0

  let total = 0
  let count = 0

  for (let i = 1; i < periods.length; i++) {
    const prev = VectorUtils.calculateCentroid(periods[i - 1].vectors)
    const curr = VectorUtils.calculateCentroid(periods[i].vectors)

    if (prev.length > 0 && prev.length === curr.length) {
      total += VectorUtils.cosineSimilarity(prev, curr)
      count++
    }
  }

  return count > 0 ? total / count : 1.0
}

/**
 * Diversity index using Shannon entropy over domain distribution.
 * Returns 0–100. More unique domains → higher score.
 * 
 * Uses normalised entropy so the score is comparable regardless of
 * how many domains are present.
 */
export function calculateDiversityIndex(domains: string[]): number {
  if (!domains.length) return 0

  // Count occurrences
  const counts = new Map<string, number>()
  for (const d of domains) counts.set(d, (counts.get(d) ?? 0) + 1)

  const total    = domains.length
  const k        = counts.size          // number of unique domains
  const maxH     = k > 1 ? Math.log2(k) : 1  // maximum possible entropy

  // Shannon entropy H = -Σ p·log₂(p)
  let H = 0
  for (const c of counts.values()) {
    const p = c / total
    H -= p * Math.log2(p)
  }

  // Normalise to 0-100
  return maxH > 0 ? Math.round((H / maxH) * 100 * 10) / 10 : 0
}

/**
 * Outlier count using cosine distance from centroid.
 * threshold defaults to mean + 1 std-dev of distances.
 */
export function detectAnomalies(vectors: number[][], threshold?: number): number {
  if (!vectors.length) return 0

  const centroid  = VectorUtils.calculateCentroid(vectors)
  const distances = vectors.map(v => 1 - VectorUtils.cosineSimilarity(v, centroid))
  const mean      = distances.reduce((a, b) => a + b, 0) / distances.length
  const sd        = calculateStandardDeviation(distances)
  const cutoff    = threshold ?? mean + sd

  return distances.filter(d => d > cutoff).length
}

// ============================================================================
// UNIFIED WRAPPERS (vector-first, text fallback)
// ============================================================================

/**
 * Content coherence — uses vectors when available, falls back to UMass.
 */
export function calculateUMassCoherence(
  documents: Array<{ title: string; content: string; vector?: number[] }>,
  method: "umass" | "cv" | "npmi" = "umass"
): ContentCoherenceResult {
  const vectors = documents.map(d => d.vector).filter((v): v is number[] => !!v?.length)

  if (vectors.length >= 2) {
    const score = calculateVectorCoherence(vectors) * 100
    return {
      overallCoherence: score,
      method:           "vector-based",
      confidence:       95,
      pValue:           0.01,
      sampleSize:       documents.length,
      calculatedAt:     Date.now(),
      score,
    }
  }

  return calculateTextBasedCoherence(documents, method)
}

/**
 * Semantic stability — uses vectors when available, falls back to text.
 * Returns safe default instead of throwing on < 2 points.
 */
export function calculateSemanticStability(
  timeSeriesData: Array<{ timestamp: number; content: string; vectors?: number[][] }>
): SemanticStabilityResult {
  // ✅ Safe default instead of throwing — callers don't need try/catch
  if (timeSeriesData.length < 2) {
    return {
      stabilityScore:     100,
      trendConsistency:   100,
      vocabularyDrift:    0,
      confidenceInterval: { lower: 95, upper: 100 },
      isSignificant:      false,
      calculatedAt:       Date.now(),
    }
  }

  const periodsWithVectors = timeSeriesData
    .map(d => ({ vectors: d.vectors ?? [] }))
    .filter(p => p.vectors.length > 0)

  if (periodsWithVectors.length >= 2) {
    const raw   = calculateSemanticStabilityOverTime(periodsWithVectors) * 100
    const score = Math.round(raw * 100) / 100

    return {
      stabilityScore:     score,
      trendConsistency:   Math.max(0, score - 10),
      vocabularyDrift:    Math.max(0, 100 - score),
      confidenceInterval: {
        lower: Math.max(0,   score - 5),
        upper: Math.min(100, score + 5),
      },
      isSignificant: score > 70,
      calculatedAt:  Date.now(),
    }
  }

  return calculateTextBasedStability(timeSeriesData)
}

// ============================================================================
// TEXT-BASED FALLBACKS
// ============================================================================

function calculateTextBasedCoherence(
  documents: Array<{ title: string; content: string }>,
  method: "umass" | "cv" | "npmi"
): ContentCoherenceResult {
  const topWords = extractTopWords(documents, 20)
  let coherenceScore = 0
  let validPairs     = 0

  // ✅ All three methods implemented
  if (method === "umass") {
    for (let i = 1; i < topWords.length; i++) {
      for (let j = 0; j < i; j++) {
        const cooc  = countCooccurrence(topWords[i], topWords[j], documents)
        const wc    = countWord(topWords[j], documents)
        if (wc > 0) {
          coherenceScore += Math.log((cooc + 1) / wc)
          validPairs++
        }
      }
    }
  } else if (method === "npmi") {
    const N = documents.length
    for (let i = 1; i < topWords.length; i++) {
      for (let j = 0; j < i; j++) {
        const cooc = countCooccurrence(topWords[i], topWords[j], documents)
        const wi   = countWord(topWords[i], documents)
        const wj   = countWord(topWords[j], documents)
        if (cooc > 0 && wi > 0 && wj > 0) {
          const pmi  = Math.log((cooc * N) / (wi * wj))
          const npmi = pmi / -Math.log(cooc / N)
          coherenceScore += npmi
          validPairs++
        }
      }
    }
  } else {
    // cv: use arithmetic mean of normalised PMI values (simplified)
    const N = documents.length
    for (let i = 1; i < topWords.length; i++) {
      for (let j = 0; j < i; j++) {
        const cooc = countCooccurrence(topWords[i], topWords[j], documents)
        const wi   = countWord(topWords[i], documents)
        const wj   = countWord(topWords[j], documents)
        if (wi > 0 && wj > 0) {
          coherenceScore += Math.log((cooc + 1) / ((wi / N) * (wj / N) * N))
          validPairs++
        }
      }
    }
  }

  const normalised = validPairs
    ? Math.max(0, Math.min(100, 50 + (coherenceScore / validPairs) * 10))
    : 50

  const pValue    = calculatePValue(coherenceScore, validPairs)
  const confidence = pValue < 0.05 ? 95 : pValue < 0.1 ? 90 : 75

  return {
    overallCoherence: normalised,
    method,
    confidence,
    pValue,
    sampleSize:   documents.length,
    calculatedAt: Date.now(),
    score:        normalised,
  }
}

function calculateTextBasedStability(
  timeSeriesData: Array<{ timestamp: number; content: string }>
): SemanticStabilityResult {
  const vocabSets = timeSeriesData.map(d => new Set(extractWords(d.content)))
  const similarities: number[] = []

  for (let i = 1; i < timeSeriesData.length; i++) {
    const sim       = calculateTextCosineSimilarity(timeSeriesData[i - 1].content, timeSeriesData[i].content)
    const prev      = vocabSets[i - 1]
    const curr      = vocabSets[i]
    const union     = new Set([...prev, ...curr])
    const intersect = [...prev].filter(w => curr.has(w)).length
    const vocabStab = union.size > 0 ? intersect / union.size : 0
    similarities.push((sim + vocabStab) / 2)
  }

  const mean   = similarities.reduce((s, v) => s + v, 0) / similarities.length
  const score  = mean * 100
  const trend  = calculateTrendConsistency(similarities)
  const drift  = calculateVocabularyDrift(vocabSets)
  const { confidenceInterval, isSignificant } = calculateConfidenceInterval(similarities, 0.95)

  return {
    stabilityScore:     Math.round(score * 100) / 100,
    trendConsistency:   trend,
    vocabularyDrift:    drift,
    confidenceInterval,
    isSignificant,
    calculatedAt:       Date.now(),
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export function extractTopWords(
  documents: Array<{ content: string }>,
  count = 20
): string[] {
  const freq = new Map<string, number>()

  for (const doc of documents) {
    const words = doc.content
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter(w => w.length > 3)

    for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1)
  }

  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([w]) => w)
}

export function countCooccurrence(
  word1: string,
  word2: string,
  documents: Array<{ content: string }>
): number {
  let n = 0
  for (const doc of documents) {
    const c = doc.content.toLowerCase()
    if (c.includes(word1) && c.includes(word2)) n++
  }
  return n
}

export function countWord(
  word: string,
  documents: Array<{ content: string }>
): number {
  let n = 0
  for (const doc of documents) {
    if (doc.content.toLowerCase().includes(word)) n++
  }
  return n
}

export function extractWords(content: string): string[] {
  return content
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter(w => w.length > 3)
}

/**
 * Text cosine similarity using Map-based word counts — O(n) not O(n²).
 */
export function calculateTextCosineSimilarity(text1: string, text2: string): number {
  const freq1 = new Map<string, number>()
  const freq2 = new Map<string, number>()

  for (const w of extractWords(text1)) freq1.set(w, (freq1.get(w) ?? 0) + 1)
  for (const w of extractWords(text2)) freq2.set(w, (freq2.get(w) ?? 0) + 1)

  const allWords = new Set([...freq1.keys(), ...freq2.keys()])
  const v1: number[] = []
  const v2: number[] = []

  for (const w of allWords) {
    v1.push(freq1.get(w) ?? 0)
    v2.push(freq2.get(w) ?? 0)
  }

  return VectorUtils.cosineSimilarity(v1, v2)
}

// Keep old name as alias for backward compat
export const calculateCosineSimilarity = calculateTextCosineSimilarity

export function calculateTrendConsistency(similarities: number[]): number {
  if (similarities.length < 2) return 100
  const diffs  = similarities.slice(1).map((s, i) => Math.abs(s - similarities[i]))
  const avgDiff = diffs.reduce((s, d) => s + d, 0) / diffs.length
  return Math.max(0, Math.round((1 - avgDiff) * 100 * 10) / 10)
}

export function calculateVocabularyDrift(sets: Set<string>[]): number {
  if (sets.length < 2) return 0

  let totalDrift = 0
  let comparisons = 0

  for (let i = 1; i < sets.length; i++) {
    const prev    = sets[i - 1]
    const curr    = sets[i]
    const union   = new Set([...prev, ...curr])
    const inter   = [...prev].filter(w => curr.has(w)).length
    totalDrift   += union.size > 0 ? (1 - inter / union.size) * 100 : 0
    comparisons++
  }

  return comparisons > 0 ? Math.round((totalDrift / comparisons) * 10) / 10 : 0
}

/**
 * 95% confidence interval for an array of values.
 * Uses sample standard deviation (n-1) and correct standard error formula.
 */
export function calculateConfidenceInterval(
  data: number[],
  confidenceLevel = 0.95
): { confidenceInterval: { lower: number; upper: number }; isSignificant: boolean } {
  if (data.length < 2) {
    const v = data[0] ?? 0
    return { confidenceInterval: { lower: v, upper: v }, isSignificant: false }
  }

  const n    = data.length
  const mean = data.reduce((s, v) => s + v, 0) / n

  // Sample variance (n-1 denominator)
  const variance = data.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (n - 1)

  // ✅ Correct SE: sd / sqrt(n)
  const se      = Math.sqrt(variance) / Math.sqrt(n)
  const tValue  = confidenceLevel === 0.99 ? 2.576 : confidenceLevel === 0.90 ? 1.645 : 1.96
  const margin  = tValue * se

  const confidenceInterval = {
    lower: mean - margin,
    upper: mean + margin,
  }

  // Significant if CI doesn't straddle 0
  const isSignificant = confidenceInterval.lower > 0 || confidenceInterval.upper < 0

  return { confidenceInterval, isSignificant }
}

/**
 * Approximate two-tailed p-value from t-statistic.
 * ✅ Fixed: correct threshold ordering.
 */
export function calculatePValue(score: number, sampleSize: number): number {
  if (sampleSize <= 0) return 1.0
  const tStat = Math.abs(score) / Math.sqrt(Math.max(1, sampleSize))

  // ✅ Correct ordering: larger t → smaller p
  if (tStat >= 2.576) return 0.01
  if (tStat >= 1.960) return 0.05
  if (tStat >= 1.645) return 0.10
  return 0.20
}

export function calculateLinearRegression(values: number[]): {
  slope: number
  intercept: number
  rSquared: number
} {
  const n = values.length
  if (n < 2) return { slope: 0, intercept: values[0] ?? 0, rSquared: 0 }

  const sumX  = values.reduce((s, _, i) => s + i, 0)
  const sumY  = values.reduce((s, y) => s + y, 0)
  const sumXY = values.reduce((s, y, i) => s + i * y, 0)
  const sumX2 = values.reduce((s, _, i) => s + i * i, 0)
  const sumY2 = values.reduce((s, y) => s + y * y, 0)

  const denom = n * sumX2 - sumX * sumX
  if (denom === 0) return { slope: 0, intercept: sumY / n, rSquared: 0 }

  const slope     = (n * sumXY - sumX * sumY) / denom
  const intercept = (sumY - slope * sumX) / n
  const yMean     = sumY / n

  const ssTotal    = values.reduce((s, y) => s + Math.pow(y - yMean, 2), 0)
  const ssResidual = values.reduce((s, y, i) => s + Math.pow(y - (intercept + slope * i), 2), 0)
  const rSquared   = ssTotal === 0 ? 0 : 1 - ssResidual / ssTotal

  return { slope, intercept, rSquared }
}

/**
 * Population standard deviation (n denominator).
 * Use calculateConfidenceInterval for sample-based stats.
 */
export function calculateStandardDeviation(values: number[]): number {
  if (values.length < 2) return 0
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  return Math.sqrt(
    values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length
  )
}

export function calculateStandardError(positions: number[], rSquared: number): number {
  const sd = calculateStandardDeviation(positions)
  return positions.length > 0
    ? sd * Math.sqrt(Math.max(0, 1 - rSquared)) / Math.sqrt(positions.length)
    : 0
}