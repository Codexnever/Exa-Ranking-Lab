// lib/vector-utils.ts
// Unified vector utility functions — all vector operations go here.
// Pure functions, no side effects, fully tree-shakeable.

export interface VectorOperationResult {
  similarity: number
  isValid:    boolean
  error?:     string
}

export class VectorUtils {
  /**
   * Cosine similarity between two vectors.
   * Returns 0 for empty, mismatched, or zero-magnitude inputs.
   * Result is clamped to [-1, 1] to handle float precision drift.
   */
  static cosineSimilarity(
    a: number[] | Float32Array,
    b: number[] | Float32Array
  ): number {
    if (!a?.length || !b?.length || a.length !== b.length) return 0

    let dot   = 0
    let normA = 0
    let normB = 0

    for (let i = 0; i < a.length; i++) {
      const ai = a[i] ?? 0
      const bi = b[i] ?? 0
      dot   += ai * bi
      normA += ai * ai
      normB += bi * bi
    }

    const denom = Math.sqrt(normA) * Math.sqrt(normB)
    if (denom === 0) return 0

    return Math.max(-1, Math.min(1, dot / denom))
  }

  /**
   * Cosine similarity with full error reporting.
   * Use when you need to distinguish invalid inputs from genuine zero similarity.
   */
  static cosineSimilaritySafe(
    a: number[] | Float32Array,
    b: number[] | Float32Array
  ): VectorOperationResult {
    try {
      if (!Array.isArray(a) && !(a instanceof Float32Array))
        return { similarity: 0, isValid: false, error: "a must be array or Float32Array" }
      if (!Array.isArray(b) && !(b instanceof Float32Array))
        return { similarity: 0, isValid: false, error: "b must be array or Float32Array" }
      if (a.length === 0)
        return { similarity: 0, isValid: false, error: "Empty vectors" }
      if (a.length !== b.length)
        return { similarity: 0, isValid: false, error: `Length mismatch: ${a.length} vs ${b.length}` }

      return { similarity: this.cosineSimilarity(a, b), isValid: true }
    } catch (err) {
      return {
        similarity: 0,
        isValid:    false,
        error:      err instanceof Error ? err.message : "Unknown error",
      }
    }
  }

  /**
   * Batch cosine similarities: queries[i] vs documents[j].
   * Returns results[i][j].
   */
  static batchCosineSimilarity(
    queries:   number[][],
    documents: number[][]
  ): number[][] {
    if (!queries.length || !documents.length) return []

    return queries.map(q =>
      documents.map(d => this.cosineSimilarity(q, d))
    )
  }

  /**
   * Hamming distance between two binary-quantised vectors.
   * Returns -1 (not Infinity) on length mismatch so callers can detect errors.
   */
  static hammingDistance(a: Uint8Array, b: Uint8Array): number {
    if (a.length !== b.length) return -1

    let dist = 0
    for (let i = 0; i < a.length; i++) {
      dist += this.popCount(a[i] ^ b[i])
    }
    return dist
  }

  /**
   * Convert Hamming distance to [0, 1] similarity.
   * Returns 0 if distance is -1 (invalid).
   */
  static hammingToSimilarity(hammingDistance: number, vectorLength: number): number {
    if (hammingDistance < 0 || vectorLength === 0) return 0
    return 1 - hammingDistance / vectorLength
  }

  /**
   * Centroid (arithmetic mean) of a set of vectors.
   * All vectors must have the same dimensionality.
   * Returns [] for empty input.
   */
  static calculateCentroid(vectors: number[][]): number[] {
    if (!vectors.length) return []

    const dim      = vectors[0].length
    const centroid = new Array<number>(dim).fill(0)

    for (const v of vectors) {
      for (let i = 0; i < dim; i++) {
        centroid[i] += v[i] ?? 0
      }
    }

    for (let i = 0; i < dim; i++) {
      centroid[i] /= vectors.length
    }

    return centroid
  }

  /**
   * Normalise vector to unit length.
   * Returns zero vector (not throws) for zero-magnitude input.
   */
  static normalize(vector: number[]): number[] {
    const mag = Math.sqrt(vector.reduce((s, v) => s + v * v, 0))
    return mag === 0
      ? vector.map(() => 0)
      : vector.map(v => v / mag)
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private static popCount(n: number): number {
    let count = 0
    let x = n
    while (x) {
      count++
      x &= x - 1
    }
    return count
  }
}

// ─── Legacy compatibility exports ─────────────────────────────────────────────
// Bind to class so `this` is correct if ever called as standalone function.
export const cosineSimilarity  = VectorUtils.cosineSimilarity.bind(VectorUtils)
export const calculateCentroid = VectorUtils.calculateCentroid.bind(VectorUtils)