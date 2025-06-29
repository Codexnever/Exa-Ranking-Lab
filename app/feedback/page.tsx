"use client"

import { useFeedbackLogic } from "@/logic/feedbackLogic"
import { useQueries } from "@/hooks/use-queries"
import { useSnapshots } from "@/hooks/use-snapshots"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Star, MessageSquare, ThumbsUp } from "lucide-react"
import type { RankingSnapshot, SearchResult } from "@/lib/types"
import { useAuth } from "@/contexts/auth-context"

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function Feedback() {
  const { user } = useAuth()

  const { queries } = useQueries()
  const { snapshots } = useSnapshots()
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
  } = useFeedbackLogic(queries, snapshots)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Feedback & Annotations</h1>
          <p className="text-gray-600 mt-1">Provide feedback on search result quality and relevance</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Feedback Form */}
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
                <label className="text-sm font-medium text-gray-700">Query</label>
                <Select value={selectedQuery} onValueChange={setSelectedQuery}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a query" />
                  </SelectTrigger>
                  <SelectContent>
                    {queries.map((query) => (
                      <SelectItem key={query.id} value={query.id}>
                        {query.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Snapshot</label>
                <Select value={selectedSnapshot} onValueChange={setSelectedSnapshot} disabled={!selectedQuery}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a snapshot" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredSnapshots.map((snapshot: RankingSnapshot) => (
                      <SelectItem key={snapshot.id} value={snapshot.id}>
                        {formatDate(snapshot.timestamp.toString())} - {snapshot.results.length} results
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Result URL</label>
              <Input
                placeholder="https://example.com/article"
                value={feedback.resultUrl}
                onChange={(e) => setFeedback({ ...feedback, resultUrl: e.target.value })}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-gray-700">Feedback Type</label>
                <Select
                  value={feedback.feedbackType}
                  onValueChange={(value) => setFeedback({ ...feedback, feedbackType: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="relevance">Relevance</SelectItem>
                    <SelectItem value="quality">Quality</SelectItem>
                    <SelectItem value="freshness">Freshness</SelectItem>
                    <SelectItem value="authority">Authority</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Expected Position</label>
                <Input
                  type="number"
                  placeholder="e.g., 3"
                  value={feedback.expectedPosition}
                  onChange={(e) => setFeedback({ ...feedback, expectedPosition: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Rating</label>
              <div className="flex items-center gap-2 mt-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setFeedback({ ...feedback, rating: star })}
                    className={`p-1 rounded ${star <= feedback.rating ? "text-yellow-500" : "text-gray-300"}`}
                  >
                    <Star className="w-6 h-6 fill-current" />
                  </button>
                ))}
                <span className="text-sm text-gray-600 ml-2">{feedback.rating}/5 stars</span>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Comments</label>
              <Textarea
                placeholder="Provide detailed feedback about this result..."
                value={feedback.comment}
                onChange={(e) => setFeedback({ ...feedback, comment: e.target.value })}
                rows={3}
              />
            </div>

            <Button onClick={handleSubmitFeedback} className="w-full">
              Submit Feedback
            </Button>
          </CardContent>
        </Card>

        {/* Results Preview */}
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
                    key={result.id}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      feedback.resultUrl === result.url
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                    onClick={() => setFeedback({ ...feedback, resultUrl: result.url })}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-xs font-medium text-gray-500 mt-1">#{result.position}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{result.title}</p>
                        <p className="text-xs text-gray-500 truncate">{result.url}</p>
                        <p className="text-xs text-gray-600 mt-1 line-clamp-2">{result.snippet}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <MessageSquare className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p>Select a query and snapshot to view results</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Feedback Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-gray-900">Feedback Summary</CardTitle>
          <CardDescription>Overview of feedback trends and insights</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-3">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">4.2</div>
              <p className="text-sm text-gray-600">Average Rating</p>
              <div className="flex justify-center mt-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`w-4 h-4 ${star <= 4 ? "text-yellow-500 fill-current" : "text-gray-300"}`}
                  />
                ))}
              </div>
            </div>

            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">127</div>
              <p className="text-sm text-gray-600">Total Feedback</p>
              <div className="flex justify-center gap-2 mt-2">
                <ThumbsUp className="w-4 h-4 text-emerald-500" />
                <span className="text-xs text-gray-600">89% positive</span>
              </div>
            </div>

            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">23</div>
              <p className="text-sm text-gray-600">Improvement Suggestions</p>
              <div className="flex justify-center gap-2 mt-2">
                <Badge variant="outline" className="text-xs">
                  Position Changes
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
