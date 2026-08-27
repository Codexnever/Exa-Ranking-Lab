import { databases, DATABASE_ID, COLLECTIONS, ID, Query } from "@/app/server/appwrite/appwrite-server";
import type { EvaluationDatasetVersion } from "@/types/evaluation";
import type { EvaluationRun, EvaluationRunList } from "@/types/evaluation-runs";
import type { EvaluationMetricsInput } from "./metrics/evaluation-metrics-service";
import { evaluationMetricsService, type EvaluationMetricsService } from "./metrics/evaluation-metrics-service";
import { EVALUATION_METRIC_VERSION, type EvaluationMetricsResponse } from "./metrics/types";
import { AppwriteEvaluationRepository, type EvaluationRepository } from "./evaluation-dataset-service";
import { EvaluationError, invalid } from "./evaluation-errors";
import { transformEvaluationRun, transformEvaluationRunSummary } from "./evaluation-run-transformers";
import { evaluationPayloadRepository, type EvaluationPayloadRepository } from "./evaluation-payload-repository";
import { createManifest, manifestJson, parseManifest } from "./evaluation-payload-codec";

type Document = Record<string, unknown>;
const required = (document: Document, key: string): string => {
  const value = document[key];
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`evaluation run ${key} is required`);
  return value;
};

export interface EvaluationRunRepository {
  createRun(id: string, data: Record<string, unknown>): Promise<Document>;
  createRunQuery(id: string, data: Record<string, unknown>): Promise<Document>;
  deleteRun(id: string): Promise<void>;
  deleteRunQuery(id: string): Promise<void>;
  deleteRunQueries(runId: string): Promise<void>;
  listRuns(datasetVersionId: string, limit: number, offset: number): Promise<{ documents: Document[]; total: number }>;
  getRun(id: string): Promise<Document | null>;
  listRunQueries(runId: string): Promise<Document[]>;
}

function storageError(error: unknown, action: string): never {
  if (error instanceof EvaluationError) throw error;

  const code = (error as { code?: number })?.code;
  if (code === 404) throw new EvaluationError("NOT_FOUND", `${action} not found`, 404);

  throw new EvaluationError("STORAGE_ERROR", `Failed to ${action}`, 500);
}

export class AppwriteEvaluationRunRepository implements EvaluationRunRepository {
  async createRun(id: string, data: Record<string, unknown>) {
    try {
      return (await databases.createDocument(DATABASE_ID, COLLECTIONS.EVALUATION_RUNS, id, data)) as unknown as Document;
    } catch (error) {
      storageError(error, "create evaluation run");
    }
  }

  async createRunQuery(id: string, data: Record<string, unknown>) {
    try {
      return (await databases.createDocument(
        DATABASE_ID,
        COLLECTIONS.EVALUATION_RUN_QUERIES,
        id,
        data
      )) as unknown as Document;
    } catch (error) {
      storageError(error, "create evaluation run query");
    }
  }

  async deleteRun(id: string) {
    try {
      await databases.deleteDocument(DATABASE_ID, COLLECTIONS.EVALUATION_RUNS, id);
    } catch (error) {
      if ((error as { code?: number })?.code !== 404) storageError(error, "clean incomplete evaluation run");
    }
  }

  async deleteRunQuery(id: string) {
    try {
      await databases.deleteDocument(DATABASE_ID, COLLECTIONS.EVALUATION_RUN_QUERIES, id);
    } catch (error) {
      if ((error as { code?: number })?.code !== 404) storageError(error, "clean incomplete evaluation run query");
    }
  }

  async deleteRunQueries(runId: string) {
    try {
      const docs = await this.listRunQueries(runId);
      await Promise.all(
        docs.map((doc) => databases.deleteDocument(DATABASE_ID, COLLECTIONS.EVALUATION_RUN_QUERIES, String(doc.$id)))
      );
    } catch (error) {
      storageError(error, "clean incomplete evaluation run");
    }
  }

  async listRuns(datasetVersionId: string, limit: number, offset: number) {
    try {
      const result = await databases.listDocuments(DATABASE_ID, COLLECTIONS.EVALUATION_RUNS, [
        Query.equal("datasetVersionId", datasetVersionId),
        Query.orderDesc("createdAt"),
        Query.limit(limit),
        Query.offset(offset),
      ]);
      return { documents: result.documents as unknown as Document[], total: result.total };
    } catch (error) {
      storageError(error, "list evaluation runs");
    }
  }

  async getRun(id: string) {
    try {
      return (await databases.getDocument(DATABASE_ID, COLLECTIONS.EVALUATION_RUNS, id)) as unknown as Document;
    } catch (error) {
      if ((error as { code?: number })?.code === 404) return null;
      storageError(error, "read evaluation run");
    }
  }

  async listRunQueries(runId: string) {
    try {
      const output: Document[] = [];
      let offset = 0;

      while (true) {
        const result = await databases.listDocuments(DATABASE_ID, COLLECTIONS.EVALUATION_RUN_QUERIES, [
          Query.equal("runId", runId),
          Query.orderAsc("evaluationQueryId"),
          Query.limit(500),
          Query.offset(offset),
        ]);
        output.push(...(result.documents as unknown as Document[]));

        if (result.documents.length < 500) return output;
        offset += result.documents.length;
      }
    } catch (error) {
      storageError(error, "list evaluation run queries");
    }
  }
}

const json = (value: unknown, name: string, max: number) => {
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, "utf8") > max) {
    throw new EvaluationError("PROVENANCE_LIMIT", `${name} exceeds the evaluation history storage limit`, 413);
  }
  return serialized;
};

export class EvaluationRunService {
  constructor(
    private readonly evaluationRepository: EvaluationRepository = new AppwriteEvaluationRepository(),
    private readonly runRepository: EvaluationRunRepository = new AppwriteEvaluationRunRepository(),
    private readonly metricsService: EvaluationMetricsService = evaluationMetricsService,
    private readonly payloadRepository: Pick<EvaluationPayloadRepository, "writeRevision" | "readRevision" | "batchReadRevisions" | "deleteRevision"> = evaluationPayloadRepository
  ) {}

  async createRun(ownerUserId: string, datasetId: string, input: EvaluationMetricsInput): Promise<EvaluationRun> {
    const dataset = await this.ownedFrozenDataset(ownerUserId, datasetId);
    const result = await this.metricsService.evaluate(ownerUserId, datasetId, input);

    if (result.metricVersion !== EVALUATION_METRIC_VERSION) {
      throw new EvaluationError("INVALID_STATE", "Metric service returned an unsupported policy version", 500);
    }

    const runId = ID.unique();
    const createdAt = new Date();
    const snapshotSelections = Object.entries(result.snapshotSelections).map(([evaluationQueryId, snapshotId]) => ({ evaluationQueryId, snapshotId }));
    const runPayload = createManifest({ snapshot_selections: snapshotSelections, aggregate_result: result.aggregate, warnings: result.aggregate.warnings });
    const queryPayloads = result.perQuery.map(perQuery => {
      const entityId = ID.unique();
      return { perQuery, entityId, payload: createManifest({ query_result: perQuery }) };
    });
    const payloadEntities: Array<{ entityType: "evaluation_run" | "evaluation_run_query"; entityId: string; revision: string }> = [];
    const createdQueryHeaders: string[] = [];
    let runHeaderCreated = false;

    try {
      await this.payloadRepository.writeRevision({ ownerUserId, datasetVersionId: dataset.id, entityType: "evaluation_run", entityId: runId, payloadRevision: runPayload.revision, values: { snapshot_selections: snapshotSelections, aggregate_result: result.aggregate, warnings: result.aggregate.warnings } });
      payloadEntities.push({ entityType: "evaluation_run", entityId: runId, revision: runPayload.revision });
      for (const item of queryPayloads) {
        await this.payloadRepository.writeRevision({ ownerUserId, datasetVersionId: dataset.id, entityType: "evaluation_run_query", entityId: item.entityId, payloadRevision: item.payload.revision, values: { query_result: item.perQuery } });
        payloadEntities.push({ entityType: "evaluation_run_query", entityId: item.entityId, revision: item.payload.revision });
      }
      const refs = [
        { ownerUserId, datasetVersionId: dataset.id, entityType: "evaluation_run" as const, entityId: runId, payloadRevision: runPayload.revision, manifest: runPayload.manifest },
        ...queryPayloads.map(item => ({ ownerUserId, datasetVersionId: dataset.id, entityType: "evaluation_run_query" as const, entityId: item.entityId, payloadRevision: item.payload.revision, manifest: item.payload.manifest })),
      ];
      const verified = await this.payloadRepository.batchReadRevisions(refs);
      for (const item of queryPayloads) {
        await this.runRepository.createRunQuery(item.entityId, {
          runId, datasetVersionId: dataset.id, evaluationQueryId: item.perQuery.evaluationQueryId,
          snapshotId: item.perQuery.snapshotId, ownerUserId, payloadRevision: item.payload.revision,
          payloadManifestJson: manifestJson(item.payload.manifest), createdAt: createdAt.toISOString(),
        });
        createdQueryHeaders.push(item.entityId);
      }
      const header = await this.runRepository.createRun(runId, this.header(dataset, result, createdAt, ownerUserId, runPayload.revision, manifestJson(runPayload.manifest)));
      runHeaderCreated = true;
      const runValues = verified.get(`evaluation_run:${runId}:${runPayload.revision}`);
      if (!runValues) throw new EvaluationError("INVALID_STATE", "Verified run payload is missing", 409);
      return transformEvaluationRun(
        { ...header, snapshotSelections: runValues.snapshot_selections, aggregate: runValues.aggregate_result, warnings: runValues.warnings },
        queryPayloads.map(item => ({
          $id: item.entityId, runId, datasetVersionId: dataset.id, evaluationQueryId: item.perQuery.evaluationQueryId,
          snapshotId: item.perQuery.snapshotId, ownerUserId, payloadRevision: item.payload.revision,
          payloadManifestJson: manifestJson(item.payload.manifest),
          result: verified.get(`evaluation_run_query:${item.entityId}:${item.payload.revision}`)?.query_result,
        }))
      );
    } catch (error) {
      if (runHeaderCreated) await this.runRepository.deleteRun(runId).catch(() => undefined);
      for (const id of [...createdQueryHeaders].reverse()) await this.runRepository.deleteRunQuery(id).catch(() => undefined);
      for (const payload of [...payloadEntities].reverse()) {
        await this.payloadRepository.deleteRevision({
          ownerUserId,
          entityType: payload.entityType,
          entityId: payload.entityId,
          payloadRevision: payload.revision,
        }).catch(() => undefined);
      }
      throw error;
    }
  }

  async listRuns(
    ownerUserId: string,
    datasetId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<EvaluationRunList> {
    const dataset = await this.ownedDataset(ownerUserId, datasetId);
    const limit = this.page(options.limit, "limit", 20, 1, 100);
    const offset = this.page(options.offset, "offset", 0, 0, 10_000);

    const result = await this.runRepository.listRuns(dataset.id, limit, offset);
    for (const document of result.documents) {
      if (document.createdByUserId !== ownerUserId || document.datasetVersionId !== dataset.id) {
        throw new EvaluationError("INVALID_STATE", "Evaluation history contains a foreign or incompatible run", 409);
      }
    }
    const refs = result.documents.map(document => ({
        ownerUserId,
        datasetVersionId: dataset.id,
        entityType: "evaluation_run" as const,
        entityId: required(document, "$id"),
        payloadRevision: required(document, "payloadRevision"),
        manifest: parseManifest(required(document, "payloadManifestJson"), "evaluation_run"),
    }));
    const payloads = await this.payloadRepository.batchReadRevisions(refs);
    const hydratedDocuments = result.documents.map(document => {
      const entityId = required(document, "$id");
      const revision = required(document, "payloadRevision");
      const payload = payloads.get(`evaluation_run:${entityId}:${revision}`);
      if (!payload) throw new EvaluationError("INVALID_STATE", "Evaluation run payload is missing", 409);
      return {
        ...document,
        snapshotSelections: payload.snapshot_selections,
        aggregate: payload.aggregate_result,
        warnings: payload.warnings,
      };
    });
    const runs = hydratedDocuments.map(transformEvaluationRunSummary);

    if (
      runs.some(
        (run) =>
          run.datasetVersionId !== dataset.id ||
          run.datasetFamilyKey !== dataset.familyKey ||
          run.datasetVersion !== dataset.version ||
          run.createdByUserId !== ownerUserId
      )
    ) {
      throw new EvaluationError("INVALID_STATE", "Evaluation history contains a foreign or incompatible run", 409);
    }

    return { runs, total: result.total, limit, offset };
  }

  async getRun(ownerUserId: string, datasetId: string, runId: string): Promise<EvaluationRun> {
    const dataset = await this.ownedDataset(ownerUserId, datasetId);
    if (!runId?.trim()) throw invalid("Run ID is required");

    const document = await this.runRepository.getRun(runId);
    if (!document || document.datasetVersionId !== datasetId) {
      throw new EvaluationError("NOT_FOUND", "Evaluation run not found", 404);
    }
    if (document.createdByUserId !== ownerUserId) throw new EvaluationError("UNAUTHORIZED", "Evaluation run access denied", 403);

    const queryDocuments = await this.runRepository.listRunQueries(runId);
    const refs = [{
      ownerUserId,
      datasetVersionId: dataset.id,
      entityType: "evaluation_run" as const,
      entityId: runId,
      payloadRevision: required(document, "payloadRevision"),
      manifest: parseManifest(required(document, "payloadManifestJson"), "evaluation_run"),
    }, ...queryDocuments.map(query => ({
        ownerUserId,
        datasetVersionId: dataset.id,
        entityType: "evaluation_run_query" as const,
        entityId: required(query, "$id"),
        payloadRevision: required(query, "payloadRevision"),
        manifest: parseManifest(required(query, "payloadManifestJson"), "evaluation_run_query"),
    }))];
    const payloads = await this.payloadRepository.batchReadRevisions(refs);
    const runPayload = payloads.get(`evaluation_run:${runId}:${required(document, "payloadRevision")}`);
    if (!runPayload) throw new EvaluationError("INVALID_STATE", "Evaluation run payload is missing", 409);
    const hydratedQueries = queryDocuments.map(query => {
      const entityId = required(query, "$id");
      const payload = payloads.get(`evaluation_run_query:${entityId}:${required(query, "payloadRevision")}`);
      if (!payload) throw new EvaluationError("INVALID_STATE", "Evaluation run query payload is missing", 409);
      return { ...query, result: payload.query_result };
    });
    const run = transformEvaluationRun({
      ...document,
      snapshotSelections: runPayload.snapshot_selections,
      aggregate: runPayload.aggregate_result,
      warnings: runPayload.warnings,
    }, hydratedQueries);

    if (run.createdByUserId !== ownerUserId) {
      throw new EvaluationError("UNAUTHORIZED", "Evaluation run access denied", 403);
    }
    if (run.datasetFamilyKey !== dataset.familyKey || run.datasetVersion !== dataset.version) {
      throw new EvaluationError("INVALID_STATE", "Evaluation run does not match the immutable dataset version", 409);
    }

    return run;
  }

  private header(
    dataset: EvaluationDatasetVersion,
    result: EvaluationMetricsResponse,
    createdAt: Date,
    userId: string,
    payloadRevision: string,
    payloadManifestJson: string
  ): Record<string, unknown> {
    const cutoffs = result.aggregate.byCutoff.map((item) => item.cutoff);
    return {
      datasetVersionId: dataset.id,
      datasetFamilyKey: dataset.familyKey,
      datasetVersion: dataset.version,
      metricVersion: EVALUATION_METRIC_VERSION,
      status: "completed",
      cutoffsJson: json(cutoffs, "cutoffs", 2_048),
      payloadRevision,
      payloadManifestJson,
      eligibleQueryCount: result.aggregate.eligibleQueryCount,
      skippedQueryCount: result.aggregate.skippedQueryCount,
      selectedQueryCount: result.perQuery.length,
      createdAt: createdAt.toISOString(),
      createdByUserId: userId,
    };
  }

  private async ownedDataset(userId: string, id: string) {
    if (!userId?.trim() || !id?.trim()) throw invalid("Authenticated owner and dataset ID are required");

    const dataset = await this.evaluationRepository.getDataset(id);
    if (!dataset) throw new EvaluationError("NOT_FOUND", "Evaluation dataset not found", 404);
    if (dataset.ownerUserId !== userId) throw new EvaluationError("UNAUTHORIZED", "Evaluation dataset access denied", 403);

    return dataset;
  }

  private async ownedFrozenDataset(userId: string, id: string) {
    const dataset = await this.ownedDataset(userId, id);
    if (dataset.status !== "frozen") {
      throw new EvaluationError("DATASET_NOT_FROZEN", "Persisted evaluation runs require a frozen dataset", 409);
    }
    return dataset;
  }

  private page(value: number | undefined, name: string, fallback: number, min: number, max: number) {
    const parsed = value === undefined ? fallback : value;
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
      throw invalid(`${name} must be an integer between ${min} and ${max}`);
    }
    return parsed;
  }
}

export const evaluationRunService = new EvaluationRunService();
