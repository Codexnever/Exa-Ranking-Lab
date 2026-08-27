import type { RelevanceGrade } from "@/types/evaluation";
import type { StageDiagnosisResult } from "@/types/evaluation-stage-diagnosis";
import { getDocumentIdentity } from "@/utils/canonicalize-document-url";
import { evaluationStageTraceService, type EvaluationStageTraceService } from "./evaluation-stage-trace-service";
import { evaluationDatasetService, type EvaluationDatasetService } from "./evaluation-dataset-service";
import { relevanceJudgmentService, type RelevanceJudgmentService } from "./relevance-judgment-service";
import { EvaluationError, invalid } from "./evaluation-errors";
import { diagnoseTrace } from "./evaluation-stage-diagnosis-calculations";

export class EvaluationStageDiagnosisService {
  constructor(
    private readonly traces: EvaluationStageTraceService = evaluationStageTraceService,
    private readonly datasets: EvaluationDatasetService = evaluationDatasetService,
    private readonly judgments: RelevanceJudgmentService = relevanceJudgmentService
  ) {}

  async diagnose(userId: string, traceId: string): Promise<StageDiagnosisResult> {
    if (!userId?.trim() || !traceId?.trim()) {
      throw invalid("Authenticated owner and trace ID are required");
    }

    const trace = await this.traces.get(userId, traceId);

    if (!trace.datasetVersionId || !trace.evaluationQueryId) {
      throw new EvaluationError(
        "INVALID_STATE",
        "Trace is not linked to an evaluation benchmark and cannot produce authoritative relevance diagnosis",
        409
      );
    }

    const detail = await this.datasets.getDatasetDetail(userId, trace.datasetVersionId);
    const query = detail.queries.find((item) => item.id === trace.evaluationQueryId);

    if (!query || query.sourceQueryId !== trace.sourceQueryId) {
      throw new EvaluationError("INVALID_STATE", "Stage diagnosis evaluation linkage is inconsistent", 409);
    }

    const accepted = await this.judgments.getAcceptedJudgmentsForEvaluationQuery(
      userId,
      trace.datasetVersionId,
      trace.evaluationQueryId
    );
    const truth = new Map<string, RelevanceGrade>();

    for (const judgment of accepted) {
      if (
        judgment.status !== "accepted" ||
        judgment.datasetVersionId !== trace.datasetVersionId ||
        judgment.evaluationQueryId !== trace.evaluationQueryId ||
        judgment.sourceQueryId !== trace.sourceQueryId ||
        judgment.relevanceGrade === null
      ) {
        throw new EvaluationError("INVALID_STATE", "Accepted judgment provenance is malformed", 409);
      }

      const identity = getDocumentIdentity(judgment.canonicalUrl);

      if (
        identity.documentKey !== judgment.documentKey ||
        identity.canonicalUrl !== judgment.canonicalUrl ||
        truth.has(judgment.documentKey)
      ) {
        throw new EvaluationError("INVALID_STATE", "Accepted judgment canonical identity is malformed", 409);
      }

      truth.set(judgment.documentKey, judgment.relevanceGrade);
    }

    return diagnoseTrace(trace, truth);
  }
}

export const evaluationStageDiagnosisService = new EvaluationStageDiagnosisService();