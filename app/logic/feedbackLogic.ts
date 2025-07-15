import { useState, useMemo } from "react"
import { toast } from "sonner"
import type { RankingSnapshot } from "@/lib/type"

export function useFeedbackLogic(
  snapshots: RankingSnapshot[]
) {
  const [selectedQuery, setSelectedQuery] = useState("")
  const [selectedSnapshot, setSelectedSnapshot] = useState("")
  const [feedback, setFeedback] = useState({
    resultUrl: "",
    feedbackType: "relevance",
    rating: 5,
    comment: "",
    expectedPosition: "",
  })

  const filteredSnapshots = useMemo(
    () => snapshots.filter((s: RankingSnapshot) => !selectedQuery || s.queryId === selectedQuery),
    [snapshots, selectedQuery]
  )
  const selectedSnapshotData = useMemo(
    () => snapshots.find((s: RankingSnapshot) => s.id === selectedSnapshot),
    [snapshots, selectedSnapshot]
  )

  const handleSubmitFeedback = async () => {
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          queryId: selectedQuery,
          snapshotId: selectedSnapshot,
          ...feedback,
          expectedPosition: feedback.expectedPosition ? Number.parseInt(feedback.expectedPosition) : undefined,
        }),
      })
      if (!response.ok) throw new Error("Failed to submit feedback")
      toast.success("Feedback submitted successfully!")
      setFeedback({
        resultUrl: "",
        feedbackType: "relevance",
        rating: 5,
        comment: "",
        expectedPosition: "",
      })
    } catch (error) {
      toast.error("Failed to submit feedback")
    }
  }

  return {
    selectedQuery, setSelectedQuery,
    selectedSnapshot, setSelectedSnapshot,
    feedback, setFeedback,
    filteredSnapshots, selectedSnapshotData,
    handleSubmitFeedback
  }
}
