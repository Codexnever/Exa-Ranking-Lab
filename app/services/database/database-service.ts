import { QueryService } from "../query/query-service"
import { SnapshotService } from "../query/snapshot-service"
import { FeedbackService } from "../other/feedback-service"
import { AnalyticsService } from "../appwrite/analytics-service"
import { AccessLogService } from "../other/access-log-service"

// Compose the modular services into a single DatabaseService
class DatabaseService {
  public queryService: QueryService
  public snapshotService: SnapshotService
  public feedbackService: FeedbackService
  public analyticsService: AnalyticsService
  public accessLogService: AccessLogService

  constructor() {
    const isLocal = false
    this.queryService = new QueryService(isLocal)
    this.snapshotService = new SnapshotService(isLocal)
    this.feedbackService = new FeedbackService(isLocal)
    this.analyticsService = new AnalyticsService(isLocal)
    this.accessLogService = new AccessLogService(isLocal)
  }
}

export const databaseService = new DatabaseService()
