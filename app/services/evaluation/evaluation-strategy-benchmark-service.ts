import type { RelevanceGrade, RelevanceJudgment } from "@/types/evaluation";
import type {
  StrategyBenchmark,
  StrategyBenchmarkResult,
  StrategyQueryResult,
  StrategyStageSummary,
} from "@/types/evaluation-strategy";
import { STRATEGY_BENCHMARK_POLICY_VERSION } from "@/types/evaluation-strategy";
import { getDocumentIdentity } from "@/utils/canonicalize-document-url";
import {
  evaluationDatasetService,
  type EvaluationDatasetService,
} from "./evaluation-dataset-service";
import {
  evaluationStrategyService,
  type EvaluationStrategyService,
} from "./evaluation-strategy-service";
import {
  relevanceJudgmentService,
  type RelevanceJudgmentService,
} from "./relevance-judgment-service";
import {
  evaluationStageDiagnosisService,
  type EvaluationStageDiagnosisService,
} from "./evaluation-stage-diagnosis-service";
import { aggregateEvaluation, evaluateAtCutoff, reciprocalRank } from "./metrics/calculations";
import {
  EVALUATION_METRIC_VERSION,
  type PerQueryEvaluationResult,
  type RankedEvaluationItem,
} from "./metrics/types";
import {
  aggregateStage,
  compareStrategies,
  errorSummary,
  latencySummary,
} from "./evaluation-strategy-calculations";
import { STRATEGY_BENCHMARK_POLICY as POLICY } from "./strategy-benchmark-policy";
import { EvaluationError, invalid } from "./evaluation-errors";
interface Selection {
  strategyId: string;
  evaluationQueryId: string;
  executionId: string;
}
const unavailableStage = (warning: string): StrategyStageSummary => ({
  available: false,
  candidateBenchmarkRecall: null,
  finalBenchmarkRecall: null,
  candidateToFinalRetention: null,
  grade2Survival: null,
  downstreamRelevantLoss: null,
  irrelevantDownstreamPromotions: 0,
  warning,
});
export class EvaluationStrategyBenchmarkService {
  constructor(
    private readonly datasets: EvaluationDatasetService = evaluationDatasetService,
    private readonly strategies: EvaluationStrategyService = evaluationStrategyService,
    private readonly judgments: RelevanceJudgmentService = relevanceJudgmentService,
    private readonly diagnosis: EvaluationStageDiagnosisService = evaluationStageDiagnosisService,
  ) {}
  async benchmark(userId: string, datasetId: string, input: unknown): Promise<StrategyBenchmark> {
    const parsed = this.input(input),
      detail = await this.datasets.getDatasetDetail(userId, datasetId);
    if (detail.dataset.status !== "frozen")
      throw new EvaluationError(
        "DATASET_NOT_FROZEN",
        "Strategy benchmarks require a frozen dataset",
        409,
      );
    const queryById = new Map(detail.queries.map(query => [query.id, query]));
    for (const id of parsed.evaluationQueryIds)
      if (!queryById.has(id))
        throw new EvaluationError("NOT_FOUND", "Benchmark query is not in the frozen dataset", 404);
    const strategies = await Promise.all(
      parsed.strategyIds.map(id => this.strategies.getStrategy(userId, id)),
    );
    if (strategies.some(strategy => strategy.status !== "active"))
      throw new EvaluationError("INVALID_STATE", "Archived strategies cannot be benchmarked", 409);
    const selections = new Map(
        (parsed.executionSelections ?? []).map(item => [
          `${item.strategyId}:${item.evaluationQueryId}`,
          item.executionId,
        ]),
      ),
      truthCache = new Map<string, Map<string, RelevanceGrade>>(),
      results: StrategyBenchmarkResult[] = [],
      warnings: string[] = [];
    for (const strategy of strategies) {
      const queries: StrategyQueryResult[] = [],
        executionIds: string[] = [];
      for (const evaluationQueryId of parsed.evaluationQueryIds) {
        const query = queryById.get(evaluationQueryId)!,
          key = `${strategy.id}:${evaluationQueryId}`;
        let execution;
        if (selections.has(key)) {
          execution = await this.strategies.getExecution(userId, selections.get(key)!);
        } else {
          const available = await this.strategies.listExecutions(
            userId,
            datasetId,
            strategy.id,
            evaluationQueryId,
          );
          if (available.length !== 1)
            throw new EvaluationError(
              "INVALID_STATE",
              available.length
                ? `Strategy ${strategy.id} has ambiguous executions for query ${evaluationQueryId}; select one explicitly.`
                : `Strategy ${strategy.id} is missing an execution for query ${evaluationQueryId}.`,
              409,
            );
          execution = available[0];
        }
        if (
          execution.strategyId !== strategy.id ||
          execution.datasetVersionId !== datasetId ||
          execution.evaluationQueryId !== evaluationQueryId ||
          execution.sourceQueryId !== query.sourceQueryId ||
          execution.configHash !== strategy.configHash
        )
          throw new EvaluationError(
            "INVALID_STATE",
            "Strategy execution provenance is incompatible with benchmark",
            409,
          );
        executionIds.push(execution.id);
        let truth = truthCache.get(evaluationQueryId);
        if (!truth) {
          const accepted = await this.judgments.getAcceptedJudgmentsForEvaluationQuery(
            userId,
            datasetId,
            evaluationQueryId,
          );
          truth = this.truth(accepted, datasetId, evaluationQueryId, query.sourceQueryId);
          truthCache.set(evaluationQueryId, truth);
        }
        const ranked: RankedEvaluationItem[] = execution.documents.map(document => ({
            documentKey: document.documentKey,
            rank: document.rank,
            grade: truth!.get(document.documentKey) ?? null,
          })),
          knownRelevant = new Map([...truth].filter(([, grade]) => grade >= 1)),
          metrics = parsed.cutoffs.map(cutoff =>
            evaluateAtCutoff(
              ranked,
              knownRelevant,
              execution.duplicateCanonicalResultsIgnored,
              cutoff,
            ),
          ),
          queryWarnings: string[] = [];
        if (!truth.size) queryWarnings.push("No accepted judgments exist for this query.");
        if (!knownRelevant.size)
          queryWarnings.push("No accepted relevant benchmark documents exist for this query.");
        const perQuery: PerQueryEvaluationResult = {
            datasetVersionId: datasetId,
            evaluationQueryId,
            sourceQueryId: query.sourceQueryId,
            snapshotId: execution.id,
            metricVersion: EVALUATION_METRIC_VERSION,
            eligible: truth.size > 0 && knownRelevant.size > 0,
            reciprocalRank: reciprocalRank(ranked),
            metrics,
            warnings: queryWarnings,
          },
          grade2Ranks = ranked.filter(item => item.grade === 2).map(item => item.rank),
          grade0 = ranked.filter(item => item.grade === 0),
          hard = grade0.filter(
            item => item.rank <= 10 || grade2Ranks.some(rank => rank > item.rank),
          ),
          high = hard.filter(
            item => item.rank <= 3 || grade2Ranks.filter(rank => rank > item.rank).length > 0,
          );
        let stageSummary = unavailableStage(
          "No compatible stage trace is linked to this execution.",
        );
        if (execution.stageTraceId)
          try {
            const value = await this.diagnosis.diagnose(userId, execution.stageTraceId),
              candidate = value.stages.find(
                stage => stage.stageType === "candidate" || stage.stageType === "retrieval",
              ),
              final = value.stages.find(stage => stage.stageType === "final"),
              grade2 = value.transitions.flatMap(t =>
                t.grade2SurvivalRate === null ? [] : [t.grade2SurvivalRate],
              ),
              loss = value.transitions.flatMap(t =>
                t.relevantLossRate === null ? [] : [t.relevantLossRate],
              );
            stageSummary = {
              available: true,
              candidateBenchmarkRecall: candidate?.stageBenchmarkRecall.value ?? null,
              finalBenchmarkRecall: final?.stageBenchmarkRecall.value ?? null,
              candidateToFinalRetention: value.candidateToFinal.retentionRate,
              grade2Survival: grade2.length ? Math.min(...grade2) : null,
              downstreamRelevantLoss: loss.length ? Math.max(...loss) : null,
              irrelevantDownstreamPromotions: 0,
              warning: null,
            };
          } catch (error) {
            stageSummary = unavailableStage(
              error instanceof Error ? error.message : "Stage diagnosis unavailable",
            );
          }
        queries.push({
          evaluationQueryId,
          queryText: query.queryText,
          executionId: execution.id,
          metrics: perQuery,
          latencyMs: execution.latencyMs,
          hardNegativeCount: hard.length,
          highCriticalHardNegativeCount: high.length,
          top5Grade0Count: grade0.filter(item => item.rank <= 5).length,
          grade0OutranksGrade2Count: grade0.filter(item =>
            grade2Ranks.some(rank => rank > item.rank),
          ).length,
          stageSummary,
        });
      }
      const aggregate = aggregateEvaluation(
          queries.map(query => query.metrics),
          parsed.cutoffs,
        ),
        stage = aggregateStage(queries.map(query => query.stageSummary)),
        latency = latencySummary(
          queries.map(query => query.latencyMs),
          strategy.latencyType,
        ),
        strategyWarnings = [...aggregate.warnings];
      if (!stage.available) strategyWarnings.push(stage.warning!);
      results.push({
        strategy,
        executionIds,
        aggregate,
        queries,
        latency,
        errors: errorSummary(queries),
        stage,
        warnings: [...new Set(strategyWarnings)],
      });
    }
    const comparisons = [];
    for (let i = 0; i < results.length; i++)
      for (let j = i + 1; j < results.length; j++)
        comparisons.push(compareStrategies(results[i], results[j]));
    if (new Set(results.map(result => result.latency.latencyType)).size > 1)
      warnings.push(
        "Strategies use incompatible latency types; cross-strategy latency deltas are unavailable.",
      );
    const leaderboard = [...results]
      .sort(
        (a, b) =>
          (b.aggregate.byCutoff.find(x => x.cutoff === 10)?.meanNdcg.value ?? -1) -
          (a.aggregate.byCutoff.find(x => x.cutoff === 10)?.meanNdcg.value ?? -1),
      )
      .map(result => result.strategy.id);
    return {
      benchmarkPolicyVersion: STRATEGY_BENCHMARK_POLICY_VERSION,
      metricVersion: EVALUATION_METRIC_VERSION,
      datasetVersionId: datasetId,
      strategyIds: parsed.strategyIds,
      evaluationQueryIds: parsed.evaluationQueryIds,
      cutoffs: parsed.cutoffs,
      results,
      comparisons,
      leaderboardStrategyIds: leaderboard,
      leaderboardLabel: "Highest nDCG@10",
      warnings,
      persisted: false,
      createdAt: new Date(),
      createdByUserId: userId,
    };
  }
  private truth(
    judgments: RelevanceJudgment[],
    datasetId: string,
    queryId: string,
    sourceQueryId: string,
  ) {
    const truth = new Map<string, RelevanceGrade>();
    for (const judgment of judgments) {
      if (
        judgment.status !== "accepted" ||
        judgment.relevanceGrade === null ||
        judgment.datasetVersionId !== datasetId ||
        judgment.evaluationQueryId !== queryId ||
        judgment.sourceQueryId !== sourceQueryId
      )
        throw new EvaluationError(
          "INVALID_STATE",
          "Accepted judgment provenance is malformed",
          409,
        );
      const identity = getDocumentIdentity(judgment.canonicalUrl);
      if (
        identity.documentKey !== judgment.documentKey ||
        identity.canonicalUrl !== judgment.canonicalUrl ||
        truth.has(judgment.documentKey)
      )
        throw new EvaluationError(
          "INVALID_STATE",
          "Accepted judgment canonical identity is malformed",
          409,
        );
      truth.set(judgment.documentKey, judgment.relevanceGrade);
    }
    return truth;
  }
  private input(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw invalid("Benchmark input must be an object");
    const raw = value as Record<string, unknown>,
      allowed = ["strategyIds", "evaluationQueryIds", "cutoffs", "executionSelections"];
    if (Object.keys(raw).some(key => !allowed.includes(key)))
      throw invalid("Benchmark input contains unsupported fields; clients cannot submit metrics");
    if (
      !Array.isArray(raw.strategyIds) ||
      raw.strategyIds.length < POLICY.minimumStrategies ||
      raw.strategyIds.length > POLICY.maximumStrategies ||
      raw.strategyIds.some(id => typeof id !== "string" || !id.trim()) ||
      new Set(raw.strategyIds).size !== raw.strategyIds.length
    )
      throw invalid("strategyIds must contain 2-10 unique IDs");
    if (
      !Array.isArray(raw.evaluationQueryIds) ||
      !raw.evaluationQueryIds.length ||
      raw.evaluationQueryIds.some(id => typeof id !== "string" || !id.trim()) ||
      new Set(raw.evaluationQueryIds).size !== raw.evaluationQueryIds.length
    )
      throw invalid("evaluationQueryIds must be a non-empty unique cohort");
    const cutoffs = raw.cutoffs ?? POLICY.cutoffs;
    if (
      !Array.isArray(cutoffs) ||
      !cutoffs.length ||
      cutoffs.some(k => !Number.isInteger(k) || Number(k) <= 0 || Number(k) > 100)
    )
      throw invalid("cutoffs must be positive integers <= 100");
    let executionSelections: Selection[] | undefined;
    if (raw.executionSelections !== undefined) {
      if (!Array.isArray(raw.executionSelections))
        throw invalid("executionSelections must be an array");
      executionSelections = raw.executionSelections.map(item => {
        if (!item || typeof item !== "object" || Array.isArray(item))
          throw invalid("execution selection is malformed");
        const selection = item as Record<string, unknown>;
        if (
          Object.keys(selection).some(
            key => !["strategyId", "evaluationQueryId", "executionId"].includes(key),
          ) ||
          [selection.strategyId, selection.evaluationQueryId, selection.executionId].some(
            v => typeof v !== "string" || !v.trim(),
          )
        )
          throw invalid("execution selection is malformed");
        return selection as unknown as Selection;
      });
      if (
        new Set(executionSelections.map(s => `${s.strategyId}:${s.evaluationQueryId}`)).size !==
        executionSelections.length
      )
        throw invalid("execution selections contain duplicates");
    }
    return {
      strategyIds: raw.strategyIds as string[],
      evaluationQueryIds: raw.evaluationQueryIds as string[],
      cutoffs: [...new Set(cutoffs.map(Number))].sort((a, b) => a - b),
      executionSelections,
    };
  }
}
export const evaluationStrategyBenchmarkService = new EvaluationStrategyBenchmarkService();
