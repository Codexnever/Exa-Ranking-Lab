import {
  WeaviateService,
  type SearchHit,
  type SemanticSearchScope,
} from "@/app/services/weaviate/weaviate-service";
import {
  evaluationDatasetService,
  type EvaluationDatasetService,
} from "./evaluation-dataset-service";
import {
  relevanceJudgmentService,
  type RelevanceJudgmentService,
} from "./relevance-judgment-service";
import { EvaluationError, invalid } from "./evaluation-errors";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

interface BenchmarkSearchProvider {
  semanticSearch(
    query: string,
    userId: string,
    limit: number,
    certainty: number,
    category: undefined,
    scope: SemanticSearchScope,
  ): Promise<SearchHit[]>;
}

export interface EvaluationWeaviateBenchmarkResult {
  datasetVersionId: string;
  evaluationQueryId: string;
  sourceQueryId: string;
  sourceSnapshotIds: string[];
  results: SearchHit[];
  count: number;
}

export class EvaluationWeaviateBenchmarkService {
  constructor(
    private readonly datasets: EvaluationDatasetService = evaluationDatasetService,
    private readonly judgments: RelevanceJudgmentService = relevanceJudgmentService,
    private readonly weaviate: BenchmarkSearchProvider = new WeaviateService(),
  ) {}

  async search(
    userId: string,
    datasetVersionId: string,
    evaluationQueryId: string,
    requestedLimit = DEFAULT_LIMIT,
  ): Promise<EvaluationWeaviateBenchmarkResult> {
    if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > MAX_LIMIT) {
      throw invalid(`limit must be an integer between 1 and ${MAX_LIMIT}`);
    }

    const detail = await this.datasets.getDatasetDetail(userId, datasetVersionId);
    if (detail.dataset.status !== "frozen") {
      throw new EvaluationError(
        "DATASET_NOT_FROZEN",
        "Weaviate benchmark retrieval requires a frozen dataset",
        409,
      );
    }
    const query = detail.queries.find(item => item.id === evaluationQueryId);
    if (!query) {
      throw new EvaluationError(
        "NOT_FOUND",
        "Benchmark query is not in the frozen dataset",
        404,
      );
    }

    const accepted = await this.judgments.getAcceptedJudgmentsForEvaluationQuery(
      userId,
      datasetVersionId,
      evaluationQueryId,
    );
    if (
      accepted.some(
        judgment =>
          judgment.datasetVersionId !== datasetVersionId ||
          judgment.evaluationQueryId !== evaluationQueryId ||
          judgment.sourceQueryId !== query.sourceQueryId,
      )
    ) {
      throw new EvaluationError(
        "INVALID_STATE",
        "Frozen judgment provenance is inconsistent with the benchmark query",
        409,
      );
    }

    // A frozen evaluation query has no single snapshot pointer. Its accepted
    // judgments preserve the immutable source snapshots used to establish
    // benchmark truth, so their union is the narrowest reproducible corpus
    // represented by the current Weaviate schema.
    const sourceSnapshotIds = [
      ...new Set(accepted.flatMap(judgment => judgment.sourceSnapshotIds)),
    ].sort();
    if (!sourceSnapshotIds.length) {
      throw new EvaluationError(
        "INVALID_STATE",
        "Frozen benchmark judgments have no source snapshot provenance",
        409,
      );
    }

    const results = await this.weaviate.semanticSearch(
      query.queryText,
      userId,
      requestedLimit,
      0,
      undefined,
      { sourceQueryId: query.sourceQueryId, snapshotIds: sourceSnapshotIds },
    );
    return {
      datasetVersionId,
      evaluationQueryId,
      sourceQueryId: query.sourceQueryId,
      sourceSnapshotIds,
      results,
      count: results.length,
    };
  }
}

export const evaluationWeaviateBenchmarkService = new EvaluationWeaviateBenchmarkService();
