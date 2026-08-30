import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  StrategyLab,
  buildStrategyExecutionInput,
  latestExecution,
  missingExecutionCoverage,
  parseRankedResultUrls,
  submitStrategyExecution,
} from "../StrategyLab";
import type { EvaluationStrategy, StrategyExecution } from "@/types/evaluation-strategy";

const strategy = (id: string, name: string): EvaluationStrategy => ({
  id,
  name,
  type: "external",
  description: "",
  provider: null,
  model: null,
  configuration: {},
  configHash: id.repeat(64).slice(0, 64),
  latencyType: "end_to_end",
  status: "active",
  executionCount: 1,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  createdByUserId: "owner",
  archivedAt: null,
});

const query = (id: string, name: string) => ({
  id,
  datasetVersionId: "d",
  sourceQueryId: `source-${id}`,
  queryKey: `key-${id}`,
  name,
  queryText: name,
  category: "other",
  filters: { numResults: 50 },
  configHash: id.repeat(64).slice(0, 64),
  createdAt: new Date("2026-01-01T00:00:00Z"),
  createdByUserId: "owner",
});

const execution = (
  id: string,
  strategyId: string,
  evaluationQueryId: string,
  createdAt: string,
  resultCount = 50,
): StrategyExecution => ({
  id,
  strategyId,
  datasetVersionId: "d",
  evaluationQueryId,
  sourceQueryId: `source-${evaluationQueryId}`,
  queryText: evaluationQueryId,
  source: "imported",
  configHash: strategyId.repeat(64).slice(0, 64),
  requestedResultCount: resultCount,
  resultCount,
  latencyMs: 115,
  latencyType: "end_to_end",
  stageTraceId: null,
  providerMetadata: {},
  duplicateCanonicalResultsIgnored: 0,
  documents: [],
  createdAt: new Date(createdAt),
  createdByUserId: "owner",
});

function renderLab(executions: StrategyExecution[] = [], benchmark?: never) {
  return renderToStaticMarkup(
    <StrategyLab
      strategies={[strategy("a", "Exa baseline"), strategy("b", "Weaviate Dense")]}
      queries={[query("q", "cheep")] as never}
      executions={executions}
      benchmark={benchmark}
      onCreate={async () => {}}
      onCreateExecution={async () => {}}
      onBenchmark={async () => {}}
    />,
  );
}

describe("StrategyLab execution imports", () => {
  test("renders the execution form with strategy and frozen-query choices", () => {
    const html = renderLab();
    expect(html).toContain("Strategy Executions");
    expect(html).toContain("Execution strategy");
    expect(html).toContain("Execution benchmark query");
    expect(html).toContain("Exa baseline");
    expect(html).toContain("Weaviate Dense");
    expect(html).toContain("cheep");
    expect(html).toContain("Ranked result URLs");
    expect(html).toContain("Save Execution");
  });

  test("converts multiline URLs in order and ignores blank lines", () => {
    expect(parseRankedResultUrls("https://one.test\n\n https://two.test \r\n")).toEqual([
      { url: "https://one.test" },
      { url: "https://two.test" },
    ]);
  });

  test("prevents an empty result list", () => {
    expect(() =>
      buildStrategyExecutionInput({
        strategyId: "a",
        evaluationQueryId: "q",
        source: "imported",
        rankedUrls: " \n ",
        requestedResultCount: "",
        latencyMs: "",
        providerMetadata: "",
      }),
    ).toThrow("Add at least one ranked result URL");
  });

  test("calls execution creation with the expected authoritative-safe payload", async () => {
    const onCreateExecution = jest.fn().mockResolvedValue(undefined);
    const input = await submitStrategyExecution(
      {
        strategyId: "a",
        evaluationQueryId: "q",
        source: "imported",
        rankedUrls: "https://one.test\nhttps://two.test",
        requestedResultCount: "50",
        latencyMs: "115",
        providerMetadata: '{"region":"us"}',
      },
      onCreateExecution,
    );
    expect(onCreateExecution).toHaveBeenCalledWith({
      strategyId: "a",
      evaluationQueryId: "q",
      source: "imported",
      results: [{ url: "https://one.test" }, { url: "https://two.test" }],
      requestedResultCount: 50,
      latencyMs: 115,
      providerMetadata: { region: "us" },
    });
    expect(input).not.toHaveProperty("rank");
    expect(input).not.toHaveProperty("configHash");
  });

  test("displays existing execution coverage", () => {
    const html = renderLab([execution("e1", "a", "q", "2026-01-01T00:00:00Z")]);
    expect(html).toContain("Exa baseline × cheep");
    expect(html).toContain("Execution available");
    expect(html).toContain("1 saved execution");
    expect(html).toContain("Latest: 50 results · imported · 115 ms");
    expect(html).toContain("Weaviate Dense × cheep");
    expect(html).toContain("No execution yet");
  });

  test("uses the most recent immutable execution", () => {
    const older = execution("old", "a", "q", "2026-01-01T00:00:00Z", 10);
    const newer = execution("new", "a", "q", "2026-02-01T00:00:00Z", 20);
    expect(latestExecution([newer, older], "a", "q")?.id).toBe("new");
    const html = renderLab([older, newer]);
    expect(html).toContain("2 saved executions");
    expect(html).toContain("Latest: 20 results");
  });

  test("reports missing strategy-query execution coverage", () => {
    const executions = [execution("e1", "a", "q", "2026-01-01T00:00:00Z")];
    expect(missingExecutionCoverage(executions, ["a", "b"], ["q"])).toEqual([
      { strategyId: "b", queryId: "q" },
    ]);
  });
});

describe("StrategyLab benchmark UI", () => {
  test("still renders benchmark leaderboard and pairwise regressions", () => {
    const strategies = [strategy("a", "Dense"), strategy("b", "Hybrid")];
    const metric = (value: number) => ({ value, available: true, numerator: 1, denominator: 1 });
    const aggregate = {
      queryCount: 1,
      mrr: metric(0.8),
      byCutoff: [{ cutoff: 10, meanNdcg: metric(0.7), meanBenchmarkRecall: metric(0.8), meanHit: metric(1), meanJudgedPrecision: metric(0.6), meanJudgmentCoverage: metric(0.5) }],
    };
    const benchmark = {
      benchmarkPolicyVersion: "1", metricVersion: "1", datasetVersionId: "d", strategyIds: ["a", "b"], evaluationQueryIds: ["q"], cutoffs: [10],
      results: strategies.map((item, index) => ({ strategy: item, executionIds: [`e${index}`], aggregate, queries: [], latency: { available: true, latencyType: "end_to_end", count: 1, mean: 20 + index, median: 20 + index, p95: 30 + index, min: 20 + index, max: 30 + index }, errors: { hardNegativeCandidateCount: index, highCriticalCount: 0, top5Grade0Count: 0, outranksGrade2Count: 0, queriesWithHighCritical: 0, candidateRatePerQuery: index, highCriticalQueryRate: 0 }, stage: { available: index === 0, candidateBenchmarkRecall: null, finalBenchmarkRecall: null, candidateToFinalRetention: null, grade2Survival: null, downstreamRelevantLoss: null, irrelevantDownstreamPromotions: 0, warning: index ? "Stage comparison unavailable" : null }, warnings: [] })),
      comparisons: [{ strategyAId: "a", strategyBId: "b", primaryMetric: "nDCG@10", wins: 1, losses: 1, ties: 0, unavailable: 0, comparableQueries: 2, winRate: 0.5, lossRate: 0.5, metricDelta: 0.1, latencyDeltaMs: 1, hardNegativeDelta: 1, queryOutcomes: [], largestWins: [], largestLosses: [{ evaluationQueryId: "r", queryText: "query regression", metric: "nDCG@10", before: 0.8, after: 0.5, delta: -0.3, outcome: "loss" }], warnings: [] }],
      leaderboardStrategyIds: ["a", "b"], leaderboardLabel: "Highest nDCG@10", warnings: [], persisted: false, createdAt: new Date(), createdByUserId: "owner",
    };
    const html = renderToStaticMarkup(<StrategyLab strategies={strategies} queries={[query("q", "Query")] as never} executions={[execution("e1", "a", "q", "2026-01-01T00:00:00Z"), execution("e2", "b", "q", "2026-01-01T00:00:00Z")]} benchmark={benchmark as never} onCreate={async () => {}} onCreateExecution={async () => {}} onBenchmark={async () => {}} />);
    expect(html).toContain("Highest nDCG@10");
    expect(html).toContain("p95 latency");
    expect(html).toContain("Hard negatives");
    expect(html).toContain("Biggest regressions");
    expect(html).toContain("query regression");
    expect(html).not.toContain(">Best strategy<");
  });
});
