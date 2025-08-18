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
  userId: string // now required
  queryId: string
  timestamp: Date
  results: SearchResult[]
  queryType?: string;
  metadata: {
    totalResults: number
    responseTime: number
    exaVersion?: string
    executedAt?: string // ISO date string
    contentHash?: string // SHA-256 hash of results for deduplication
    executionType?: "manual" | "scheduled" // Track how the snapshot was created
    source?: "snapshots_api" | "query_run_api" // Track which API created this
  }
}


export interface SearchResult {
  id: string;
  title: string;
  url: string;
  snippet: string;
  score: number;
  publishedDate?: string;
  author?: string;
  domain: string;
  position: number;
  timestamp: Date;
  contentType: 'word' | 'pdf' | 'tweet' | 'github' | 'article' | 'news' | 'auto';
  
  // ✅ NEW: Content hash for drift detection
  contentHash: string; // SHA-256 hash of title + snippet + url
  
  highlights?: string[];
  summary?: string;
}

export interface RankingChange {
  url: string
  title: string
  previousPosition?: number
  currentPosition?: number
  change: "new" | "dropped" | "moved_up" | "moved_down" | "stable"
  changeValue: number
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

export interface AnalyticsData {
  timeRangeMs?: number;
  filteredSnapshots?: RankingSnapshot[];
  rankingTrendData?: any[];
  categoryDistribution?: any[];
  successRateByHour?: any[];
  performanceData?: any[];
  topPerformingQueries?: any[];
  queryPerformanceStats?: any[];
  rankingStability?: number;
  volatilityIndex?: number;
  domainDiversity?: number;
  avgResponseTime?: number;
  newContentDiscovery?: number;
  querySuccessRate?: number;
  trendSlope?: number;
  predictedPosition?: number;
  isAnomaly?: boolean;
  responseTimeStats?: ResponseTimeStats;
  executionFrequency?: ExecutionFrequency;
  dataFreshness?: DataFreshness;
  complexityMetrics?: ComplexityMetrics;
  avgComplexityScore?: number;
  isAppwriteSource?: boolean;
  dataSourceType?: 'appwrite' | 'weaviate';
  calculatedAt?: string;
}
export interface QueriesStore {
  queries: QueryConfig[]
  isLoading: boolean
  error: string | null
  fetchQueries: () => Promise<void>
  createQuery: (query: Omit<QueryConfig, "id" | "createdAt">) => Promise<QueryConfig>
  runQuery: (queryId: string) => Promise<any>
  updateQuery: (queryId: string, query: Partial<QueryConfig>) => Promise<void>
  deleteQuery: (queryId: string) => Promise<void>
}
export interface ContentCoherenceResult {
  overallCoherence: number;
  method: 'umass' | 'cv' | 'npmi';
  confidence: number;
  pValue: number;
  sampleSize: number;
  calculatedAt: number;
  score: number;
}

export interface SemanticStabilityResult {
  stabilityScore: number;
  trendConsistency: number;
  vocabularyDrift: number;
  confidenceInterval: { lower: number; upper: number };
  isSignificant: boolean;
  calculatedAt: number;
}
export interface StatisticalValidationResult {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  mape: number;
  confidenceLevel: number;
  lastValidated: number;
}

export interface DataQualityResult {
  completeness: number;
  accuracy: number;
  consistency: number;
  freshness: number;
  validity: number;
  anomalyCount: number;
  assessedAt: number;
}

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
export interface TrendPoint {
  date: string;
  avgPosition: number;
  volatility: number;
  count: number;
  predictedPosition: number;
  isAnomaly: boolean;
  anomalyType?: 'high_volatility' | 'sudden_drop' | 'sudden_rise' | 'position_spike';
  anomalyScore?: number;
  volatilityThreshold?: number;
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

// Add these interfaces to your existing types
export interface EnhancedAnalyticsData extends AnalyticsData {
  contentCoherence?: ContentCoherenceResult; // undefined instead of null
  semanticStability?: SemanticStabilityResult; // undefined instead of null
  statisticalValidation?: StatisticalValidationResult;
  dataQuality?: DataQualityResult;
  semanticInsights?: SemanticInsights;
  enhancedMetrics?: EnhancedMetrics;
  isWeaviateSource?: boolean;
  error?: string;
}


// Add missing interfaces
export interface ResponseTimeStats {
  min: number;
  max: number;
  mean: number;
  median: number;
  stdDev: number;
  percentile95: number;
}

export interface ExecutionFrequency {
  frequency: number;
  efficiency: number;
  pattern: string;
  avgInterval?: number; // FIXED: Make optional since it's sometimes missing
}


export interface DataFreshness {
  avgAgeHours: number;
  maxAgeHours: number;
  freshnessScore: number;
  stalenessIndicator: string;
}

export interface ComplexityMetrics {
  avgComplexityScore: number;
  complexityDistribution: any;
  highComplexityQueries: number;
}

// Import these from your analytics-calculations file
export interface ContentCoherenceResult {
  overallCoherence: number;
  method: 'umass' | 'cv' | 'npmi';
  confidence: number;
  pValue: number;
  sampleSize: number;
  calculatedAt: number;
}

export interface SemanticStabilityResult {
  stabilityScore: number;
  trendConsistency: number;
  vocabularyDrift: number;
  confidenceInterval: { lower: number; upper: number };
  isSignificant: boolean;
  calculatedAt: number;
}

export interface StatisticalValidationResult {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  mape: number;
  confidenceLevel: number;
  lastValidated: number;
}

export interface DataQualityResult {
  completeness: number;
  accuracy: number;
  consistency: number;
  freshness: number;
  validity: number;
  anomalyCount: number;
  assessedAt: number;
}

// Move these from enhanced-analytics-service to types
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
    discoveryRate: number;
    stabilityTrend: any[];
    contentTurnover: number;
  };
  weaviateMetrics: any;
}

export interface EnhancedMetrics {
  semanticStability: SemanticStabilityResult | number;
  contentCoherence: ContentCoherenceResult | number;
  diversityIndex: number;
  statisticalValidation?: StatisticalValidationResult;
  dataQuality?: DataQualityResult;
  performanceInsights?: {
    anomalyDetectionAccuracy: number;
    clusteringQuality: number;
    semanticSearchEfficiency: number;
    vectorCacheHitRate: number;
  };
}
