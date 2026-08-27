import type {
  EvaluationDatasetDetail,
  EvaluationDatasetVersion,
  EvaluationQueryJudgments,
  RelevanceGrade,
} from "@/types/evaluation";
import type { QueryConfig, RankingSnapshot } from "@/types/type";
import type {
  EvaluationMetricsResponse,
  SnapshotSelection,
} from "@/app/services/evaluation/metrics/types";
import type { EvaluationRun, EvaluationRunList } from "@/types/evaluation-runs";
import type { EvaluationRunComparison } from "@/types/evaluation-comparison";
import type {
  EvaluationExecutionTrace,
  EvaluationStageTraceList,
} from "@/types/evaluation-stage-trace";
import type { StageDiagnosisResult } from "@/types/evaluation-stage-diagnosis";
import type { HardNegativeAnalysis } from "@/types/evaluation-hard-negatives";
import type {
  EvaluationStrategy,
  StrategyBenchmark,
  StrategyExecution,
} from "@/types/evaluation-strategy";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body as T;
}
export const evaluationApi = {
  list: () => request<{ datasets: EvaluationDatasetVersion[] }>("/api/evaluation/datasets"),
  detail: (id: string) => request<EvaluationDatasetDetail>(`/api/evaluation/datasets/${id}`),
  create: (input: { name: string; description?: string }) =>
    request<EvaluationDatasetVersion>("/api/evaluation/datasets", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  queries: () => request<QueryConfig[]>("/api/queries"),
  addQueries: (id: string, queryIds: string[]) =>
    request(`/api/evaluation/datasets/${id}/queries`, {
      method: "POST",
      body: JSON.stringify({ queryIds }),
    }),
  snapshots: (queryId: string) =>
    request<RankingSnapshot[]>(`/api/snapshots?queryId=${encodeURIComponent(queryId)}&limit=100`),
  judgments: (id: string, queryId: string) =>
    request<EvaluationQueryJudgments>(
      `/api/evaluation/datasets/${id}/queries/${queryId}/judgments`,
    ),
  saveJudgments: (
    id: string,
    queryId: string,
    snapshotId: string,
    labels: Array<{ resultUrl: string; grade: RelevanceGrade }>,
  ) =>
    request<EvaluationQueryJudgments>(
      `/api/evaluation/datasets/${id}/queries/${queryId}/judgments`,
      { method: "PUT", body: JSON.stringify({ snapshotId, labels }) },
    ),
  adjudicate: (id: string, judgmentId: string, grade: RelevanceGrade, rationale: string) =>
    request(`/api/evaluation/datasets/${id}/judgments/${judgmentId}/adjudicate`, {
      method: "POST",
      body: JSON.stringify({ grade, rationale }),
    }),
  freeze: (id: string) =>
    request<EvaluationDatasetDetail>(`/api/evaluation/datasets/${id}/freeze`, { method: "POST" }),
  clone: (id: string) =>
    request<EvaluationDatasetDetail>(`/api/evaluation/datasets/${id}/clone`, { method: "POST" }),
  metrics: (id: string, snapshots: SnapshotSelection[], cutoffs: number[] = [5, 10]) =>
    request<EvaluationMetricsResponse>(`/api/evaluation/datasets/${id}/metrics`, {
      method: "POST",
      body: JSON.stringify({ cutoffs, snapshots }),
    }),
  saveRun: (id: string, snapshots: SnapshotSelection[], cutoffs: number[] = [5, 10]) =>
    request<EvaluationRun>(`/api/evaluation/datasets/${id}/runs`, {
      method: "POST",
      body: JSON.stringify({ cutoffs, snapshots }),
    }),
  runs: (id: string, limit = 20, offset = 0) =>
    request<EvaluationRunList>(
      `/api/evaluation/datasets/${id}/runs?limit=${limit}&offset=${offset}`,
    ),
  runDetail: (id: string, runId: string) =>
    request<EvaluationRun>(`/api/evaluation/datasets/${id}/runs/${runId}`),
  compareRuns: (id: string, beforeRunId: string, afterRunId: string) =>
    request<EvaluationRunComparison>(`/api/evaluation/datasets/${id}/comparisons`, {
      method: "POST",
      body: JSON.stringify({ beforeRunId, afterRunId }),
    }),
  stageTraces: (filters: Record<string, string> = {}) =>
    request<EvaluationStageTraceList>(
      `/api/evaluation/stage-traces?${new URLSearchParams(filters)}`,
    ),
  stageTrace: (id: string) =>
    request<EvaluationExecutionTrace>(`/api/evaluation/stage-traces/${id}`),
  stageDiagnosis: (id: string) =>
    request<StageDiagnosisResult>(`/api/evaluation/stage-traces/${id}/diagnosis`),
  strategies: (includeArchived = false) =>
    request<{ strategies: EvaluationStrategy[] }>(
      `/api/evaluation/strategies?includeArchived=${includeArchived}`,
    ),
  createStrategy: (input: unknown) =>
    request<EvaluationStrategy>("/api/evaluation/strategies", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  strategy: (id: string) => request<EvaluationStrategy>(`/api/evaluation/strategies/${id}`),
  archiveStrategy: (id: string) =>
    request<EvaluationStrategy>(`/api/evaluation/strategies/${id}/archive`, { method: "POST" }),
  createStrategyExecution: (datasetId: string, input: unknown) =>
    request<StrategyExecution>(`/api/evaluation/datasets/${datasetId}/strategy-executions`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  strategyExecutions: (datasetId: string, filters: Record<string, string> = {}) =>
    request<{ executions: StrategyExecution[] }>(
      `/api/evaluation/datasets/${datasetId}/strategy-executions?${new URLSearchParams(filters)}`,
    ),
  runStrategyBenchmark: (datasetId: string, input: unknown) =>
    request<StrategyBenchmark>(`/api/evaluation/datasets/${datasetId}/strategy-benchmarks`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  hardNegatives: (datasetId: string, filters: Record<string, string> = {}) =>
    request<HardNegativeAnalysis>(
      `/api/evaluation/datasets/${datasetId}/hard-negatives?${new URLSearchParams(filters)}`,
    ),
  createStageTrace: (input: unknown) =>
    request<EvaluationExecutionTrace>("/api/evaluation/stage-traces", {
      method: "POST",
      body: JSON.stringify(input),
    }),
};