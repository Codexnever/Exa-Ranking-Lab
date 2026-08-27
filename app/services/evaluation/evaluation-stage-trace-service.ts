import { databases, DATABASE_ID, COLLECTIONS, ID, Query } from "@/app/server/appwrite/appwrite-server";
import { transformSnapshotDocument } from "@/utils/db-utils";
import type { RankingSnapshot } from "@/types/type";
import type {
  EvaluationExecutionTrace,
  EvaluationStageTrace,
  EvaluationStageTraceList,
  EvaluationStageTraceSummary,
  EvaluationStageType,
  TraceCompleteness,
} from "@/types/evaluation-stage-trace";
import { EVALUATION_STAGE_TYPES, EVALUATION_STAGE_TRACE_VERSION } from "@/types/evaluation-stage-trace";
import { canonicalizeStageDocuments, alignFinalStage, type RawStageDocument } from "./evaluation-stage-trace-calculations";
import { EVALUATION_STAGE_TRACE_POLICY as POLICY } from "./stage-trace-policy";
import { EvaluationError, invalid } from "./evaluation-errors";
import { evaluationDatasetService, type EvaluationDatasetService } from "./evaluation-dataset-service";
import { relevanceJudgmentService, type RelevanceJudgmentService } from "./relevance-judgment-service";
import { canonicalSnapshot } from "./evaluation-document-movement";
import { getDocumentIdentity } from "@/utils/canonicalize-document-url";
import { createManifest, manifestJson, parseManifest, type PayloadManifest } from "./evaluation-payload-codec";
import { evaluationPayloadRepository, type EvaluationPayloadRepository } from "./evaluation-payload-repository";
import { transformQueryDocument } from "@/utils/db-utils";

type Doc = Record<string, unknown>;

export interface StageTraceRepository {
  createHeader(id: string, data: Doc): Promise<Doc>;
  createDocument(id: string, data: Doc): Promise<Doc>;
  deleteHeader(id: string): Promise<void>;
  deleteDocuments(traceId: string): Promise<void>;
  getHeader(id: string): Promise<Doc | null>;
  listHeaders(userId: string, filters: TraceFilters, limit: number, offset: number): Promise<{ documents: Doc[]; total: number }>;
  listDocuments(traceId: string): Promise<Doc[]>;
}

export interface StageTraceSnapshotReader {
  get(id: string): Promise<RankingSnapshot>;
}

export interface StageTraceSourceQueryReader {
  get(id: string): Promise<{ id: string; userId: string } | null>;
}

export interface TraceFilters {
  sourceQueryId?: string;
  snapshotId?: string;
  evaluationQueryId?: string;
  datasetVersionId?: string;
}

function fail(error: unknown, action: string): never {
  if (error instanceof EvaluationError) throw error;
  if ((error as { code?: number })?.code === 404) throw new EvaluationError("NOT_FOUND", `${action} not found`, 404);
  throw new EvaluationError("STORAGE_ERROR", `Failed to ${action}`, 500);
}

export class AppwriteStageTraceRepository implements StageTraceRepository {
  async createHeader(id: string, data: Doc) {
    try {
      return (await databases.createDocument(DATABASE_ID, COLLECTIONS.EVALUATION_STAGE_TRACES, id, data)) as unknown as Doc;
    } catch (e) {
      fail(e, "create stage trace");
    }
  }

  async createDocument(id: string, data: Doc) {
    try {
      return (await databases.createDocument(
        DATABASE_ID,
        COLLECTIONS.EVALUATION_STAGE_TRACE_DOCUMENTS,
        id,
        data
      )) as unknown as Doc;
    } catch (e) {
      fail(e, "create stage trace document");
    }
  }

  async deleteHeader(id: string) {
    try {
      await databases.deleteDocument(DATABASE_ID, COLLECTIONS.EVALUATION_STAGE_TRACES, id);
    } catch (e) {
      if ((e as { code?: number })?.code !== 404) fail(e, "delete incomplete stage trace");
    }
  }

  async deleteDocuments(traceId: string) {
    for (const doc of await this.listDocuments(traceId)) {
      await databases.deleteDocument(DATABASE_ID, COLLECTIONS.EVALUATION_STAGE_TRACE_DOCUMENTS, String(doc.$id));
    }
  }

  async getHeader(id: string) {
    try {
      return (await databases.getDocument(DATABASE_ID, COLLECTIONS.EVALUATION_STAGE_TRACES, id)) as unknown as Doc;
    } catch (e) {
      if ((e as { code?: number })?.code === 404) return null;
      fail(e, "read stage trace");
    }
  }

  async listHeaders(userId: string, filters: TraceFilters, limit: number, offset: number) {
    try {
      const queries = [
        Query.equal("createdByUserId", userId),
        ...Object.entries(filters)
          .filter(([, v]) => v)
          .map(([k, v]) => Query.equal(k, v!)),
        Query.orderDesc("createdAt"),
        Query.limit(limit),
        Query.offset(offset),
      ];
      const result = await databases.listDocuments(DATABASE_ID, COLLECTIONS.EVALUATION_STAGE_TRACES, queries);
      return { documents: result.documents as unknown as Doc[], total: result.total };
    } catch (e) {
      fail(e, "list stage traces");
    }
  }

  async listDocuments(traceId: string) {
    try {
      const out: Doc[] = [];
      let offset = 0;

      while (true) {
        const result = await databases.listDocuments(DATABASE_ID, COLLECTIONS.EVALUATION_STAGE_TRACE_DOCUMENTS, [
          Query.equal("traceId", traceId),
          Query.orderAsc("stageOrder"),
          Query.orderAsc("rankSort"),
          Query.limit(500),
          Query.offset(offset),
        ]);
        out.push(...(result.documents as unknown as Doc[]));

        if (out.length > POLICY.maxStages * POLICY.maxDocumentsPerStage) {
          throw new EvaluationError("INVALID_STATE", "Stage trace exceeds the bounded document limit", 409);
        }
        if (result.documents.length < 500) return out;
        offset += result.documents.length;
      }
    } catch (e) {
      fail(e, "read stage trace documents");
    }
  }
}

class AppwriteStageTraceSourceQueryReader implements StageTraceSourceQueryReader {
  async get(id: string) {
    try {
      const query = transformQueryDocument(await databases.getDocument(DATABASE_ID, COLLECTIONS.QUERIES, id), false);
      return { id: query.id, userId: query.userId };
    } catch (error) {
      if ((error as { code?: number })?.code === 404) return null;
      fail(error, "read stage trace source query");
    }
  }
}

class AppwriteStageTraceSnapshotReader implements StageTraceSnapshotReader {
  async get(id: string) {
    try {
      return transformSnapshotDocument(await databases.getDocument(DATABASE_ID, COLLECTIONS.SNAPSHOTS, id), false);
    } catch (e) {
      fail(e, "stage trace snapshot");
    }
  }
}

const json = (value: unknown, name: string, max: number = POLICY.maxMetadataBytes) => {
  const output = JSON.stringify(value);
  if (Buffer.byteLength(output, "utf8") > max) {
    throw new EvaluationError("PROVENANCE_LIMIT", `${name} exceeds storage limit`, 413);
  }
  return output;
};

const parseJson = (value: unknown, name: string) => {
  if (typeof value !== "string") throw new TypeError(`${name} is malformed`);
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new TypeError(`${name} is malformed`);
  }
};

const str = (value: unknown, name: string, nullable = false) => {
  if (nullable && (value === null || value === "" || value === undefined)) return null;
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${name} is malformed`);
  return value;
};

const integer = (value: unknown, name: string, min = 0) => {
  if (!Number.isInteger(value) || Number(value) < min) throw new TypeError(`${name} is malformed`);
  return Number(value);
};

const date = (value: unknown, name: string) => {
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) throw new TypeError(`${name} is malformed`);
  return parsed;
};

export function transformStageTraceHeader(document: Doc): EvaluationStageTraceSummary & {
  payloadRevision: string;
  payloadManifest: PayloadManifest;
  queryText: string | null;
  completeFinalAlignment: boolean | null;
} {
  if ("stagesJson" in document || "warningsJson" in document) {
    throw new TypeError("Legacy or mixed stage trace representation is unsupported");
  }
  const traceVersion = str(document.traceVersion, "trace version")!;
  if (traceVersion !== EVALUATION_STAGE_TRACE_VERSION) throw new TypeError("Stored stage trace version is unsupported");
  const stageCount = integer(document.stageCount, "stage count", 1);
  if (stageCount > POLICY.maxStages) throw new TypeError("Stored stage count is malformed");
  const completeness = str(document.completeness, "completeness") as TraceCompleteness;
  if (!["complete", "partial", "final_only"].includes(completeness)) throw new TypeError("Stored trace completeness is malformed");
  const payloadRevision = str(document.payloadRevision, "payload revision")!;
  if (!/^[a-f0-9]{64}$/.test(payloadRevision)) throw new TypeError("Stored payload revision is malformed");
  const payloadManifest = parseManifest(str(document.payloadManifestJson, "payload manifest")!, "stage_trace");
  const alignment = document.completeFinalAlignment;
  if (alignment !== null && alignment !== undefined && typeof alignment !== "boolean") {
    throw new TypeError("Stored final alignment is malformed");
  }
  return {
    id: str(document.$id, "trace ID")!,
    traceVersion,
    sourceQueryId: str(document.sourceQueryId, "source query")!,
    snapshotId: str(document.snapshotId, "snapshot", true),
    evaluationQueryId: str(document.evaluationQueryId, "evaluation query", true),
    datasetVersionId: str(document.datasetVersionId, "dataset", true),
    stageCount,
    completeness,
    createdAt: date(document.createdAt, "createdAt"),
    createdByUserId: str(document.createdByUserId, "creator")!,
    payloadRevision,
    payloadManifest,
    queryText: str(document.queryText, "query text", true),
    completeFinalAlignment: alignment ?? null,
  };
}

function summary(document: Doc): EvaluationStageTraceSummary {
  const physical = transformStageTraceHeader(document);
  return {
    id: physical.id,
    traceVersion: physical.traceVersion,
    sourceQueryId: physical.sourceQueryId,
    snapshotId: physical.snapshotId,
    evaluationQueryId: physical.evaluationQueryId,
    datasetVersionId: physical.datasetVersionId,
    stageCount: physical.stageCount,
    completeness: physical.completeness,
    createdAt: physical.createdAt,
    createdByUserId: physical.createdByUserId,
  };
}

function transform(header: Doc, payload: Record<string, unknown>, documents: Doc[]): EvaluationExecutionTrace {
  const physical = transformStageTraceHeader(header);
  const base = summary(header);

  const definitions = payload.stage_definitions as Array<Record<string, unknown>>;

  if (!Array.isArray(definitions) || definitions.length !== base.stageCount) {
    throw new TypeError("Stored stage definitions are malformed");
  }

  if (definitions.some((definition) => "documents" in definition)) {
    throw new TypeError("Stored stage definitions must not contain ranked documents");
  }

  const definitionIds = new Set(definitions.map((def) => def.id));
  const definitionOrders = new Set(definitions.map((def) => def.order));

  if (definitionIds.size !== definitions.length || definitionOrders.size !== definitions.length) {
    throw new TypeError("Stored stage definitions contain duplicate identity");
  }
  if (documents.some(item => item.traceId !== base.id || !definitionIds.has(item.stageId) || !definitionOrders.has(item.stageOrder))) {
    throw new TypeError("Stored stage document provenance is malformed");
  }

  const stages: EvaluationStageTrace[] = definitions
    .map((def) => {
      const id = str(def.id, "stage ID")!;
      const type = str(def.type, "stage type") as EvaluationStageType;
      const order = integer(def.order, "stage order");

      if (!EVALUATION_STAGE_TYPES.includes(type)) throw new TypeError("Stored stage type is invalid");

      const stageDocs = documents
        .filter((item) => item.stageId === id)
        .map((item) => {
          const identity = getDocumentIdentity(str(item.canonicalUrl, "canonical URL")!);

          if (identity.canonicalUrl !== item.canonicalUrl || identity.documentKey !== item.documentKey) {
            throw new TypeError("Stored canonical document identity is malformed");
          }

          const rank = item.rank === null || item.rank === undefined ? null : integer(item.rank, "rank", 1);
          const rankSort = integer(item.rankSort, "rank sort", 1);
          if (rankSort !== (rank ?? 1_000_000) || item.stageOrder !== order || item.traceId !== base.id) {
            throw new TypeError("Stored stage document ordering is malformed");
          }
          const grade = item.relevanceGrade === null || item.relevanceGrade === undefined ? null : integer(item.relevanceGrade, "grade", 0);

          if (grade !== null && grade > 2) throw new TypeError("Stored relevance grade is malformed");

          return {
            documentKey: str(item.documentKey, "document key")!,
            canonicalUrl: str(item.canonicalUrl, "canonical URL")!,
            rawUrl: str(item.rawUrl, "raw URL")!,
            rank,
            score: item.score === null || item.score === undefined ? null : Number(item.score),
            scoreType: str(item.scoreType, "score type", true),
            title: str(item.title, "title", true),
            domain: str(item.domain, "domain")!,
            contentHash: str(item.contentHash, "content hash", true),
            metadata: parseJson(item.metadataJson, "document metadata"),
            relevanceGrade: grade as 0 | 1 | 2 | null,
            relevanceMeaning:
              grade === 2
                ? ("highly relevant" as const)
                : grade === 1
                ? ("relevant" as const)
                : grade === 0
                ? ("judged irrelevant" as const)
                : ("unjudged" as const),
          };
        });

      return {
        id,
        type,
        name: str(def.name, "stage name")!,
        order,
        provider: str(def.provider, "provider", true),
        timestamp: def.timestamp ? date(def.timestamp, "stage timestamp") : null,
        requestedResultCount:
          def.requestedResultCount === null || def.requestedResultCount === undefined
            ? null
            : integer(def.requestedResultCount, "requested count", 1),
        documents: stageDocs,
        duplicateCanonicalResultsIgnored: integer(def.duplicateCanonicalResultsIgnored, "duplicates"),
        metadata: parseJson(JSON.stringify(def.metadata ?? {}), "stage metadata"),
        warnings:
          Array.isArray(def.warnings) && def.warnings.every((warning) => typeof warning === "string" && warning.length <= 1000)
            ? def.warnings
            : (() => { throw new TypeError("Stored stage warnings are malformed"); })(),
      };
    })
    .sort((a, b) => a.order - b.order);

  if (stages.some((stage, index) => index > 0 && stage.order <= stages[index - 1].order)) {
    throw new TypeError("Stored stage order is malformed");
  }

  for (const stage of stages) {
    const keys = new Set(stage.documents.map((document) => document.documentKey));
    const ranks = stage.documents.filter((document) => document.rank !== null).map((document) => document.rank);

    if (keys.size !== stage.documents.length || new Set(ranks).size !== ranks.length) {
      throw new TypeError("Stored stage documents violate identity or rank invariants");
    }
  }

  if (stages.some((stage) => stage.documents.some((document) => document.score !== null && !Number.isFinite(document.score)))) {
    throw new TypeError("Stored stage score is malformed");
  }

  const final = stages.find((s) => s.type === "final");

  return {
    ...base,
    traceVersion: EVALUATION_STAGE_TRACE_VERSION,
    queryText: physical.queryText,
    stages,
    completeness: {
      status: base.completeness,
      recordedStageCount: stages.length,
      firstStage: stages[0]?.id ?? null,
      finalStagePresent: Boolean(final),
      completeFinalAlignment: physical.completeFinalAlignment,
    },
    warnings:
      Array.isArray(payload.warnings) && payload.warnings.every((warning) => typeof warning === "string" && warning.length <= 1000)
        ? payload.warnings
        : (() => { throw new TypeError("Stored trace warnings are malformed"); })(),
  };
}

function payloadRef(header: Doc, ownerUserId: string) {
  const physical = transformStageTraceHeader(header);
  return {
    ownerUserId,
    datasetVersionId: undefined,
    entityType: "stage_trace" as const,
    entityId: physical.id,
    payloadRevision: physical.payloadRevision,
    manifest: physical.payloadManifest,
  };
}

interface CreateInput {
  sourceQueryId: string;
  snapshotId?: string;
  evaluationQueryId?: string;
  datasetVersionId?: string;
  queryText?: string;
  completeness?: TraceCompleteness;
  stages: Array<{
    id: string;
    type: EvaluationStageType;
    name: string;
    order: number;
    provider?: string;
    timestamp?: string;
    requestedResultCount?: number;
    metadata?: Record<string, unknown>;
    documents: RawStageDocument[];
  }>;
}

export class EvaluationStageTraceService {
  constructor(
    private readonly repository: StageTraceRepository = new AppwriteStageTraceRepository(),
    private readonly snapshots: StageTraceSnapshotReader = new AppwriteStageTraceSnapshotReader(),
    private readonly datasets: EvaluationDatasetService = evaluationDatasetService,
    private readonly judgments: RelevanceJudgmentService = relevanceJudgmentService,
    private readonly payloads: Pick<EvaluationPayloadRepository, "writeRevision" | "readRevision" | "deleteRevision"> = evaluationPayloadRepository,
    private readonly sourceQueries: StageTraceSourceQueryReader = new AppwriteStageTraceSourceQueryReader()
  ) {}

  async create(userId: string, input: unknown) {
    const parsed = this.input(input);
    const stages = this.prepareStages(parsed.stages);
    const sourceQuery = await this.sourceQueries.get(parsed.sourceQueryId);
    if (!sourceQuery) throw new EvaluationError("NOT_FOUND", "Stage trace source query not found", 404);
    if (sourceQuery.userId !== userId) throw new EvaluationError("UNAUTHORIZED", "Stage trace source query access denied", 403);
    let snapshot: RankingSnapshot | undefined;

    if (parsed.snapshotId) {
      snapshot = await this.snapshots.get(parsed.snapshotId);

      if (snapshot.userId !== userId) {
        throw new EvaluationError("UNAUTHORIZED", "Stage trace snapshot access denied", 403);
      }
      if (snapshot.queryId !== parsed.sourceQueryId) {
        throw new EvaluationError("SNAPSHOT_MISMATCH", "Stage trace snapshot belongs to another source query", 409);
      }

      const final = stages.find((stage) => stage.type === "final");
      if (final) {
        const canonical = canonicalSnapshot(snapshot);
        alignFinalStage(
          final,
          {
            ...final,
            documents: canonical.documents.map((item) => ({
              ...item,
              score: null,
              scoreType: null,
              metadata: {},
              relevanceGrade: null,
              relevanceMeaning: "unjudged" as const,
            })),
          }.documents
        );
      }
    }

    let accepted: Awaited<ReturnType<RelevanceJudgmentService["getAcceptedJudgmentsForEvaluationQuery"]>> = [];

    if (parsed.datasetVersionId || parsed.evaluationQueryId) {
      if (!parsed.datasetVersionId || !parsed.evaluationQueryId) {
        throw invalid("datasetVersionId and evaluationQueryId must be supplied together");
      }

      const detail = await this.datasets.getDatasetDetail(userId, parsed.datasetVersionId);
      const query = detail.queries.find((q) => q.id === parsed.evaluationQueryId);

      if (!query || query.sourceQueryId !== parsed.sourceQueryId) {
        throw new EvaluationError("INVALID_STATE", "Evaluation trace linkage is incompatible", 409);
      }

      accepted = await this.judgments.getAcceptedJudgmentsForEvaluationQuery(
        userId,
        parsed.datasetVersionId,
        parsed.evaluationQueryId
      );

      if (
        accepted.some(
          (j) =>
            j.datasetVersionId !== parsed.datasetVersionId ||
            j.evaluationQueryId !== parsed.evaluationQueryId ||
            j.sourceQueryId !== parsed.sourceQueryId ||
            j.status !== "accepted"
        )
      ) {
        throw new EvaluationError("INVALID_STATE", "Accepted judgment trace overlay provenance is inconsistent", 409);
      }
    }

    const grades = new Map(accepted.map((j) => [j.documentKey, j.relevanceGrade]));

    for (const stage of stages) {
      for (const doc of stage.documents) {
        const grade = grades.get(doc.documentKey);
        if (grade === 0 || grade === 1 || grade === 2) {
          doc.relevanceGrade = grade;
          doc.relevanceMeaning = grade === 2 ? "highly relevant" : grade === 1 ? "relevant" : "judged irrelevant";
        }
      }
    }

    const traceId = ID.unique();
    const createdAt = new Date();
    const status = this.completeness(parsed.completeness, stages);
    const definitions = stages.map((stage) => ({
      id: stage.id,
      type: stage.type,
      name: stage.name,
      order: stage.order,
      provider: stage.provider,
      timestamp: stage.timestamp,
      requestedResultCount: stage.requestedResultCount,
      duplicateCanonicalResultsIgnored: stage.duplicateCanonicalResultsIgnored,
      metadata: stage.metadata,
      warnings: stage.warnings,
    }));
    const warnings = stages.flatMap((stage) => stage.warnings);
    const preparedPayload = createManifest({ stage_definitions: definitions, warnings });
    const payloadRevision = preparedPayload.revision;

    try {
      const writtenManifest = await this.payloads.writeRevision({
        ownerUserId: userId,
        entityType: "stage_trace",
        entityId: traceId,
        payloadRevision,
        values: { stage_definitions: definitions, warnings },
      });
      const manifest: PayloadManifest = writtenManifest;
      const verifiedPayload = await this.payloads.readRevision({
        ownerUserId: userId,
        entityType: "stage_trace",
        entityId: traceId,
        payloadRevision,
        manifest,
      });
      for (const stage of stages) {
        for (const doc of stage.documents) {
          await this.repository.createDocument(ID.unique(), {
            traceId,
            stageId: stage.id,
            stageOrder: stage.order,
            documentKey: doc.documentKey,
            canonicalUrl: doc.canonicalUrl,
            rawUrl: doc.rawUrl,
            rank: doc.rank,
            rankSort: doc.rank ?? 1_000_000,
            score: doc.score === null ? null : String(doc.score),
            scoreType: doc.scoreType,
            title: doc.title,
            domain: doc.domain,
            contentHash: doc.contentHash,
            metadataJson: json(doc.metadata, "document metadata"),
            relevanceGrade: doc.relevanceGrade,
          });
        }
      }

      const header = await this.repository.createHeader(traceId, {
        traceVersion: EVALUATION_STAGE_TRACE_VERSION,
        sourceQueryId: parsed.sourceQueryId,
        snapshotId: parsed.snapshotId ?? null,
        evaluationQueryId: parsed.evaluationQueryId ?? null,
        datasetVersionId: parsed.datasetVersionId ?? null,
        queryText: parsed.queryText ?? null,
        payloadRevision,
        payloadManifestJson: manifestJson(manifest),
        stageCount: stages.length,
        completeness: status,
        completeFinalAlignment: parsed.snapshotId && stages.some((s) => s.type === "final") ? true : null,
        createdAt: createdAt.toISOString(),
        createdByUserId: userId,
      });

      transform(header, verifiedPayload, await this.repository.listDocuments(traceId));
      return await this.get(userId, String(header.$id));
    } catch (error) {
      const cleanup = await Promise.allSettled([
        this.repository.deleteHeader(traceId),
        this.repository.deleteDocuments(traceId),
        this.payloads.deleteRevision({
          ownerUserId: userId,
          entityType: "stage_trace",
          entityId: traceId,
          payloadRevision,
        }),
      ]);
      if (cleanup.some((result) => result.status === "rejected")) {
        console.error("[StageTrace] cleanup failed for a newly generated trace");
      }
      throw error;
    }
  }

  async list(
    userId: string,
    options: TraceFilters & { limit?: number; offset?: number } = {}
  ): Promise<EvaluationStageTraceList> {
    const limit = this.page(options.limit, 20, 1, 100);
    const offset = this.page(options.offset, 0, 0, 10_000);
    const filters = {
      sourceQueryId: options.sourceQueryId,
      snapshotId: options.snapshotId,
      evaluationQueryId: options.evaluationQueryId,
      datasetVersionId: options.datasetVersionId,
    };

    const result = await this.repository.listHeaders(userId, filters, limit, offset);
    const traces = result.documents.map(summary);

    if (traces.some((trace) => trace.createdByUserId !== userId)) {
      throw new EvaluationError("INVALID_STATE", "Stage trace listing contains foreign history", 409);
    }

    return { traces, total: result.total, limit, offset };
  }

  async get(userId: string, id: string) {
    if (!id?.trim()) throw invalid("Trace ID is required");

    const header = await this.repository.getHeader(id);
    if (!header) throw new EvaluationError("NOT_FOUND", "Stage trace not found", 404);
    if (header.createdByUserId !== userId) throw new EvaluationError("UNAUTHORIZED", "Stage trace access denied", 403);

    const physical = transformStageTraceHeader(header);
    if ((physical.datasetVersionId === null) !== (physical.evaluationQueryId === null)) {
      throw new EvaluationError("INVALID_STATE", "Stored stage trace evaluation linkage is incomplete", 409);
    }
    if (physical.datasetVersionId && physical.evaluationQueryId) {
      const detail = await this.datasets.getDatasetDetail(userId, physical.datasetVersionId);
      const query = detail.queries.find((item) => item.id === physical.evaluationQueryId);
      if (!query || query.sourceQueryId !== physical.sourceQueryId) {
        throw new EvaluationError("INVALID_STATE", "Stored stage trace evaluation linkage is inconsistent", 409);
      }
    }

    let payload: Record<string, unknown>;
    try {
      payload = await this.payloads.readRevision(payloadRef(header, userId));
    } catch {
      throw new EvaluationError("INVALID_STATE", "Stage trace payload failed integrity verification", 409);
    }
    return transform(header, payload, await this.repository.listDocuments(id));
  }

  private prepareStages(input: CreateInput["stages"]) {
    if (!Array.isArray(input) || !input.length || input.length > POLICY.maxStages) {
      throw invalid(`stages must contain 1-${POLICY.maxStages} stages`);
    }

    const ids = new Set<string>();
    const orders = new Set<number>();

    return input
      .map((raw) => {
        if (!raw || typeof raw.id !== "string" || !raw.id.trim() || raw.id.length > 128 || ids.has(raw.id)) {
          throw invalid("Stage IDs must be non-empty and unique");
        }
        if (!Number.isInteger(raw.order) || orders.has(raw.order)) {
          throw invalid("Stage orders must be unique integers");
        }
        if (!EVALUATION_STAGE_TYPES.includes(raw.type)) throw invalid("Stage type is invalid");
        if (typeof raw.name !== "string" || !raw.name.trim() || raw.name.length > 256) {
          throw invalid("Stage name is required and must be at most 256 characters");
        }
        if (raw.timestamp && Number.isNaN(new Date(raw.timestamp).getTime())) {
          throw invalid("Stage timestamp is invalid");
        }
        if (raw.requestedResultCount !== undefined && (!Number.isInteger(raw.requestedResultCount) || raw.requestedResultCount < 1)) {
          throw invalid("requestedResultCount must be a positive integer");
        }

        ids.add(raw.id);
        orders.add(raw.order);
        json(raw.metadata ?? {}, "stage metadata");

        const prepared = canonicalizeStageDocuments(raw.documents);

        return {
          id: raw.id.trim(),
          type: raw.type,
          name: raw.name.trim(),
          order: raw.order,
          provider: raw.provider?.trim() || null,
          timestamp: raw.timestamp ? new Date(raw.timestamp) : null,
          requestedResultCount: raw.requestedResultCount ?? null,
          metadata: raw.metadata ?? {},
          documents: prepared.documents,
          duplicateCanonicalResultsIgnored: prepared.duplicates,
          warnings: prepared.duplicates ? [`${prepared.duplicates} canonical duplicate result(s) ignored.`] : [],
        };
      })
      .sort((a, b) => a.order - b.order);
  }

  private input(value: unknown): CreateInput {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw invalid("Stage trace input must be an object");
    }

    const raw = value as Record<string, unknown>;

    if (["$id", "id", "traceVersion", "createdAt", "createdByUserId", "payloadRevision", "payloadManifestJson", "payloadHash", "chunkCount", "completeFinalAlignment"].some((key) => key in raw)) {
      throw invalid("Clients must not submit authoritative trace provenance");
    }
    if (typeof raw.sourceQueryId !== "string" || !raw.sourceQueryId.trim() || raw.sourceQueryId.length > 64) {
      throw invalid("sourceQueryId is required");
    }
    for (const key of ["snapshotId", "evaluationQueryId", "datasetVersionId"] as const) {
      if (raw[key] !== undefined && (typeof raw[key] !== "string" || !raw[key].trim() || raw[key].length > 64)) {
        throw invalid(`${key} must be a non-empty string of at most 64 characters`);
      }
    }
    if (raw.queryText !== undefined && (typeof raw.queryText !== "string" || raw.queryText.length > 2000)) {
      throw invalid("queryText must be at most 2000 characters");
    }
    if (!Array.isArray(raw.stages)) throw invalid("stages are required");

    for (const stage of raw.stages) {
      if (!stage || typeof stage !== "object" || Array.isArray(stage)) throw invalid("Each stage must be an object");
      const stageRecord = stage as Record<string, unknown>;
      if (!Array.isArray(stageRecord.documents)) throw invalid("Each stage must contain a documents array");
      for (const doc of stageRecord.documents) {
        if (!doc || typeof doc !== "object" || Array.isArray(doc)) throw invalid("Each stage document must be an object");
        if ("documentKey" in doc || "canonicalUrl" in doc || "relevanceGrade" in doc || "relevanceMeaning" in doc) {
          throw invalid("Clients must not submit canonical document identity");
        }
      }
    }

    return raw as unknown as CreateInput;
  }

  private completeness(requested: TraceCompleteness | undefined, stages: EvaluationStageTrace[]): TraceCompleteness {
    if (requested === "invalid") throw invalid("Invalid traces cannot be persisted");
    if (requested) return requested;
    if (stages.length === 1 && stages[0].type === "final") return "final_only";
    return "partial";
  }

  private page(value: number | undefined, fallback: number, min: number, max: number) {
    const result = value ?? fallback;
    if (!Number.isInteger(result) || result < min || result > max) {
      throw invalid(`Pagination must be an integer between ${min} and ${max}`);
    }
    return result;
  }
}

export const evaluationStageTraceService = new EvaluationStageTraceService();
