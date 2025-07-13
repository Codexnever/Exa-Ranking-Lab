// FeedbackService handles all feedback-related operations
import { databases, DATABASE_ID, COLLECTIONS } from "@/lib/server/appwrite"
import { ID, Query } from "appwrite"
import type { UserFeedback } from "@/lib/type"
import { loadFromStorage, saveToStorage, transformFeedbackDocument } from "./db-utils"

export class FeedbackService {
  private isLocal: boolean
  constructor(isLocal: boolean) {
    this.isLocal = isLocal
  }

  async createFeedback(feedback: Omit<UserFeedback, "id" | "createdAt">): Promise<UserFeedback> {
    try {
      const id = ID.unique()
      if (this.isLocal) {
        const newFeedback: UserFeedback = {
          ...feedback,
          id,
          createdAt: new Date(),
        }
        const feedbacks = loadFromStorage<UserFeedback>("feedback")
        feedbacks.push(newFeedback)
        saveToStorage("feedback", feedbacks)
        return newFeedback
      }
      const document = await databases.createDocument(DATABASE_ID, COLLECTIONS.FEEDBACK, id, {
        ...feedback,
        tags: JSON.stringify(feedback.tags || []),
        createdAt: new Date().toISOString(),
      })
      return transformFeedbackDocument(document, this.isLocal)
    } catch (error) {
      console.error("Failed to create feedback:", error)
      throw new Error("Failed to create feedback")
    }
  }

  async getFeedback(queryId?: string): Promise<UserFeedback[]> {
    try {
      if (this.isLocal) {
        const feedback = loadFromStorage<UserFeedback>("feedback")
        return queryId ? feedback.filter((f) => f.queryId === queryId) : feedback
      }
      const queries = queryId ? [Query.equal("queryId", queryId)] : []
      const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.FEEDBACK, queries)
      return response.documents.map((doc) => transformFeedbackDocument(doc, this.isLocal))
    } catch (error) {
      console.error("Failed to fetch feedback:", error)
      return []
    }
  }
}
