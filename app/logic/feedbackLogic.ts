// app/logic/feedbackLogic.ts
import { useState, useMemo, useCallback } from "react"
import { toast } from "sonner"
import { useAuth } from "@/lib/contexts/auth-context"
import type { RankingSnapshot } from "@/lib/type"

interface FeedbackData {
  resultUrl: string
  feedbackType: "relevance" | "quality" | "freshness" | "authority"
  expectedPosition: string
  rating: number
  comment: string
}

const initialFeedback: FeedbackData = {
  resultUrl: "",
  feedbackType: "relevance",
  expectedPosition: "",
  rating: 0,
  comment: "",
}

export function useFeedbackLogic(snapshots: RankingSnapshot[]) {
  const { user } = useAuth()
  
  const [selectedQuery, setSelectedQuery] = useState("")
  const [selectedSnapshot, setSelectedSnapshot] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<FeedbackData>(initialFeedback)

  // ✅ Filter snapshots by selected query with memoization
  const filteredSnapshots = useMemo(() => {
    if (!selectedQuery) return []
    return snapshots
      .filter(snapshot => snapshot.queryId === selectedQuery)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  }, [snapshots, selectedQuery])

  // ✅ Get selected snapshot data with memoization
  const selectedSnapshotData = useMemo(() => {
    if (!selectedSnapshot) return null
    return filteredSnapshots.find(snapshot => snapshot.id === selectedSnapshot)
  }, [filteredSnapshots, selectedSnapshot])

  // ✅ Reset form function
  const resetForm = useCallback(() => {
    setFeedback(initialFeedback)
    setSelectedSnapshot("")
    setSelectedQuery("")
  }, [])

  // ✅ Enhanced query change handler
  const handleQueryChange = useCallback((queryId: string) => {
    setSelectedQuery(queryId)
    setSelectedSnapshot("")
    setFeedback(prev => ({ ...prev, resultUrl: "" }))
  }, [])

  // ✅ Enhanced submit feedback with validation
  const handleSubmitFeedback = useCallback(async () => {
    if (!user) {
      toast.error("Please log in to submit feedback")
      return
    }

    // Enhanced validation
    const errors: string[] = []
    if (!selectedSnapshot) errors.push("Please select a snapshot")
    if (!feedback.resultUrl.trim()) errors.push("Please provide a result URL")
    if (feedback.rating === 0) errors.push("Please provide a rating")
    if (feedback.expectedPosition && (isNaN(Number(feedback.expectedPosition)) || Number(feedback.expectedPosition) < 1)) {
      errors.push("Expected position must be a positive number")
    }

    if (errors.length > 0) {
      toast.error(`Validation failed: ${errors.join(", ")}`)
      return
    }

    setIsSubmitting(true)
    
    try {
      const feedbackPayload = {
        snapshotId: selectedSnapshot,
        queryId: selectedQuery,
        resultUrl: feedback.resultUrl.trim(),
        feedbackType: feedback.feedbackType,
        expectedPosition: feedback.expectedPosition ? parseInt(feedback.expectedPosition) : null,
        rating: feedback.rating,
        comment: feedback.comment.trim(),
        userId: user.$id,
        timestamp: new Date().toISOString(),
      }

      console.log('[Feedback] Submitting feedback:', feedbackPayload)

      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(feedbackPayload),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `HTTP ${response.status}: Failed to submit feedback`)
      }

      const result = await response.json()
      console.log('[Feedback] Feedback submitted successfully:', result)

      // Reset form after successful submission
      resetForm()
      
      toast.success(
        `Feedback submitted successfully! Thank you for your input.`,
        { duration: 4000 }
      )

    } catch (error) {
      console.error('[Feedback] Failed to submit feedback:', error)
      const message = error instanceof Error ? error.message : "Failed to submit feedback"
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }, [user, selectedSnapshot, selectedQuery, feedback, resetForm])

  return {
    selectedQuery,
    setSelectedQuery: handleQueryChange,
    selectedSnapshot,
    setSelectedSnapshot,
    feedback,
    setFeedback,
    filteredSnapshots,
    selectedSnapshotData,
    handleSubmitFeedback,
    isSubmitting,
    resetForm,
  }
}
