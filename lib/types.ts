export interface QueryConfig {
  id: string
  name: string
  query: string
  category: "web" | "news" | "research" | "code"
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
  userId: string // now required
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
