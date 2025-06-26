import { QueryService } from "../services/query-service"
import { SnapshotService } from "../services/snapshot-service"
import { FeedbackService } from "../services/feedback-service"
import { AnalyticsService } from "../services/analytics-service"
import { AccessLogService } from "../services/access-log-service"

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
