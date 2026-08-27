import { databases, DATABASE_ID, COLLECTIONS } from "@/app/server/appwrite/appwrite-server";
import { transformSnapshotDocument } from "@/utils/db-utils";
import { calculateDriftScore } from "@/app/logic/driftAnalyzer";
import { DETECTOR_DEFAULTS } from "@/lib/services/algorithm-detector/constants";
import type { RankingSnapshot } from "@/types/type";
import type { DriftEvidenceSummary, EvaluationRunComparison } from "@/types/evaluation-comparison";
import { EVALUATION_COMPARISON_VERSION } from "@/types/evaluation-comparison";
import { EvaluationError, invalid } from "./evaluation-errors";
import { evaluationRunService, type EvaluationRunService } from "./evaluation-run-service";
import {
  aggregateComparisons,
  cohort,
  compareQuery,
  compatibility,
  primaryMetric,
} from "./evaluation-comparison-calculations";
import { interpretation, QUALITY_COMPARISON_POLICY } from "./comparison-policy";
import { aggregateDocumentEvidence, analyzeJudgedDocumentMovement } from "./evaluation-document-movement";
import type { QueryDocumentMovementEvidence } from "@/types/evaluation-document-movement";
import { relevanceJudgmentService, type RelevanceJudgmentService } from "./relevance-judgment-service";
import { evaluationDatasetService, type EvaluationDatasetService } from "./evaluation-dataset-service";
import { CANONICALIZATION_VERSION } from "@/utils/canonicalize-url-policy";

export interface ComparisonDriftAdapter {
  compare(
    evaluationQueryId: string,
    beforeSnapshotId: string,
    afterSnapshotId: string
  ): Promise<DriftEvidenceSummary | null>;
}

class AppwriteComparisonDriftAdapter implements ComparisonDriftAdapter {
  private async snapshot(id: string): Promise<RankingSnapshot> {
    try {
      return transformSnapshotDocument(
        await databases.getDocument(DATABASE_ID, COLLECTIONS.SNAPSHOTS, id),
        false
      );
    } catch {
      throw new EvaluationError("NOT_FOUND", "Comparison snapshot not found", 404);
    }
  }

  async compare(evaluationQueryId: string, beforeSnapshotId: string, afterSnapshotId: string) {
    const [before, after] = await Promise.all([
      this.snapshot(beforeSnapshotId),
      this.snapshot(afterSnapshotId),
    ]);

    const result = await calculateDriftScore(before, after);
    const threshold = DETECTOR_DEFAULTS.PER_QUERY_DRIFT_THRESHOLD;

    return {
      evaluationQueryId,
      beforeSnapshotId,
      afterSnapshotId,
      driftScore: result.driftScore,
      threshold,
      substantial: result.driftScore >= threshold,
      newResults: result.newResults,
      droppedResults: result.droppedResults,
      contentChanges: result.contentChanges,
      decomposition: {
        contentDrift: result.decomposedDrift.contentDrift,
        competitorDrift: result.decomposedDrift.competitorDrift,
        rerankDrift: result.decomposedDrift.rerankDrift,
        dominantCause: result.decomposedDrift.dominantCause,
      },
    };
  }
}

export interface ComparisonDocumentMovementAdapter {
  analyze(
    ownerUserId: string,
    datasetId: string,
    evaluationQueryId: string,
    sourceQueryId: string,
    beforeSnapshotId: string,
    afterSnapshotId: string,
    cutoffs: number[],
    coverage: { before: number | null; after: number | null }
  ): Promise<QueryDocumentMovementEvidence>;
}

export interface ComparisonMovementSnapshotReader {
  get(id: string): Promise<RankingSnapshot>;
}

class AppwriteComparisonMovementSnapshotReader implements ComparisonMovementSnapshotReader {
  async get(id: string) {
    try {
      return transformSnapshotDocument(
        await databases.getDocument(DATABASE_ID, COLLECTIONS.SNAPSHOTS, id),
        false
      );
    } catch {
      throw new EvaluationError("NOT_FOUND", "Document movement snapshot not found", 404);
    }
  }
}

export class AppwriteComparisonDocumentMovementAdapter implements ComparisonDocumentMovementAdapter {
  constructor(
    private readonly judgments: RelevanceJudgmentService = relevanceJudgmentService,
    private readonly datasets: EvaluationDatasetService = evaluationDatasetService,
    private readonly snapshots: ComparisonMovementSnapshotReader = new AppwriteComparisonMovementSnapshotReader()
  ) {}

  async analyze(
    ownerUserId: string,
    datasetId: string,
    evaluationQueryId: string,
    sourceQueryId: string,
    beforeSnapshotId: string,
    afterSnapshotId: string,
    cutoffs: number[],
    coverage: { before: number | null; after: number | null }
  ) {
    const [detail, before, after, accepted] = await Promise.all([
      this.datasets.getDatasetDetail(ownerUserId, datasetId),
      this.snapshots.get(beforeSnapshotId),
      this.snapshots.get(afterSnapshotId),
      this.judgments.getAcceptedJudgmentsForEvaluationQuery(ownerUserId, datasetId, evaluationQueryId),
    ]);

    if (detail.dataset.status !== "frozen") {
      throw new EvaluationError("DATASET_NOT_FROZEN", "Document movement requires a frozen dataset", 409);
    }

    if (detail.dataset.canonicalizationVersion !== CANONICALIZATION_VERSION) {
      throw new EvaluationError(
        "INVALID_STATE",
        "Dataset canonicalization version is incompatible with document movement policy",
        409
      );
    }

    const query = detail.queries.find((item) => item.id === evaluationQueryId);
    if (!query || query.sourceQueryId !== sourceQueryId) {
      throw new EvaluationError("INVALID_STATE", "Evaluation query provenance is inconsistent", 409);
    }

    if (
      accepted.some(
        (judgment) =>
          judgment.datasetVersionId !== datasetId ||
          judgment.evaluationQueryId !== evaluationQueryId ||
          judgment.sourceQueryId !== sourceQueryId
      )
    ) {
      throw new EvaluationError("INVALID_STATE", "Accepted judgment provenance is inconsistent", 409);
    }

    for (const snapshot of [before, after]) {
      if (snapshot.userId !== ownerUserId) {
        throw new EvaluationError(
          "UNAUTHORIZED",
          "Document movement snapshot is not owned by the dataset owner",
          403
        );
      }
      if (snapshot.queryId !== sourceQueryId) {
        throw new EvaluationError(
          "SNAPSHOT_MISMATCH",
          "Document movement snapshot does not belong to the evaluation query",
          409
        );
      }
    }

    return analyzeJudgedDocumentMovement(evaluationQueryId, before, after, accepted, cutoffs, coverage);
  }
}

export class EvaluationComparisonService {
  constructor(
    private readonly runs: EvaluationRunService = evaluationRunService,
    private readonly drift: ComparisonDriftAdapter = new AppwriteComparisonDriftAdapter(),
    private readonly documents: ComparisonDocumentMovementAdapter = new AppwriteComparisonDocumentMovementAdapter()
  ) {}

  async compare(ownerUserId: string, datasetId: string, input: unknown): Promise<EvaluationRunComparison> {
    const ids = this.input(input);

    const [before, after] = await Promise.all([
      this.runs.getRun(ownerUserId, datasetId, ids.beforeRunId),
      this.runs.getRun(ownerUserId, datasetId, ids.afterRunId),
    ]);

    if (before.id === after.id) {
      throw invalid("Before and After runs must be different");
    }

    if (after.createdAt.getTime() <= before.createdAt.getTime()) {
      throw invalid("After run must be newer than Before run");
    }

    const compatible = compatibility(before, after);
    if (!compatible.compatible) {
      throw new EvaluationError("INVALID_STATE", compatible.reasons.join("; "), 409);
    }

    const queryCohort = cohort(before, after);
    if (!queryCohort.commonCount) {
      throw new EvaluationError("INVALID_STATE", "Evaluation runs have no common benchmark queries", 409);
    }

    const beforeById = new Map(before.perQuery.map((item) => [item.evaluationQueryId, item]));
    const afterById = new Map(after.perQuery.map((item) => [item.evaluationQueryId, item]));

    const perQuery = queryCohort.commonQueryIds.map((id) =>
      compareQuery(beforeById.get(id)!, afterById.get(id)!, compatible.sharedCutoffs)
    );

    for (const item of perQuery) {
      const beforeQuery = beforeById.get(item.evaluationQueryId)!;
      const coverage =
        item.byCutoff.find((metric) => metric.cutoff === 10)?.judgmentCoverage ??
        item.byCutoff.at(-1)?.judgmentCoverage;

      item.documentMovement = await this.documents.analyze(
        ownerUserId,
        datasetId,
        item.evaluationQueryId,
        beforeQuery.sourceQueryId,
        item.beforeSnapshotId,
        item.afterSnapshotId,
        compatible.sharedCutoffs,
        { before: coverage?.before ?? null, after: coverage?.after ?? null }
      );
    }

    const aggregate = aggregateComparisons(perQuery, compatible.sharedCutoffs);
    const primary = primaryMetric(aggregate);
    const warnings: string[] = [];

    if (!queryCohort.exactMatch) {
      warnings.push(`Query cohorts differ; comparison uses ${queryCohort.commonCount} common queries only.`);
    }

    for (const k of [5, 10]) {
      if (!compatible.sharedCutoffs.includes(k)) {
        warnings.push(`Metrics at cutoff ${k} are unavailable because both runs did not evaluate that cutoff.`);
      }
    }

    for (const item of aggregate.byCutoff) {
      const coverage = item.judgmentCoverage;
      if (
        coverage.before !== null &&
        (coverage.before < QUALITY_COMPARISON_POLICY.coverageWarningThreshold ||
          coverage.after! < QUALITY_COMPARISON_POLICY.coverageWarningThreshold ||
          Math.abs(coverage.delta!) >= QUALITY_COMPARISON_POLICY.coverageMaterialChange)
      ) {
        warnings.push(`Judgment Coverage@${item.cutoff} is low or changed materially; interpret relevance deltas cautiously.`);
      }
    }

    const driftEvidence: DriftEvidenceSummary[] = [];
    for (const item of perQuery) {
      try {
        const evidence = await this.drift.compare(item.evaluationQueryId, item.beforeSnapshotId, item.afterSnapshotId);
        if (evidence) driftEvidence.push(evidence);
      } catch {
        warnings.push(`${item.evaluationQueryId}: aligned drift evidence is unavailable.`);
      }
    }

    const driftSummary = driftEvidence.length
      ? {
          mean: driftEvidence.reduce((sum, item) => sum + item.driftScore, 0) / driftEvidence.length,
          substantial: driftEvidence.some((item) => item.substantial),
        }
      : undefined;

    const documentEvidence = aggregateDocumentEvidence(
      perQuery.flatMap((item) => (item.documentMovement ? [item.documentMovement] : [])),
      perQuery
    );

    const qualitySummary = interpretation(primary.delta, primary.name, primary.recall, driftSummary);
    qualitySummary.explanation += ` ${documentEvidence.explanation}`;

    const sortable = perQuery.filter((item) => item.primaryDelta !== null);

    return {
      comparisonVersion: EVALUATION_COMPARISON_VERSION,
      datasetVersionId: datasetId,
      metricVersion: before.metricVersion,
      beforeRun: { id: before.id, createdAt: before.createdAt, selectedQueryCount: before.perQuery.length },
      afterRun: { id: after.id, createdAt: after.createdAt, selectedQueryCount: after.perQuery.length },
      compatibility: compatible,
      queryCohort,
      aggregateDeltas: aggregate,
      qualitySummary,
      perQueryComparisons: perQuery,
      largestLosses: [...sortable]
        .filter((item) => item.primaryDelta! < 0)
        .sort((a, b) => a.primaryDelta! - b.primaryDelta!)
        .slice(0, 5),
      largestGains: [...sortable]
        .filter((item) => item.primaryDelta! > 0)
        .sort((a, b) => b.primaryDelta! - a.primaryDelta!)
        .slice(0, 5),
      documentEvidence,
      driftEvidence,
      warnings: [...new Set(warnings)],
    };
  }

  private input(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw invalid("Comparison input must be an object");
    }

    const raw = value as Record<string, unknown>;

    if (
      Object.keys(raw).some((key) => key !== "beforeRunId" && key !== "afterRunId") ||
      typeof raw.beforeRunId !== "string" ||
      !raw.beforeRunId.trim() ||
      typeof raw.afterRunId !== "string" ||
      !raw.afterRunId.trim()
    ) {
      throw invalid("beforeRunId and afterRunId are required");
    }

    return { beforeRunId: raw.beforeRunId.trim(), afterRunId: raw.afterRunId.trim() };
  }
}

export const evaluationComparisonService = new EvaluationComparisonService();