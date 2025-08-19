import type { Models } from "appwrite"

export interface QueryConfig {
  id: string
  name: string
  query: string
  category: "company" | "research paper" | "news" | "pdf" | "github" | "tweet" | "personal site" | "linkedin profile" | "financial report"
  filters: {
    includeDomains?: string[]
    excludeDomains?: string[]
    startDate?: string
    endDate?: string
    numResults: number
  }
  schedule: {
    enabled: boolean
    frequency: "hourly" | "daily" | "weekly"
    times?: string[]
  }
  tags: string[]
  createdAt: Date
  lastRun?: Date
  userId: string 
}

export interface RankingSnapshot {
  id: string
  userId: string
  queryId: string
  timestamp: Date
  results: SearchResult[]
  queryType?: string
  metadata: {
    totalResults: number
    responseTime: number
    exaVersion?: string
    executedAt?: string
    contentHash?: string
    executionType?: "manual" | "scheduled"
    source?: "snapshots_api" | "query_run_api"
    // ✅ NEW: Vector enhancement tracking
    isVectorEnhanced?: boolean
    vectorCount?: number
    semanticProcessingTime?: number
  }
}

export interface SearchResult {
  id: string
  title: string
  url: string
  snippet: string
  score: number
  publishedDate?: string
  author?: string
  domain: string
  position: number
  timestamp: Date
  contentType: 'word' | 'pdf' | 'tweet' | 'github' | 'article' | 'news' | 'auto'
  contentHash: string
  highlights?: string[]
  summary?: string
  // ✅ NEW: Vector support for semantic analytics
  vector?: number[] // 384-dimensional embedding from MiniLM
  semanticScore?: number // Cosine similarity when applicable
  clusterInfo?: {
    clusterId?: string
    coherenceScore?: number
    isAnomaly?: boolean
  }
}

export interface RankingChange {
  url: string
  title: string
  previousPosition?: number
  currentPosition?: number
  change: "new" | "dropped" | "moved_up" | "moved_down" | "stable"
  changeValue: number
  // ✅ NEW: Semantic change tracking
  semanticSimilarity?: number
  contentDrift?: number
}

export interface UserFeedback {
  id: string
  queryId: string
  resultUrl: string
  snapshotId: string
  feedbackType: "relevance" | "quality" | "freshness" | "authority"
  rating: 1 | 2 | 3 | 4 | 5
  comment?: string
  expectedPosition?: number
  tags: string[]
  userId?: string
  createdAt: Date
}

export interface FeedbackFormData {
  resultUrl: string
  feedbackType: "relevance" | "quality" | "freshness" | "authority"
  expectedPosition: string
  rating: number
  comment: string
}

// ✅ ENHANCED: Base analytics data with vector awareness
export interface AnalyticsData {
  timeRangeMs?: number
  filteredSnapshots?: RankingSnapshot[]
  rankingTrendData?: TrendPoint[]
  categoryDistribution?: CategoryDistribution[]
  successRateByHour?: HourlyStats[]
  performanceData?: HourlyStats[]
  topPerformingQueries?: TopQuery[]
  queryPerformanceStats?: QueryPerformanceStats[]
  
  // Core metrics
  rankingStability?: number
  volatilityIndex?: number
  domainDiversity?: number
  avgResponseTime?: number
  newContentDiscovery?: number
  querySuccessRate?: number
  trendSlope?: number
  predictedPosition?: number
  isAnomaly?: boolean
  
  // Performance metrics
  responseTimeStats?: ResponseTimeStats
  executionFrequency?: ExecutionFrequency
  dataFreshness?: DataFreshness
  complexityMetrics?: ComplexityMetrics
  avgComplexityScore?: number
  
  // Source and metadata
  isAppwriteSource?: boolean
  dataSourceType?: 'appwrite' | 'weaviate'
  calculatedAt?: string
  
  // ✅ NEW: Vector enhancement indicators
  vectorsAvailable?: boolean
  hasSemanticData?: boolean
  isVectorEnhanced?: boolean
}

// ✅ ENHANCED: Extended analytics with semantic capabilities
export interface EnhancedAnalyticsData extends AnalyticsData {
  contentCoherence?: ContentCoherenceResult | number
  semanticStability?: SemanticStabilityResult | number
  statisticalValidation?: StatisticalValidationResult
  dataQuality?: DataQualityResult
  semanticInsights?: SemanticInsights
  enhancedMetrics?: EnhancedMetrics
  isWeaviateSource?: boolean
  error?: string
  
  // ✅ NEW: Advanced semantic metrics
  anomalyCount?: number
  diversityIndex?: number
  clusterQuality?: number
  vectorSpaceUtilization?: number
}

// ✅ CONSOLIDATED: Remove duplicate ContentCoherenceResult definitions
export interface ContentCoherenceResult {
  overallCoherence: number
  method: 'umass' | 'cv' | 'npmi' | 'vector-based'
  confidence: number
  pValue?: number
  sampleSize: number
  calculatedAt: number
  score?: number
  // ✅ NEW: Vector-specific metrics
  vectorDimensions?: number
  avgSimilarity?: number
}

export interface SemanticStabilityResult {
  stabilityScore: number
  trendConsistency?: number
  vocabularyDrift?: number
  confidenceInterval: { lower: number; upper: number }
  isSignificant: boolean
  calculatedAt: number
  // ✅ NEW: Vector-specific stability metrics
  centroidDrift?: number
  vectorStability?: number
}

export interface StatisticalValidationResult {
  accuracy: number
  precision: number
  recall: number
  f1Score: number
  mape: number
  confidenceLevel: number
  lastValidated: number
}

export interface DataQualityResult {
  completeness: number
  accuracy: number
  consistency: number
  freshness: number
  validity: number
  anomalyCount: number
  assessedAt: number
  // ✅ NEW: Vector quality metrics
  vectorQuality?: number
  embeddingCoverage?: number
}

// ✅ NEW: Detailed type definitions for better type safety
export interface CategoryDistribution {
  name: string
  value: number
  percent: number
  color: string
  diversity: number
}

export interface HourlyStats {
  hour: number
  successRate: number
  avgTime: number
  failureRate: number
  confidenceInterval: [number, number]
}

export interface TopQuery {
  name: string
  avgPosition: number
  stability: number
  trend: "up" | "down" | "stable"
  trendSlope: number
  predictedPosition: number
}

export interface QueryPerformanceStats {
  name: string
  lastPosition: number | null
  predictedPosition: number
}

export interface TrendPoint {
  date: string
  avgPosition: number
  volatility: number
  count: number
  predictedPosition: number
  isAnomaly: boolean
  anomalyType?: 'high_volatility' | 'sudden_drop' | 'sudden_rise' | 'position_spike' | 'semantic_drift'
  anomalyScore?: number
  volatilityThreshold?: number
  // ✅ NEW: Semantic trend indicators
  semanticVolatility?: number
  contentCoherence?: number
}

export interface ResponseTimeStats {
  min: number
  max: number
  mean: number
  median: number
  stdDev: number
  percentile95: number
}

export interface ExecutionFrequency {
  frequency: number
  efficiency: number
  pattern: string
  avgInterval: number
}

export interface DataFreshness {
  avgAgeHours: number
  maxAgeHours: number
  freshnessScore: number
  stalenessIndicator: 'fresh' | 'moderate' | 'stale'
}

export interface ComplexityMetrics {
  avgComplexityScore: number
  complexityDistribution: ResponseTimeStats
  highComplexityQueries: number
}

// ✅ ENHANCED: Semantic insights with better type safety
export interface SemanticInsights {
  contentAnomalies: {
    count: number
    anomalies: ContentAnomaly[]
    severityDistribution: {
      low: number
      medium: number
      high: number
      critical: number
    }
  }
  semanticClusters: {
    clusters: SemanticCluster[]
    diversity: number
    dominantThemes: string[]
  }
  contentEvolution: {
    periods: EvolutionPeriod[]
    overallTrend: string
    volatility: number
    trendDirection: "improving" | "declining" | "stable"
    discoveryRate: number
    stabilityTrend: StabilityTrendPoint[]
    contentTurnover: number
  }
  weaviateMetrics: WeaviateMetrics
}

// ✅ NEW: Detailed semantic types
export interface ContentAnomaly {
  type: string
  queryId: string
  url: string
  title: string
  anomalyScore: number
  timestamp: string | Date
  description?: string
  semanticDistance?: number
  expectedSimilarity?: number
}

export interface SemanticCluster {
  id: string
  queryIds: string[]
  coherence: number
  theme: string
  size: number
  items?: ClusterItem[]
  centroid?: number[]
  avgSimilarity?: number
}

export interface ClusterItem {
  id: string
  queryId: string
  content: string
  url: string
  similarity: number
  vector?: number[]
}

export interface EvolutionPeriod {
  period: string
  startDate: Date | string
  endDate: Date | string
  anomalyCount: number
  themes: ThemeCount[]
  stability: number
}

export interface ThemeCount {
  theme: string
  count: number
}

export interface StabilityTrendPoint {
  period: string
  stability: number
}

export interface WeaviateMetrics {
  totalVectors: number
  avgSimilarity: number
  clusterCount: number
  isConnected: boolean
  cacheStats: {
    size: number
    hitRate: number
    maxSize: number
  }
}

export interface EnhancedMetrics {
  semanticStability: SemanticStabilityResult | number
  contentCoherence: ContentCoherenceResult | number
  diversityIndex: number
  anomalyCount?: number
  clusterQuality?: number
  vectorSpaceUtilization?: number
  statisticalValidation?: StatisticalValidationResult
  dataQuality?: DataQualityResult
  performanceInsights?: {
    anomalyDetectionAccuracy: number
    clusteringQuality: number
    semanticSearchEfficiency: number
    vectorCacheHitRate: number
  }
}

// ✅ ENHANCED: Store interfaces with semantic support
export interface QueriesStore {
  queries: QueryConfig[]
  isLoading: boolean
  error: string | null
  fetchQueries: (userId?: string, forceRefresh?: boolean) => Promise<void>
  createQuery: (query: Omit<QueryConfig, "id" | "createdAt">) => Promise<QueryConfig>
  runQuery: (queryId: string) => Promise<any>
  updateQuery: (queryId: string, query: Partial<QueryConfig>) => Promise<void>
  deleteQuery: (queryId: string) => Promise<void>
  syncWithWeaviate?: (userId: string) => Promise<void>
}

// ✅ PRESERVED: All your existing interfaces
export interface AuthContextType {
  user: Models.User<Models.Preferences> | null
  userId: string | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name: string) => Promise<void>
  logout: () => Promise<void>
  refreshSession: () => Promise<boolean>
}

export interface EmailOptions {
  to: string
  subject: string
  html: string
  attachments?: Array<{
    filename: string
    content: Buffer
    contentType: string
  }>
}

export interface ExaSearchOptions {
  query: string
  category?: "company" | "research paper" | "news" | "pdf" | "github" | "tweet" | "personal site" | "linkedin profile" | "financial report"
  includeDomains?: string[]
  excludeDomains?: string[]
  startDate?: string
  endDate?: string
  numResults?: number
}

export interface ExaSearchResult {
  title: string
  url: string
  snippet: string
  score: number
  publishedDate?: string
  author?: string
}

export interface ExaSearchResponse {
  results: ExaSearchResult[]
  totalResults: number
  responseTime: number
}

export interface DriftAnalysisResult {
  queryId: string
  queryName: string
  driftTimeline: DriftTimelinePoint[]
  averageDrift: number
  maxDrift: number
  latestDrift: number
  stability: "stable" | "medium" | "volatile"
  driftTrend: "improving" | "worsening" | "stable"
  totalProcessingTime: number
  totalContentChanges: number
  averageCacheHitRate: number
}

export interface DriftTimelinePoint {
  timestamp: Date
  snapshotId: string
  previousSnapshotId: string | null
  driftScore: number
  rankChanges: RankChange[]
  newResults: number
  droppedResults: number
  contentChanges: number
  processingTime: number
}

export interface RankChange {
  url: string
  title: string
  previousPosition: number
  currentPosition: number
  positionDelta: number
  similarityScore: number
  contentChanged: boolean | number
}

export interface QueryExecution {
  id: string
  queryId: string
  status: 'idle' | 'queued' | 'running' | 'success' | 'error' | 'cancelled'
  progress: number
  startTime?: number
  endTime?: number
  duration?: number
  results?: {
    totalResults: number
    responseTime: number
    timestamp: Date
    averagePosition?: number
    topDomains: string[]
  }
  error?: string
  retryCount: number
  scheduledTime?: Date
  nextRun?: Date
}

export interface SchedulerConfig {
  isEnabled: boolean
  batchSize: number
  intervalBetweenQueries: number
  maxConcurrent: number
  retryAttempts: number
  retryDelay: number
  autoRetryOnFailure: boolean
}

export interface MonitorStats {
  totalExecutions: number
  successRate: number
  averageResponseTime: number
  totalResults: number
  activeQueries: number
  queuedQueries: number
  failedQueries: number
  uptime: number
}

export interface SecurityContext {
  user: any
  sessionId: string
  ip: string
  userAgent: string
  endpoint: string
  method: string
}
