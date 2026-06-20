// lib/type.ts
import type { Models } from "appwrite"

// ============================================================================
// QUERY & SEARCH
// ============================================================================

export interface QueryConfig {
  id:       string
  name:     string
  query:    string
  category: ExaCategory
  filters: {
    includeDomains?: string[]
    excludeDomains?: string[]
    startDate?:      string
    endDate?:        string
    //  Optional — default applied at API/service layer (typically 10)
    numResults?:     number
  }
  schedule: {
    enabled:   boolean
    frequency: "hourly" | "daily" | "weekly"
    times?:    string[]
  }
  tags:      string[]
  createdAt: Date
  lastRun?:  Date
  userId:    string
}

// ✅ Single source of truth for Exa categories
export type ExaCategory =
  | "company"
  | "research paper"
  | "news"
  | "pdf"
  | "github"
  | "tweet"
  | "personal site"
  | "linkedin profile"
  | "financial report"

export interface ExaSearchOptions {
  query:           string
  category?:       ExaCategory
  results?:        number
  includeDomains?: string[]
  excludeDomains?: string[]
  startDate?:      string
  endDate?:        string
  numResults?:     number
}

export interface ExaSearchResult {
  title:          string
  url:            string
  snippet:        string
  score:          number
  publishedDate?: string
  author?:        string
  fullText?:       string
}

export interface ExaSearchResponse {
  results:      ExaSearchResult[]
  totalResults: number
  responseTime: number | string
  searchTime: number | string
  requestId: string
  searchType?: string
}

// ============================================================================
// SEARCH RESULTS & SNAPSHOTS
// ============================================================================

export interface SearchResult {
  id:            string
  title:         string
  url:           string
  snippet:       string
  score:         number
  publishedDate?: string
  author?:       string
  domain:        string
  position:      number
  timestamp:     Date
  // ✅ Removed 'auto' — not a real stored content type after fetch
  contentType:   "word" | "pdf" | "tweet" | "github" | "article" | "news"
  contentHash:   string
  highlights?:   string[]
  summary?:      string
  fullText?: string

  // Vector support for semantic analytics
  vector?:         number[]    // 384-dim MiniLM embedding
  semanticScore?:  number      // cosine similarity when applicable
  clusterInfo?: {
    clusterId?:      string
    coherenceScore?: number
    isAnomaly?:      boolean
  }
}

export interface RankingSnapshot {
  id:        string
  userId:    string
  queryId:   string
  timestamp: Date
  results:   SearchResult[]
  queryType?: string
  metadata: {
    totalResults:         number
    responseTime:         number | string
    // ✅ Required — always set to new Date().toISOString()
    executedAt:           string
    exaVersion?:          string
    // ✅ contentHash here is snapshot-level; SearchResult.contentHash is result-level
    contentHash?:         string
    executionType?:       "manual" | "scheduled"
    source?:              "snapshots_api" | "query_run_api" | "analytics_refresh_api" |"cron_scheduler"
    isVectorEnhanced?:    boolean
    vectorCount?:         number
    semanticProcessingTime?: number
    // Allow service-specific extension
    [key: string]: unknown
  }
}

export interface RankingChange {
  url:               string
  title:             string
  previousPosition?: number
  currentPosition?:  number
  change:            "new" | "dropped" | "moved_up" | "moved_down" | "stable"
  changeValue:       number
  semanticSimilarity?: number
  contentDrift?:       number
}

// ============================================================================
// ANALYTICS — BASE
// ===========================================================================

/**
 * Core computed analytics — fields returned by analyticsCalculations().
 *
 * Required fields: always produced by the engine.
 * Optional fields: source metadata, vector extensions, or conditionally set.
 *
 *  Not all fields are optional — core metrics are guaranteed after calculation.
 */
export interface AnalyticsData {
  // ── Core computed (always present after analyticsCalculations) ────────────
  timeRangeMs:           number
  filteredSnapshots:     RankingSnapshot[]
  rankingTrendData:      TrendPoint[]
  categoryDistribution:  CategoryDistribution[]
  successRateByHour:     HourlyStats[]
  performanceData:       HourlyStats[]
  topPerformingQueries:  TopQuery[]
  queryPerformanceStats: QueryPerformanceStats[]
  rankingStability:      number
  volatilityIndex:       number
  domainDiversity:       number
  avgResponseTime:       number
  newContentDiscovery:   number
  querySuccessRate:      number
  trendSlope:            number
  predictedPosition:     number
  isAnomaly:             boolean

  // ── Extended metrics (set by service layer, not pure analytics engine) ────
  responseTimeStats?:  ResponseTimeStats
  executionFrequency?: ExecutionFrequency
  dataFreshness?:      DataFreshness
  complexityMetrics?:  ComplexityMetrics
  avgComplexityScore?: number

  // ── Source metadata ───────────────────────────────────────────────────────
  isAppwriteSource?: boolean
  dataSourceType?:   "appwrite" | "weaviate"
  calculatedAt?:     string

  // ── Vector indicators ─────────────────────────────────────────────────────
  vectorsAvailable?: boolean
  hasSemanticData?:  boolean
  isVectorEnhanced?: boolean
}

// ============================================================================
// ANALYTICS — ENHANCED (semantic layer)
// ============================================================================

/**
 * Enhanced analytics with Weaviate/semantic capabilities.
 * Extends AnalyticsData — all base fields are still present.
 *
 * ✅ semanticStability / contentCoherence live HERE, not on AnalyticsData.
 *    Base type has no awareness of semantic types.
 */
export interface EnhancedAnalyticsData extends AnalyticsData {
  // Semantic metrics — typed, not plain number
  contentCoherence?:       ContentCoherenceResult | number
  semanticStability?:      SemanticStabilityResult | number

  // Validation & quality
  statisticalValidation?:  StatisticalValidationResult
  dataQuality?:            DataQualityResult

  // Semantic insights (Weaviate-specific)
  semanticInsights?:       SemanticInsights
  enhancedMetrics?:        EnhancedMetrics

  // Source flags
  isWeaviateSource?:       boolean

  // Pagination cursor for Weaviate result sets
  nextCursor?:             string | null

  // Error passthrough
  error?:                  string

  // Advanced semantic summary metrics
  anomalyCount?:            number
  diversityIndex?:          number
  clusterQuality?:          number
  vectorSpaceUtilization?:  number
}

// ============================================================================
// ANALYTICS — SUPPORTING TYPES
// ============================================================================

export interface CategoryDistribution {
  name:      string
  value:     number
  percent:   number
  color:     string
  diversity: number
}

/**
 * confidenceInterval is a tuple [lower, upper].
 * Note: JSON deserialization loses tuple type — fixHourlyStats() re-casts it
 * in service layer. This is unavoidable with JSON persistence.
 */
export interface HourlyStats {
  hour:               number
  successRate:        number
  avgTime:            number
  failureRate:        number
  confidenceInterval: [number, number]
}

export interface TopQuery {
  name:              string
  avgPosition:       number
  stability:         number
  trend:             "up" | "down" | "stable"
  trendSlope:        number
  predictedPosition: number
}

export interface QueryPerformanceStats {
  name:              string
  lastPosition:      number | null
  predictedPosition: number
}

export interface TrendPoint {
  date:               string
  avgPosition:        number
  volatility:         number
  count:              number
  predictedPosition:  number
  isAnomaly:          boolean
  // Explicit undefined in union so strict TS doesn't complain
  anomalyType?:       "high_volatility" | "sudden_drop" | "sudden_rise" | "position_spike" | "semantic_drift" | string
  anomalyScore?:      number
  volatilityThreshold?: number
  // Semantic indicators
  semanticVolatility?: number
  contentCoherence?:   number
}

export interface ResponseTimeStats {
  min:          number
  max:          number
  mean:         number
  median:       number
  stdDev:       number
  percentile95: number
}

export interface ExecutionFrequency {
  frequency:   number
  efficiency:  number
  pattern:     string
  avgInterval: number
}

export interface DataFreshness {
  avgAgeHours:        number
  maxAgeHours:        number
  freshnessScore:     number
  stalenessIndicator: "fresh" | "moderate" | "stale"
}

export interface ComplexityMetrics {
  avgComplexityScore:      number
  complexityDistribution:  ResponseTimeStats
  highComplexityQueries:   number
}

// ============================================================================
// SEMANTIC ANALYTICS TYPES
// ============================================================================

export interface ContentCoherenceResult {
  overallCoherence: number
  method:           "umass" | "cv" | "npmi" | "vector-based"
  confidence:       number
  pValue?:          number
  sampleSize:       number
  calculatedAt:     number
  score?:           number
  // Vector-specific
  vectorDimensions?: number
  avgSimilarity?:    number
}

export interface SemanticStabilityResult {
  stabilityScore:     number
  trendConsistency?:  number
  vocabularyDrift?:   number
  confidenceInterval: { lower: number; upper: number }
  isSignificant:      boolean
  calculatedAt:       number
  // Vector-specific
  centroidDrift?:   number
  vectorStability?: number
}

export interface StatisticalValidationResult {
  accuracy:        number
  precision:       number
  recall:          number
  f1Score:         number
  mape:            number
  confidenceLevel: number
  lastValidated:   number
}

export interface DataQualityResult {
  completeness:  number
  accuracy:      number
  consistency:   number
  freshness:     number
  validity:      number
  anomalyCount:  number
  assessedAt:    number
  // Vector quality
  vectorQuality?:      number
  embeddingCoverage?:  number
}

/**
 * SemanticInsights — single definition used by all services.
 *  WeaviateAnalyticsService and enhanced-analytics-service import THIS type
 *    instead of re-declaring their own. Prevents drift between 3 copies.
 */
export interface SemanticInsights {
  contentAnomalies: {
    count:                number
    anomalies:            ContentAnomaly[]
    severityDistribution: { low: number; medium: number; high: number; critical: number }
  }
  semanticClusters: {
    clusters:       SemanticCluster[]
    diversity:      number
    dominantThemes: string[]
  }
  contentEvolution: {
    periods:         EvolutionPeriod[]
    overallTrend:    string
    volatility:      number
    trendDirection:  "improving" | "declining" | "stable"
    discoveryRate:   number
    stabilityTrend:  StabilityTrendPoint[]
    contentTurnover: number
  }
  weaviateMetrics: WeaviateMetrics
  trendAnalysis?:   {
    growingTopics:    string[]
    decliningTopics:  string[]
    emergingPatterns: string[]
  }
}

export interface ContentAnomaly {
  type:                string
  queryId:             string
  url:                 string
  title:               string
  anomalyScore:        number
  timestamp:           string | Date
  description?:        string
  semanticDistance?:   number
  expectedSimilarity?: number
}

export interface SemanticCluster {
  id:            string
  queryIds:      string[]
  coherence:     number
  theme:         string
  size:          number
  items?:        ClusterItem[]
  centroid?:     number[]
  avgSimilarity?: number
}

export interface ClusterItem {
  id:         string
  queryId:    string
  content:    string
  url:        string
  similarity: number
  vector?:    number[]
}

export interface EvolutionPeriod {
  period:       string
  startDate:    Date | string
  endDate:      Date | string
  anomalyCount: number
  themes:       ThemeCount[]
  stability:    number
}

export interface ThemeCount {
  theme: string
  count: number
}

export interface StabilityTrendPoint {
  period:    string
  stability: number
}

export interface WeaviateMetrics {
  totalVectors:  number
  avgSimilarity: number
  clusterCount:  number
  isConnected:   boolean
  cacheStats: {
    size:    number
    hitRate: number
    maxSize: number
  }
}

export interface EnhancedMetrics {
  semanticStability:      SemanticStabilityResult | number
  contentCoherence:       ContentCoherenceResult  | number
  diversityIndex:         number
  anomalyCount?:          number
  clusterQuality?:        number
  vectorSpaceUtilization?: number
  statisticalValidation?: StatisticalValidationResult
  dataQuality?:           DataQualityResult
  performanceInsights?: {
    anomalyDetectionAccuracy:  number
    clusteringQuality:         number
    semanticSearchEfficiency:  number
    vectorCacheHitRate:        number
  }
}

// ============================================================================
// AUTH
// ============================================================================

export interface AuthContextType {
  user:     Models.User<Models.Preferences> | null
  userId:   string | null
  // initializing = first session check not yet complete (blocks route rendering)
  initializing: boolean
  // loading = login/logout/register action in-flight (disables form buttons)
  loading:  boolean
  login:    (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name: string) => Promise<void>
  logout:   () => Promise<void>
  //  Returns the user (or null) — matches fetchUser implementation
  refreshSession: () => Promise<Models.User<Models.Preferences> | null>
}

// ============================================================================
// FEEDBACK
// ============================================================================

export interface UserFeedback {
  id:               string
  queryId:          string
  resultUrl:        string
  snapshotId:       string
  feedbackType:     "relevance" | "quality" | "freshness" | "authority"
  rating:           1 | 2 | 3 | 4 | 5
  comment?:         string
  expectedPosition?: number
  tags:             string[]
  userId?:          string
  createdAt:        Date
}

export interface FeedbackFormData {
  resultUrl:        string
  feedbackType:     "relevance" | "quality" | "freshness" | "authority"
  expectedPosition: string
  rating:           number
  comment:          string
}

// ============================================================================
// CACHING
// ============================================================================

/**  Generic — use CachedAnalytics<AnalyticsData> instead of CachedAnalytics */
export interface CachedAnalytics<T = unknown> {
  data:      T
  timestamp: number
}

// ============================================================================
// SCHEDULER & MONITORING
// ============================================================================

export interface QueryExecution {
  id:      string
  queryId: string
  status:  "idle" | "queued" | "running" | "success" | "error" | "cancelled"
  progress: number
  startTime?:  number
  endTime?:    number
  duration?:   number
  results?: {
    totalResults:     number
    responseTime:     number
    timestamp:        Date
    averagePosition?: number
    topDomains:       string[]
  }
  error?:         string
  retryCount:     number
  scheduledTime?: Date
  nextRun?:       Date
}

export interface SchedulerConfig {
  isEnabled:               boolean
  batchSize:               number
  intervalBetweenQueries: number
  maxConcurrent:           number
  retryAttempts:           number
  retryDelay:              number
  autoRetryOnFailure:      boolean
}

export interface MonitorStats {
  totalExecutions:   number
  successRate:       number
  averageResponseTime: number
  totalResults:      number
  activeQueries:     number
  queuedQueries:     number
  failedQueries:     number
  uptime:            number
}

// ============================================================================
// DRIFT ANALYSIS
// ============================================================================

export interface DriftAnalysisResult {
  queryId:              string
  queryName:            string
  driftTimeline:        DriftTimelinePoint[]
  averageDrift:         number
  maxDrift:             number
  latestDrift:          number
  stability:            "stable" | "medium" | "volatile"
  driftTrend:           "improving" | "worsening" | "stable"
  totalProcessingTime:  number
  totalContentChanges:  number
   averageCacheHitRate:  number
   totalResultsCompared?: number
   contentStabilityRate?: number
}

export interface DriftTimelinePoint {
  timestamp:           Date
  snapshotId:          string
  previousSnapshotId:  string | null
  driftScore:          number
  rankChanges:         RankChange[]
  newResults:          number
  droppedResults:      number
  contentChanges:      number
  processingTime:      number
}

export interface RankChange {
  url:              string
  title:            string
  previousPosition: number
  currentPosition:  number
  positionDelta:    number
  similarityScore:  number
  contentChanged:   boolean | number
}

// ============================================================================
// EMAIL & SECURITY
// ============================================================================

export interface EmailOptions {
  to:      string
  subject: string
  html:    string
  attachments?: Array<{
    filename:    string
    content:     Buffer
    contentType: string
  }>
}

export interface SecurityContext {
  user:      any
  sessionId: string
  ip:        string
  userAgent: string
  endpoint:  string
  method:    string
}

// ============================================================================
// STORE INTERFACES
// ============================================================================

/**
 * QueriesStore — interface for components that need to interact with the
 * queries store without importing the full Zustand store type.
 *
 * ✅ Kept minimal — full type lives in use-queries-store.ts.
 *    This is for prop-drilling / context consumers only.
 */
export interface QueriesStore {
  queries:      QueryConfig[]
  isLoading:    boolean
  error:        string | null
  fetchQueries: (userId?: string, forceRefresh?: boolean) => Promise<void>
  createQuery:  (query: Omit<QueryConfig, "id" | "createdAt">) => Promise<QueryConfig>
  runQuery:     (queryId: string) => Promise<any>
  updateQuery:  (queryId: string, query: Partial<QueryConfig>) => Promise<void>
  deleteQuery:  (queryId: string) => Promise<void>
  syncWithWeaviate?: (userId: string) => Promise<void>
}