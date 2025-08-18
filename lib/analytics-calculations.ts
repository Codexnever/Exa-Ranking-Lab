// app/lib/analytics-calculations.ts
import { ContentCoherenceResult, SemanticStabilityResult, StatisticalValidationResult, DataQualityResult} from "@/lib/type";


// Content Coherence Calculations
// export function extractTopWords(documents: Array<{content: string}>, count: number = 20): string[] {
//   const wordFreq = new Map<string, number>();
  
//   documents.forEach(doc => {
//     const words = doc.content.toLowerCase()
//       .replace(/[^\w\s]/g, '')
//       .split(/\s+/)
//       .filter(word => word.length > 3);
    
//     words.forEach(word => {
//       wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
//     });
//   });
  
//   return Array.from(wordFreq.entries())
//     .sort((a, b) => b[1] - a[1])
//     .slice(0, count)
//     .map(([word]) => word);
// }

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

export function calculateUMassCoherence(
  documents: Array<{title: string, content: string}>,
  method: 'umass' | 'cv' | 'npmi' = 'umass'
): ContentCoherenceResult {
  const topWords = extractTopWords(documents, 20);
  let coherenceScore = 0;
  let validPairs = 0;
  
  if (method === 'umass') {
    // UMass Coherence: log(P(wi, wj) / P(wj))
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
  
  // Normalize score to 0-100
  const normalizedScore = Math.max(0, Math.min(100, 
    50 + (coherenceScore / validPairs) * 10
  ));
  
  // Calculate statistical significance
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

// Semantic Stability Calculations
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
  
  // Using t-distribution critical value (approximation)
  const tValue = confidenceLevel === 0.95 ? 1.96 : confidenceLevel === 0.99 ? 2.576 : 1.645;
  const marginOfError = tValue * standardError;
  
  const confidenceInterval = {
    lower: mean - marginOfError,
    upper: mean + marginOfError
  };
  
  const isSignificant = confidenceInterval.lower > 0 || confidenceInterval.upper < 0;
  
  return { confidenceInterval, isSignificant };
}

export function calculateSemanticStability(
  timeSeriesData: Array<{timestamp: number, content: string}>
): SemanticStabilityResult {
  if (timeSeriesData.length < 2) {
    throw new Error('Insufficient data for stability calculation (minimum 2 data points required)');
  }
  
  // Calculate embeddings similarity over time
  const similarities: number[] = [];
  const vocabularySets: Set<string>[] = timeSeriesData.map(data => 
    new Set(extractWords(data.content))
  );
  
  for (let i = 1; i < timeSeriesData.length; i++) {
    // Calculate cosine similarity between consecutive time periods
    const similarity = calculateCosineSimilarity(
      timeSeriesData[i-1].content,
      timeSeriesData[i].content
    );
    similarities.push(similarity);
    
    // Calculate vocabulary drift
    const prevVocab = vocabularySets[i-1];
    const currentVocab = vocabularySets[i];
    const intersection = new Set([...prevVocab].filter(x => currentVocab.has(x)));
    const union = new Set([...prevVocab, ...currentVocab]);
    const vocabularyStability = intersection.size / union.size;
    similarities.push(vocabularyStability);
  }
  
  // Calculate overall stability
  const meanSimilarity = similarities.reduce((sum, sim) => sum + sim, 0) / similarities.length;
  const stabilityScore = meanSimilarity * 100;
  
  // Calculate trend consistency
  const trendConsistency = calculateTrendConsistency(similarities);
  
  // Calculate vocabulary drift
  const vocabularyDrift = calculateVocabularyDrift(vocabularySets);
  
  // Statistical significance testing
  const { confidenceInterval, isSignificant } = calculateConfidenceInterval(
    similarities, 0.95
  );
  
  return {
    stabilityScore,
    trendConsistency,
    vocabularyDrift,
    confidenceInterval,
    isSignificant,
    calculatedAt: Date.now()
  };
}

// Statistical Utilities
export function calculatePValue(score: number, sampleSize: number): number {
  // Simplified p-value calculation
  // In production, use proper statistical tests
  const tStat = Math.abs(score) / Math.sqrt(sampleSize);
  return tStat < 1.96 ? 0.05 : tStat < 1.645 ? 0.1 : 0.2;
}

// Prediction Model Calculations
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
  
  // Calculate R-squared
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
