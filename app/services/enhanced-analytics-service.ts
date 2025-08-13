// app/services/enhanced-analytics-service.ts
import { AnalyticsService } from "./analytics-service";
import type { WeaviateService } from "./weaviate-service";

export interface SemanticInsights {
  contentAnomalies: {
    count: number;
    anomalies: any[];
    severityDistribution: {
      low: number;
      medium: number;
      high: number;
      critical: number;
    };
  };
  semanticClusters: {
    clusters: any[];
    diversity: number;
    dominantThemes: string[];
  };
  contentEvolution: {
    periods: any[];
    overallTrend: string;
    volatility: number;
    trendDirection: "improving" | "declining" | "stable";
  };
  weaviateMetrics: any;
}

export interface EnhancedMetrics {
  semanticStability: number;
  contentCoherence: number;
  diversityIndex: number;
}

export class EnhancedAnalyticsService extends AnalyticsService {
  protected weaviateService: WeaviateService;

  constructor(isLocal: boolean, weaviateService: WeaviateService) {
    super(isLocal);
    this.weaviateService = weaviateService;
  }

  async getSemanticAnalytics(userId: string, timeRangeMs: number) {
    try {
      // Get traditional analytics as base
      const traditional = await this.getAnalytics(userId, timeRangeMs);

      // Run semantic analysis in parallel
      const [contentAnomalies, semanticClusters, contentEvolution] = await Promise.all([
        this.weaviateService.detectContentAnomalies(userId, timeRangeMs),
        this.analyzeSemanticClusters(userId, timeRangeMs),
        this.analyzeContentEvolution(userId, timeRangeMs),
      ]);

      // Build semantic insights
      const semanticInsights: SemanticInsights = {
        contentAnomalies: {
          count: contentAnomalies.length,
          anomalies: contentAnomalies.slice(0, 10),
          severityDistribution: this.categorizeAnomalies(contentAnomalies),
        },
        semanticClusters: {
          clusters: semanticClusters,
          diversity: this.calculateSemanticDiversity(semanticClusters),
          dominantThemes: this.extractDominantThemes(semanticClusters),
        },
        contentEvolution: {
          ...contentEvolution,
          trendDirection: this.determineEvolutionTrend(contentEvolution),
        },
        weaviateMetrics: this.weaviateService.getCacheStats(),
      };

      // Calculate enhanced metrics
      const enhancedMetrics: EnhancedMetrics = {
        semanticStability: this.calculateSemanticStability(contentAnomalies, semanticClusters),
        contentCoherence: this.calculateContentCoherence(semanticClusters),
        diversityIndex: semanticInsights.semanticClusters.diversity,
      };

      return {
        ...traditional,
        semanticInsights,
        enhancedMetrics,
      };

    } catch (err) {
      console.error("[EnhancedAnalytics] Semantic analytics failed:", err);
      const fallback = await this.getAnalytics(userId, timeRangeMs);
      return { 
        ...fallback, 
        semanticInsights: null, 
        enhancedMetrics: null,
        error: "Semantic analysis unavailable" 
      };
    }
  }

  private async analyzeSemanticClusters(userId: string, timeRangeMs: number): Promise<any[]> {
    try {
      // Initialize Weaviate if needed
      await this.weaviateService.initialize();

      // Get content anomalies as basis for clustering
      const anomalies = await this.weaviateService.detectContentAnomalies(userId, timeRangeMs);

      // Group anomalies by theme
      const clusters = new Map<string, any[]>();
      anomalies.forEach(anomaly => {
        const theme = this.extractTheme(anomaly.title || "");
        if (!clusters.has(theme)) {
          clusters.set(theme, []);
        }
        clusters.get(theme)!.push(anomaly);
      });

      // Build processed clusters with queryIds mapping
      return Array.from(clusters.entries()).map(([theme, items]) => {
        const queryIdSet = new Set<string>();
        items.forEach(item => {
          if (item.queryId) queryIdSet.add(item.queryId);
        });

        return {
          id: theme,
          theme,
          size: items.length,
          items: items.slice(0, 5), // Sample top items for preview
          coherence: this.calculateClusterCoherence(items),
          queryIds: Array.from(queryIdSet), // Essential for SemanticHeatmap integration
          centroid: this.calculateClusterCentroid(items),
        };
      }).sort((a, b) => b.size - a.size); // Sort by size descending

    } catch (error) {
      console.error("[EnhancedAnalytics] Cluster analysis failed:", error);
      return [];
    }
  }

  private async analyzeContentEvolution(userId: string, timeRangeMs: number): Promise<any> {
    try {
      const periods = this.createTimePeriods(timeRangeMs, 7);
      const evolutionData: any[] = [];

      for (const period of periods) {
        const anomalies = await this.weaviateService.detectContentAnomalies(userId, period.duration);
        evolutionData.push({
          period: period.label,
          startDate: period.start,
          endDate: period.end,
          anomalyCount: anomalies.length,
          themes: this.extractThemes(anomalies),
          stability: this.calculatePeriodStability(anomalies),
        });
      }

      return {
        periods: evolutionData,
        overallTrend: this.calculateOverallTrend(evolutionData),
        volatility: this.calculateContentVolatility(evolutionData),
        discoveryRate: this.calculateDiscoveryRate(evolutionData),
        stabilityTrend: evolutionData.map(d => ({
          period: d.period,
          stability: d.stability
        })),
        contentTurnover: this.calculateContentTurnover(evolutionData),
      };

    } catch (error) {
      console.error("[EnhancedAnalytics] Content evolution failed:", error);
      return { 
        periods: [], 
        overallTrend: "stable", 
        volatility: 0,
        discoveryRate: 0,
        stabilityTrend: [],
        contentTurnover: 0,
      };
    }
  }

  // Theme extraction with improved keyword matching
  private extractTheme(title: string): string {
    const themes: Record<string, string[]> = {
      technology: ["ai", "tech", "software", "digital", "code", "programming", "api", "web", "app"],
      business: ["business", "company", "market", "finance", "revenue", "profit", "sales"],
      news: ["news", "report", "update", "breaking", "latest", "announcement"],
      research: ["research", "study", "analysis", "findings", "paper", "journal", "academic"],
      education: ["learn", "tutorial", "guide", "course", "education", "training", "how-to"],
      social: ["twitter", "linkedin", "facebook", "social", "media", "post"],
      government: ["gov", "government", "policy", "regulation", "law", "legal"],
    };

    const titleLower = title.toLowerCase();
    let bestMatch = "general";
    let maxMatches = 0;

    for (const [theme, keywords] of Object.entries(themes)) {
      const matches = keywords.filter(keyword => titleLower.includes(keyword)).length;
      if (matches > maxMatches) {
        maxMatches = matches;
        bestMatch = theme;
      }
    }

    return bestMatch;
  }

  private extractThemes(anomalies: any[]) {
    const counts = new Map<string, number>();
    anomalies.forEach(anomaly => {
      const theme = this.extractTheme(anomaly.title || "");
      counts.set(theme, (counts.get(theme) || 0) + 1);
    });

    return Array.from(counts.entries())
      .map(([theme, count]) => ({ theme, count }))
      .sort((a, b) => b.count - a.count);
  }

  // Enhanced cluster coherence calculation
  private calculateClusterCoherence(items: any[]): number {
    // Collect vectors from items
    const vectors: number[][] = [];
    for (const item of items) {
      const vector = this.extractVector(item);
      if (Array.isArray(vector) && vector.length > 0) {
        vectors.push(vector);
      }
    }

    // No vectors available
    if (vectors.length === 0) return 0.5; // Neutral fallback
    
    // Only one item -> perfectly coherent
    if (vectors.length === 1) return 1.0;

    // Calculate average pairwise cosine similarity
    let totalSimilarity = 0;
    let pairCount = 0;

    for (let i = 0; i < vectors.length - 1; i++) {
      for (let j = i + 1; j < vectors.length; j++) {
        totalSimilarity += this.cosineSimilaritySafe(vectors[i], vectors[j]);
        pairCount++;
      }
    }

    if (pairCount === 0) return 0.5;

    const avgSimilarity = totalSimilarity / pairCount;
    // Clamp to 0-1 range
    return Math.max(0, Math.min(1, avgSimilarity));
  }

  // Calculate cluster centroid for visualization
  private calculateClusterCentroid(items: any[]): number[] {
    const vectors = items.map(item => this.extractVector(item)).filter(Boolean);
    if (vectors.length === 0) return [];

    const dimensions = vectors[0]?.length || 0;
    if (dimensions === 0) return [];

    const centroid = new Array(dimensions).fill(0);
    vectors.forEach(vector => {
      vector.forEach((val, idx) => {
        centroid[idx] += val / vectors.length;
      });
    });

    return centroid;
  }

  // Safely extract vector from anomaly/search result item
  private extractVector(item: any): number[] | null {
    try {
      // Check for Weaviate _additional.vector format
      if (item?._additional?.vector && Array.isArray(item._additional.vector)) {
        return item._additional.vector as number[];
      }
      
      // Check for direct vector property
      if (Array.isArray(item?.vector)) {
        return item.vector as number[];
      }
      
      return null;
    } catch {
      return null;
    }
  }

  // FIXED: Corrected syntax error in cosine similarity
  private cosineSimilaritySafe(a: number[], b: number[]): number {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      const ai = a[i] || 0;
      const bi = b[i] || 0;
      dotProduct += ai * bi;
      normA += ai * ai;
      normB += bi * bi;
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;

    // Map cosine [-1,1] → coherence [0,1]
    const cosineValue = dotProduct / denominator;
    return (cosineValue + 1) / 2;
  }

  // Semantic stability calculation
  private calculateSemanticStability(anomalies: any[], clusters: any[]): number {
    if (!anomalies.length) return 100;

    const anomalyRate = Math.min(anomalies.length / 100, 1);
    const avgCoherence = clusters.length > 0
      ? clusters.reduce((sum, cluster) => sum + (cluster.coherence || 0), 0) / clusters.length
      : 1;

    return Math.round((1 - anomalyRate) * avgCoherence * 100);
  }

  // Content coherence calculation
  private calculateContentCoherence(clusters: any[]): number {
    if (!clusters.length) return 1;
    return clusters.reduce((sum, cluster) => sum + (cluster.coherence || 0), 0) / clusters.length;
  }

  // Semantic diversity using Shannon entropy
  private calculateSemanticDiversity(clusters: any[]): number {
    if (clusters.length <= 1) return 0;

    const total = clusters.reduce((sum, cluster) => sum + (cluster.size || 0), 0);
    if (total === 0) return 0;

    // Calculate Shannon entropy
    const entropy = clusters.reduce((H, cluster) => {
      const proportion = (cluster.size || 0) / total;
      return proportion > 0 ? H - proportion * Math.log2(proportion) : H;
    }, 0);

    // Normalize by maximum possible entropy
    const maxEntropy = Math.log2(clusters.length);
    return maxEntropy > 0 ? entropy / maxEntropy : 0;
  }

  // Time period creation for evolution analysis
  private createTimePeriods(rangeMs: number, count: number) {
    const periodDuration = rangeMs / count;
    const now = Date.now();
    const periods = [];

    for (let i = 0; i < count; i++) {
      const end = now - i * periodDuration;
      const start = end - periodDuration;
      periods.push({
        label: `Period ${count - i}`,
        start: new Date(start),
        end: new Date(end),
        duration: periodDuration,
      });
    }

    return periods.reverse();
  }

  // Anomaly categorization by severity
  private categorizeAnomalies(anomalies: any[]) {
    const distribution = { low: 0, medium: 0, high: 0, critical: 0 };
    
    anomalies.forEach(anomaly => {
      const score = anomaly.anomalyScore || 0;
      if (score < 1) distribution.low++;
      else if (score < 2) distribution.medium++;
      else if (score < 3) distribution.high++;
      else distribution.critical++;
    });

    return distribution;
  }

  // Extract dominant themes from clusters
  private extractDominantThemes(clusters: any[]): string[] {
    return clusters
      .slice()
      .sort((a, b) => (b.size || 0) - (a.size || 0))
      .slice(0, 5)
      .map(cluster => cluster.theme);
  }

  // Determine evolution trend direction
  private determineEvolutionTrend(evolution: any): "improving" | "declining" | "stable" {
    if (!evolution.periods || evolution.periods.length < 2) return "stable";

    const recentPeriods = evolution.periods.slice(-3);
    const stabilityValues = recentPeriods.map((period: any) => period.stability);
    const slope = this.computeSlope(stabilityValues);

    if (slope > 0.1) return "improving";
    if (slope < -0.1) return "declining";
    return "stable";
  }

  // Compute linear regression slope
  private computeSlope(values: number[]): number {
    if (values.length < 2) return 0;

    const n = values.length;
    const sumX = values.reduce((sum, _, index) => sum + index, 0);
    const sumY = values.reduce((sum, value) => sum + value, 0);
    const sumXY = values.reduce((sum, value, index) => sum + index * value, 0);
    const sumX2 = values.reduce((sum, _, index) => sum + index * index, 0);

    const denominator = n * sumX2 - sumX * sumX;
    if (denominator === 0) return 0;

    return (n * sumXY - sumX * sumY) / denominator;
  }

  // Calculate overall trend from evolution data
  private calculateOverallTrend(evolutionData: any[]): string {
    if (evolutionData.length < 2) return "stable";

    const anomalyCounts = evolutionData.map(data => data.anomalyCount || 0);
    const slope = this.computeSlope(anomalyCounts);

    if (slope > 0.5) return "increasing_anomalies";
    if (slope < -0.5) return "decreasing_anomalies";
    return "stable";
  }

  // Calculate content volatility
  private calculateContentVolatility(evolutionData: any[]): number {
    if (evolutionData.length < 2) return 0;

    const anomalyCounts = evolutionData.map(data => data.anomalyCount || 0);
    const mean = anomalyCounts.reduce((sum, count) => sum + count, 0) / anomalyCounts.length;
    const variance = anomalyCounts.reduce((sum, count) => sum + Math.pow(count - mean, 2), 0) / anomalyCounts.length;

    return Math.sqrt(variance);
  }

  // Calculate period stability
  private calculatePeriodStability(anomalies: any[]): number {
    if (!anomalies.length) return 1;

    const avgAnomalyScore = anomalies.reduce((sum, anomaly) => sum + (anomaly.anomalyScore || 0), 0) / anomalies.length;
    return Math.max(0, 1 - avgAnomalyScore / 5); // Normalize to 0-1 range
  }

  // Additional helper methods for content evolution
  private calculateDiscoveryRate(evolutionData: any[]): number {
    if (!evolutionData.length) return 0;
    
    const totalThemes = new Set();
    evolutionData.forEach(period => {
      period.themes?.forEach((theme: any) => totalThemes.add(theme.theme));
    });

    return evolutionData.length > 0 ? totalThemes.size / evolutionData.length : 0;
  }

  private calculateContentTurnover(evolutionData: any[]): number {
    if (evolutionData.length < 2) return 0;

    let turnoverSum = 0;
    for (let i = 1; i < evolutionData.length; i++) {
      const prevThemes = new Set(evolutionData[i-1].themes?.map((t: any) => t.theme) || []);
      const currThemes = new Set(evolutionData[i].themes?.map((t: any) => t.theme) || []);
      
      const intersection = new Set([...prevThemes].filter(theme => currThemes.has(theme)));
      const union = new Set([...prevThemes, ...currThemes]);
      
      const jaccard = union.size > 0 ? intersection.size / union.size : 0;
      turnoverSum += 1 - jaccard; // Turnover is inverse of similarity
    }

    return turnoverSum / (evolutionData.length - 1);
  }
}
