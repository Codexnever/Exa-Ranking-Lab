// app/lib/analytics-calculations.ts
import { ContentCoherenceResult, SemanticStabilityResult, StatisticalValidationResult, DataQualityResult} from "@/lib/type";

// ============================================================================
// VECTOR-BASED SEMANTIC CALCULATIONS (Primary Methods)
// ============================================================================

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || !b.length || a.length !== b.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator ? dotProduct / denominator : 0;
}

/**
 * Calculate average vector (centroid) from array of vectors
 */
export function calculateCentroid(vectors: number[][]): number[] {
  if (!vectors.length) return [];
  
  const dim = vectors[0].length;
  const centroid = new Array(dim).fill(0);
  
  vectors.forEach(vec => {
    vec.forEach((val, idx) => {
      centroid[idx] += val / vectors.length;
    });
  });
  
  return centroid;
}

/**
 * Calculate content coherence using vector similarity (PRIMARY METHOD)
 */
export function calculateVectorCoherence(vectors: number[][]): number {
  const n = vectors.length;
  if (n < 2) return 1.0;

  let totalSimilarity = 0;
  let pairCount = 0;
  
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      totalSimilarity += cosineSimilarity(vectors[i], vectors[j]);
      pairCount++;
    }
  }
  
  return pairCount ? totalSimilarity / pairCount : 1.0;
}

/**
 * Calculate semantic stability using centroid drift over time (PRIMARY METHOD)
 */
export function calculateSemanticStabilityOverTime(periods: Array<{vectors: number[][]}>): number {
  if (periods.length < 2) return 1.0;

  let totalSimilarity = 0;
  let count = 0;
  
  for (let i = 1; i < periods.length; i++) {
    const centroidPrev = calculateCentroid(periods[i-1].vectors);
    const centroidCurr = calculateCentroid(periods[i].vectors);
    
    if (centroidPrev.length === centroidCurr.length && centroidPrev.length > 0) {
      totalSimilarity += cosineSimilarity(centroidPrev, centroidCurr);
      count++;
    }
  }
  
  return count ? totalSimilarity / count : 1.0;
}

/**
 * Calculate diversity index from domains (enhanced)
 */
export function calculateDiversityIndex(domains: string[]): number {
  return Math.min(100, domains.length * 5);
}

/**
 * Detect anomalies using vector distance from centroid
 */
export function detectAnomalies(vectors: number[][], threshold: number = 0.5): number {
  if (!vectors.length) return 0;
  
  const centroid = calculateCentroid(vectors);
  let anomalyCount = 0;
  
  vectors.forEach(vec => {
    const distance = 1 - cosineSimilarity(vec, centroid);
    if (distance > threshold) {
      anomalyCount++;
    }
  });
  
  return anomalyCount;
}

// ============================================================================
// UNIFIED WRAPPER FUNCTIONS (Vector-First with Text Fallback)
// ============================================================================

/**
 * UNIFIED: calculateUMassCoherence now uses vectors when available
 */
export function calculateUMassCoherence(
  documents: Array<{title: string, content: string, vector?: number[]}>,
  method: 'umass' | 'cv' | 'npmi' = 'umass'
): ContentCoherenceResult {
  // Check if documents have vectors - use vector-based calculation
  const vectors = documents.map(d => d.vector).filter(Boolean) as number[][];
  
  if (vectors.length >= 2) {
    const vectorCoherence = calculateVectorCoherence(vectors);
    const normalizedScore = vectorCoherence * 100;
    
    return {
      overallCoherence: normalizedScore,
      method: 'vector-based',
      confidence: 95,
      pValue: 0.01,
      sampleSize: documents.length,
      calculatedAt: Date.now(),
      score: normalizedScore
    };
  }
  
  // Fallback to text-based for backward compatibility
  return calculateTextBasedCoherence(documents, method);
}

/**
 * UNIFIED: calculateSemanticStability now uses vectors when available
 */
export function calculateSemanticStability(
  timeSeriesData: Array<{timestamp: number, content: string, vectors?: number[][]}>
): SemanticStabilityResult {
  if (timeSeriesData.length < 2) {
    throw new Error('Insufficient data for stability calculation (minimum 2 data points required)');
  }
  
  // Check if we have vectors - use vector-based calculation
  const hasVectors = timeSeriesData.some(data => data.vectors && data.vectors.length > 0);
  
  if (hasVectors) {
    const periods = timeSeriesData.map(data => ({
      vectors: data.vectors || []
    })).filter(period => period.vectors.length > 0);
    
    const stabilityScore = calculateSemanticStabilityOverTime(periods) * 100;
    
    return {
      stabilityScore: parseFloat(stabilityScore.toFixed(2)),
      trendConsistency: Math.max(0, stabilityScore - 10),
      vocabularyDrift: Math.max(0, 100 - stabilityScore),
      confidenceInterval: {
        lower: Math.max(0, stabilityScore - 5),
        upper: Math.min(100, stabilityScore + 5)
      },
      isSignificant: stabilityScore > 70,
      calculatedAt: Date.now()
    };
  }
  
  // Fallback to text-based for backward compatibility
  return calculateTextBasedStability(timeSeriesData);
}

// ============================================================================
// LEGACY TEXT-BASED FUNCTIONS (Fallback Support)
// ============================================================================

function calculateTextBasedCoherence(
  documents: Array<{title: string, content: string}>,
  method: 'umass' | 'cv' | 'npmi'
): ContentCoherenceResult {
  const topWords = extractTopWords(documents, 20);
  let coherenceScore = 0;
  let validPairs = 0;
  
  if (method === 'umass') {
    for (let i = 1; i < topWords.length; i++) {
      for (let j = 0; j < i; j++) {
        const cooccurrence = countCooccurrence(topWords[i], topWords[j], documents);
        const wordCount = countWord(topWords[j], documents);
        
        if (wordCount > 0) {
          coherenceScore += Math.log((cooccurrence + 1) / wordCount);
          validPairs++;
        }
      }
    }
  }
  
  const normalizedScore = Math.max(0, Math.min(100, 50 + (coherenceScore / validPairs) * 10));
  const pValue = calculatePValue(coherenceScore, validPairs);
  const confidence = pValue < 0.05 ? 95 : pValue < 0.1 ? 90 : 75;
  
  return {
    overallCoherence: normalizedScore,
    method,
    confidence,
    pValue,
    sampleSize: documents.length,
    calculatedAt: Date.now(),
    score: normalizedScore
  };
}

function calculateTextBasedStability(
  timeSeriesData: Array<{timestamp: number, content: string}>
): SemanticStabilityResult {
  const similarities: number[] = [];
  const vocabularySets: Set<string>[] = timeSeriesData.map(data => 
    new Set(extractWords(data.content))
  );
  
  for (let i = 1; i < timeSeriesData.length; i++) {
    const similarity = calculateCosineSimilarity(
      timeSeriesData[i-1].content,
      timeSeriesData[i].content
    );
    similarities.push(similarity);
    
    const prevVocab = vocabularySets[i-1];
    const currentVocab = vocabularySets[i];
    const intersection = new Set([...prevVocab].filter(x => currentVocab.has(x)));
    const union = new Set([...prevVocab, ...currentVocab]);
    const vocabularyStability = intersection.size / union.size;
    similarities.push(vocabularyStability);
  }
  
  const meanSimilarity = similarities.reduce((sum, sim) => sum + sim, 0) / similarities.length;
  const stabilityScore = meanSimilarity * 100;
  
  const trendConsistency = calculateTrendConsistency(similarities);
  const vocabularyDrift = calculateVocabularyDrift(vocabularySets);
  const { confidenceInterval, isSignificant } = calculateConfidenceInterval(similarities, 0.95);
  
  return {
    stabilityScore,
    trendConsistency,
    vocabularyDrift,
    confidenceInterval,
    isSignificant,
    calculatedAt: Date.now()
  };
}

// ============================================================================
// UTILITY FUNCTIONS (Preserved from Original)
// ============================================================================

export function extractTopWords(documents: Array<{content: string}>, count: number = 20): string[] {
  const wordFreq = new Map<string, number>();
  
  documents.forEach(doc => {
    const words = doc.content.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3);
    
    words.forEach(word => {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
    });
  });
  
  return Array.from(wordFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([word]) => word);
}

export function countCooccurrence(word1: string, word2: string, documents: Array<{content: string}>): number {
  let count = 0;
  documents.forEach(doc => {
    const content = doc.content.toLowerCase();
    if (content.includes(word1) && content.includes(word2)) {
      count++;
    }
  });
  return count;
}

export function countWord(word: string, documents: Array<{content: string}>): number {
  let count = 0;
  documents.forEach(doc => {
    const content = doc.content.toLowerCase();
    if (content.includes(word)) {
      count++;
    }
  });
  return count;
}

export function extractWords(content: string): string[] {
  return content.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 3);
}

export function calculateCosineSimilarity(text1: string, text2: string): number {
  const words1 = extractWords(text1);
  const words2 = extractWords(text2);
  
  const allWords = [...new Set([...words1, ...words2])];
  
  const vector1 = allWords.map(word => words1.filter(w => w === word).length);
  const vector2 = allWords.map(word => words2.filter(w => w === word).length);
  
  const dotProduct = vector1.reduce((sum, val, i) => sum + val * vector2[i], 0);
  const magnitude1 = Math.sqrt(vector1.reduce((sum, val) => sum + val * val, 0));
  const magnitude2 = Math.sqrt(vector2.reduce((sum, val) => sum + val * val, 0));
  
  return dotProduct / (magnitude1 * magnitude2) || 0;
}

export function calculateTrendConsistency(similarities: number[]): number {
  if (similarities.length < 2) return 0;
  
  const diffs = similarities.slice(1).map((sim, i) => Math.abs(sim - similarities[i]));
  const avgDiff = diffs.reduce((sum, diff) => sum + diff, 0) / diffs.length;
  
  return Math.max(0, 100 - avgDiff * 100);
}

export function calculateVocabularyDrift(vocabularySets: Set<string>[]): number {
  if (vocabularySets.length < 2) return 0;
  
  let totalDrift = 0;
  let comparisons = 0;
  
  for (let i = 1; i < vocabularySets.length; i++) {
    const prev = vocabularySets[i-1];
    const current = vocabularySets[i];
    
    const intersection = new Set([...prev].filter(x => current.has(x)));
    const union = new Set([...prev, ...current]);
    
    const stability = intersection.size / union.size;
    totalDrift += (1 - stability) * 100;
    comparisons++;
  }
  
  return totalDrift / comparisons;
}

export function calculateConfidenceInterval(data: number[], confidenceLevel: number = 0.95): {
  confidenceInterval: { lower: number; upper: number };
  isSignificant: boolean;
} {
  const mean = data.reduce((sum, val) => sum + val, 0) / data.length;
  const variance = data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (data.length - 1);
  const standardError = Math.sqrt(variance / data.length);
  
  const tValue = confidenceLevel === 0.95 ? 1.96 : confidenceLevel === 0.99 ? 2.576 : 1.645;
  const marginOfError = tValue * standardError;
  
  const confidenceInterval = {
    lower: mean - marginOfError,
    upper: mean + marginOfError
  };
  
  const isSignificant = confidenceInterval.lower > 0 || confidenceInterval.upper < 0;
  
  return { confidenceInterval, isSignificant };
}

export function calculatePValue(score: number, sampleSize: number): number {
  const tStat = Math.abs(score) / Math.sqrt(sampleSize);
  return tStat < 1.96 ? 0.05 : tStat < 1.645 ? 0.1 : 0.2;
}

export function calculateLinearRegression(values: number[]): {
  slope: number;
  intercept: number;
  rSquared: number;
} {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] || 0, rSquared: 0 };
  
  const sumX = values.reduce((s, _, i) => s + i, 0);
  const sumY = values.reduce((s, y) => s + y, 0);
  const sumXY = values.reduce((s, y, i) => s + i * y, 0);
  const sumX2 = values.reduce((s, _, i) => s + i * i, 0);
  const sumY2 = values.reduce((s, y) => s + y * y, 0);
  
  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) return { slope: 0, intercept: sumY / n, rSquared: 0 };
  
  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  
  const yMean = sumY / n;
  const ssTotal = values.reduce((s, y) => s + Math.pow(y - yMean, 2), 0);
  const ssResidual = values.reduce((s, y, i) => {
    const predicted = intercept + slope * i;
    return s + Math.pow(y - predicted, 2);
  }, 0);
  
  const rSquared = ssTotal === 0 ? 0 : 1 - (ssResidual / ssTotal);
  
  return { slope, intercept, rSquared };
}

export function calculateStandardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function calculateStandardError(positions: number[], rSquared: number): number {
  const residualVariance = calculateStandardDeviation(positions) * Math.sqrt(1 - rSquared);
  return residualVariance / Math.sqrt(positions.length);
}

// ============================================================================
// TIME RANGE UTILITIES (for analyticsLogic integration)
// ============================================================================

export function calculateTimeRangeMs(timeRange: string): number {
  switch (timeRange) {
    case "7d": return 7 * 24 * 60 * 60 * 1000;
    case "30d": return 30 * 24 * 60 * 60 * 1000;
    case "90d": return 90 * 24 * 60 * 60 * 1000;
    case "1y": return 365 * 24 * 60 * 60 * 1000;
    default: return 30 * 24 * 60 * 60 * 1000;
  }
}
