// pages/feedback.tsx
"use client"

import { useFeedbackLogic } from "@/app/logic/feedbackLogic"
import { useQueriesStore } from "@/app/store"
import { useSnapshotsStore } from "@/app/store"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Star, MessageSquare, ThumbsUp, Loader2, RefreshCw, AlertCircle } from "lucide-react"
import type { RankingSnapshot, SearchResult, QueryConfig } from "@/lib/type"
import { useAuth } from "@/lib/contexts/auth-context"
import { useEffect, useState, useMemo, useCallback } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"

// ✅ Enhanced TypeScript interfaces
interface FeedbackFormData {
  resultUrl: string
  feedbackType: "relevance" | "quality" | "freshness" | "authority"
  expectedPosition: string
  rating: number
  comment: string
}

interface FeedbackStats {
  totalFeedback: number
  averageRating: number
  topIssues: string[]
  recentSubmissions: number
}

const formatDate = (dateString: string | Date) => {
  const date = typeof dateString === 'string' ? new Date(dateString) : dateString
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

const FEEDBACK_TYPES = [
  { value: "relevance", label: "Relevance", description: "How well the result matches the query" },
  { value: "quality", label: "Quality", description: "Overall content and information quality" },
  { value: "freshness", label: "Freshness", description: "How recent and up-to-date the content is" },
  { value: "authority", label: "Authority", description: "Credibility and trustworthiness of the source" },
] as const

export default function Feedback() {
  const { user } = useAuth()
  const [isInitialized, setIsInitialized] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ✅ Enhanced store selectors with error handling
  const queries = useQueriesStore(state => state.queries) || []
  const fetchQueries = useQueriesStore(state => state.fetchQueries)
  const queriesLoading = useQueriesStore(state => state.isLoading)
  
  const allSnapshots = useSnapshotsStore(state => state.allSnapshots) || []
  const fetchAllSnapshots = useSnapshotsStore(state => state.fetchAllSnapshots)
  const isLoadingSnapshots = useSnapshotsStore(state => state.isLoadingAnalytics)

  // ✅ Memoized user data filtering for better performance
  const { userQueries, userSnapshots } = useMemo(() => {
    if (!user) return { userQueries: [], userSnapshots: [] }
    
    return {
      userQueries: queries.filter(q => q.userId === user.$id),
      userSnapshots: allSnapshots.filter(s => s.userId === user.$id)
    }
  }, [queries, allSnapshots, user])

  // ✅ Enhanced feedback logic with proper error handling
  const {
    selectedQuery,
    setSelectedQuery,
    selectedSnapshot,
    setSelectedSnapshot,
    feedback,
    setFeedback,
    filteredSnapshots,
    selectedSnapshotData,
    handleSubmitFeedback,
    isSubmitting,
    resetForm,
  } = useFeedbackLogic(userSnapshots)

  // ✅ Enhanced data initialization with retry logic
  const initializeData = useCallback(async (retryCount = 0) => {
    if (!user?.$id) return

    try {
      setError(null)
      await Promise.all([
        fetchQueries(user.$id),
        fetchAllSnapshots(user.$id)
      ])
      setIsInitialized(true)
    } catch (error) {
      console.error('[Feedback] Failed to initialize data:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to load data'
      setError(errorMessage)
      
      // Retry logic with exponential backoff
      if (retryCount < 3) {
        const delay = Math.pow(2, retryCount) * 1000 // 1s, 2s, 4s
        setTimeout(() => initializeData(retryCount + 1), delay)
      }
    }
  }, [user?.$id, fetchQueries, fetchAllSnapshots])

  useEffect(() => {
    if (user?.$id && !isInitialized) {
      initializeData()
    }
  }, [user?.$id, isInitialized, initializeData])

  // ✅ Enhanced validation logic
  const validationErrors = useMemo(() => {
    const errors: string[] = []
    
    if (!selectedQuery) errors.push("Please select a query")
    if (!selectedSnapshot) errors.push("Please select a snapshot")
    if (!feedback.resultUrl.trim()) errors.push("Please enter or select a result URL")
    if (feedback.rating === 0) errors.push("Please provide a rating")
    if (feedback.expectedPosition && (isNaN(Number(feedback.expectedPosition)) || Number(feedback.expectedPosition) < 1)) {
      errors.push("Expected position must be a positive number")
    }
    
    return errors
  }, [selectedQuery, selectedSnapshot, feedback])

  const isFormValid = validationErrors.length === 0

  // ✅ Enhanced refresh data function
  const refreshData = useCallback(async () => {
    if (!user?.$id) return
    
    try {
      await Promise.all([
        fetchQueries(user.$id),
        fetchAllSnapshots(user.$id)
      ])
    } catch (error) {
      console.error('Failed to refresh data:', error)
    }
  }, [user?.$id, fetchQueries, fetchAllSnapshots])

  // ✅ Loading state computation
  const isLoading = queriesLoading || isLoadingSnapshots || !isInitialized

  // ✅ Enhanced loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">Loading feedback data...</p>
          <p className="text-xs text-gray-500 mt-1">Fetching queries and snapshots</p>
          {error && (
            <div className="mt-4">
              <Alert variant="destructive" className="max-w-md mx-auto">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => initializeData()} 
                className="mt-2"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ✅ Authentication guard
  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="w-96 p-6">
          <div className="text-center">
            <MessageSquare className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Authentication Required</h3>
            <p className="text-gray-500">Please log in to provide feedback on search results.</p>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ✅ Enhanced header with refresh button */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Feedback & Annotations</h1>
          <p className="text-gray-600 mt-1">Provide feedback on search result quality and relevance</p>
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
            <span>{userQueries.length} queries</span>
            <span>{userSnapshots.length} snapshots available</span>
            {selectedSnapshotData && (
              <span>{selectedSnapshotData.results.length} results in selected snapshot</span>
            )}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={refreshData}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh Data
        </Button>
      </div>

      {/* ✅ Error alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ✅ Enhanced Feedback Form */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-gray-900 flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              Submit Feedback
            </CardTitle>
            <CardDescription>Rate and comment on search result quality</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-gray-700">Query *</label>
                <Select value={selectedQuery} onValueChange={setSelectedQuery}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a query" />
                  </SelectTrigger>
                  <SelectContent>
                    {userQueries.length === 0 ? (
                      <SelectItem value="no-queries" disabled>No queries available</SelectItem>
                    ) : (
                      userQueries.map((query: QueryConfig) => (
                        <SelectItem key={query.id} value={query.id}>
                          <div className="flex flex-col">
                            <span>{query.name || query.query}</span>
                            <span className="text-xs text-gray-500">{query.category}</span>
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Snapshot *</label>
                <Select value={selectedSnapshot} onValueChange={setSelectedSnapshot} disabled={!selectedQuery}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a snapshot" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredSnapshots.length === 0 ? (
                      <SelectItem value="no-snapshots" disabled>
                        {selectedQuery ? "No snapshots for this query" : "Select a query first"}
                      </SelectItem>
                    ) : (
                      filteredSnapshots.map((snapshot: RankingSnapshot) => (
                        <SelectItem key={snapshot.id} value={snapshot.id}>
                          <div className="flex flex-col">
                            <span>{formatDate(snapshot.timestamp)} - {snapshot.results.length} results</span>
                            <span className="text-xs text-gray-500">
                              Response: {snapshot.metadata.responseTime}ms
                            </span>
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Result URL *</label>
              <Input
                placeholder="https://example.com/article"
                value={feedback.resultUrl}
                onChange={(e) => setFeedback({ ...feedback, resultUrl: e.target.value })}
                className={validationErrors.includes("Please enter or select a result URL") ? "border-red-300" : ""}
              />
              <p className="text-xs text-gray-500 mt-1">
                Click on a result below to auto-fill, or enter manually
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-gray-700">Feedback Type</label>
                <Select
                  value={feedback.feedbackType}
                  onValueChange={(value: FeedbackFormData['feedbackType']) => 
                    setFeedback({ ...feedback, feedbackType: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FEEDBACK_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        <div className="flex flex-col">
                          <span>{type.label}</span>
                          <span className="text-xs text-gray-500">{type.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Expected Position</label>
                <Input
                  type="number"
                  placeholder="e.g., 3"
                  min="1"
                  value={feedback.expectedPosition}
                  onChange={(e) => setFeedback({ ...feedback, expectedPosition: e.target.value })}
                  className={validationErrors.some(e => e.includes("Expected position")) ? "border-red-300" : ""}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Where you think this result should rank
                </p>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Rating *</label>
              <div className="flex items-center gap-2 mt-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setFeedback({ ...feedback, rating: star })}
                    className={`p-1 rounded transition-colors ${
                      star <= feedback.rating ? "text-yellow-500" : "text-gray-300 hover:text-yellow-400"
                    }`}
                    type="button"
                    title={`${star} star${star > 1 ? 's' : ''}`}
                  >
                    <Star className="w-6 h-6 fill-current" />
                  </button>
                ))}
                <span className="text-sm text-gray-600 ml-2">{feedback.rating}/5 stars</span>
              </div>
              {feedback.rating > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  {feedback.rating <= 2 ? "Poor quality" : 
                   feedback.rating === 3 ? "Average quality" : 
                   feedback.rating === 4 ? "Good quality" : "Excellent quality"}
                </p>
              )}
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Comments</label>
              <Textarea
                placeholder="Provide detailed feedback about this result..."
                value={feedback.comment}
                onChange={(e) => setFeedback({ ...feedback, comment: e.target.value })}
                rows={3}
                maxLength={1000}
              />
              <p className="text-xs text-gray-500 mt-1">
                {feedback.comment.length}/1000 characters
              </p>
            </div>

            {/* ✅ Validation errors display */}
            {validationErrors.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <ul className="list-disc list-inside space-y-1">
                    {validationErrors.map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            <div className="flex gap-2">
              <Button 
                onClick={handleSubmitFeedback} 
                className="flex-1"
                disabled={isSubmitting || !isFormValid}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Submit Feedback"
                )}
              </Button>
              
              <Button 
                variant="outline" 
                onClick={resetForm}
                disabled={isSubmitting}
              >
                Reset
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ✅ Enhanced Results Preview */}
        <Card>
          <CardHeader>
            <CardTitle className="text-gray-900">Results Preview</CardTitle>
            <CardDescription>
              {selectedSnapshotData
                ? `${selectedSnapshotData.results.length} results`
                : "Select a snapshot to view results"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selectedSnapshotData ? (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {selectedSnapshotData.results.map((result: SearchResult, index: number) => (
                  <div
                    key={result.id || index}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      feedback.resultUrl === result.url
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                    onClick={() => setFeedback({ ...feedback, resultUrl: result.url })}
                    title="Click to select this result"
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-xs font-medium text-gray-500 mt-1">#{result.position}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate" title={result.title}>
                          {result.title}
                        </p>
                        <p className="text-xs text-blue-600 truncate" title={result.url}>
                          {result.url}
                        </p>
                        <p className="text-xs text-gray-600 mt-1 line-clamp-2" title={result.snippet}>
                          {result.snippet}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <MessageSquare className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p>Select a query and snapshot to view results</p>
                <p className="text-xs text-gray-400 mt-1">
                  Choose from {userQueries.length} available queries
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ✅ Enhanced Feedback Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-gray-900">Feedback Summary</CardTitle>
          <CardDescription>Overview of feedback trends and insights</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <ThumbsUp className="w-12 h-12 mb-4 text-gray-300" />
            <p className="text-lg font-semibold mb-2">No feedback data yet</p>
            <p className="text-sm text-gray-500 mb-4 text-center max-w-md">
              Once you start submitting feedback, you'll see summary statistics and insights here. 
              Use the form above to rate search results and track quality trends.
            </p>
            <div className="flex gap-2 mt-2">
              <Badge variant="outline" className="text-xs">
                Get started by submitting feedback
              </Badge>
              <Badge variant="outline" className="text-xs">
                {userSnapshots.length} snapshots available
              </Badge>
              <Badge variant="outline" className="text-xs">
                {userQueries.length} queries ready
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ✅ Empty state when no data */}
      {userQueries.length === 0 && userSnapshots.length === 0 && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <MessageSquare className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Data Available</h3>
              <p className="text-gray-500 mb-4">
                You need queries and snapshots before you can provide feedback.
              </p>
              <div className="flex justify-center gap-2">
                <Button variant="outline" onClick={() => window.location.href = '/query-builder'}>
                  Create Queries
                </Button>
                <Button variant="outline" onClick={() => window.location.href = '/snapshots'}>
                  View Snapshots
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
