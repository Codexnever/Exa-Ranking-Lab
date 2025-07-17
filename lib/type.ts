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
  metadata: {
    totalResults: number
    responseTime: number
    exaVersion?: string
  }
}


export interface SearchResult {
  id: string
  title: string
  url: string
  snippet: string
  position: number
  score?: number
  publishDate?: string
  author?: string
  domain: string
  contentType: "article" | "blog" | "research" | "news" | "other"
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

export interface AnalyticsData {
  rankingStability: number
  volatilityIndex: number
  domainDiversity: number
  avgResponseTime: number
  newContentDiscovery: number
  querySuccessRate: number
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

export interface AuthContextType {
  user: Models.User<Models.Preferences> | null
  userId: string | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name: string) => Promise<void>
  logout: () => Promise<void>
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
}

export interface DriftTimelinePoint {
  timestamp: Date
  snapshotId: string
  previousSnapshotId: string | null
  driftScore: number
  rankChanges: RankChange[]
  newResults: number
  droppedResults: number
}

export interface RankChange {
  url: string
  title: string
  previousPosition: number
  currentPosition: number
  positionDelta: number
  similarityScore: number
}
