"use client";
import { useState } from "react";
import type {
  EvaluationStrategy,
  StrategyBenchmark,
  StrategyExecution,
  StrategyExecutionSource,
  StrategyType,
  StrategyLatencyType,
} from "@/types/evaluation-strategy";
import type { EvaluationQuery } from "@/types/evaluation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
const metric = (value: number | null | undefined) =>
    value === null || value === undefined ? "Unavailable" : value.toFixed(3),
  ms = (value: number | null) => (value === null ? "Unavailable" : `${value.toFixed(1)} ms`);

export interface StrategyExecutionFormValues {
  strategyId: string;
  evaluationQueryId: string;
  source: StrategyExecutionSource;
  rankedUrls: string;
  requestedResultCount: string;
  latencyMs: string;
  providerMetadata: string;
}

export function parseRankedResultUrls(value: string) {
  return value
    .split(/\r?\n/)
    .map(url => url.trim())
    .filter(Boolean)
    .map(url => ({ url }));
}

export function buildStrategyExecutionInput(values: StrategyExecutionFormValues) {
  const results = parseRankedResultUrls(values.rankedUrls);
  if (!values.strategyId) throw new Error("Choose a strategy");
  if (!values.evaluationQueryId) throw new Error("Choose a frozen benchmark query");
  if (!results.length) throw new Error("Add at least one ranked result URL");

  const requestedResultCount = values.requestedResultCount.trim()
    ? Number(values.requestedResultCount)
    : undefined;
  if (
    requestedResultCount !== undefined &&
    (!Number.isInteger(requestedResultCount) || requestedResultCount < 1)
  ) {
    throw new Error("Requested result count must be a positive integer");
  }
  const latencyMs = values.latencyMs.trim() ? Number(values.latencyMs) : undefined;
  if (latencyMs !== undefined && (!Number.isFinite(latencyMs) || latencyMs < 0)) {
    throw new Error("Latency must be a non-negative number");
  }

  let providerMetadata: Record<string, unknown> | undefined;
  if (values.providerMetadata.trim()) {
    const parsed: unknown = JSON.parse(values.providerMetadata);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Provider metadata must be a JSON object");
    }
    providerMetadata = parsed as Record<string, unknown>;
  }

  return {
    strategyId: values.strategyId,
    evaluationQueryId: values.evaluationQueryId,
    source: values.source,
    results,
    ...(requestedResultCount === undefined ? {} : { requestedResultCount }),
    ...(latencyMs === undefined ? {} : { latencyMs }),
    ...(providerMetadata === undefined ? {} : { providerMetadata }),
  };
}

export async function submitStrategyExecution(
  values: StrategyExecutionFormValues,
  onCreateExecution: (input: unknown) => Promise<void>,
) {
  const input = buildStrategyExecutionInput(values);
  await onCreateExecution(input);
  return input;
}

function executionTimestamp(execution: StrategyExecution) {
  return new Date(execution.createdAt).getTime();
}

export function latestExecution(
  executions: StrategyExecution[],
  strategyId: string,
  evaluationQueryId: string,
) {
  return executions
    .filter(
      execution =>
        execution.strategyId === strategyId &&
        execution.evaluationQueryId === evaluationQueryId,
    )
    .sort((a, b) => executionTimestamp(b) - executionTimestamp(a))[0];
}

export function missingExecutionCoverage(
  executions: StrategyExecution[],
  strategyIds: string[],
  evaluationQueryIds: string[],
) {
  return strategyIds.flatMap(strategyId =>
    evaluationQueryIds
      .filter(queryId => !latestExecution(executions, strategyId, queryId))
      .map(queryId => ({ strategyId, queryId })),
  );
}
export function StrategyLab({
  strategies,
  queries,
  executions,
  benchmark,
  onCreate,
  onCreateExecution,
  onBenchmark,
  loading,
}: {
  strategies: EvaluationStrategy[];
  queries: EvaluationQuery[];
  executions: StrategyExecution[];
  benchmark?: StrategyBenchmark;
  onCreate: (input: unknown) => Promise<void>;
  onCreateExecution: (input: unknown) => Promise<void>;
  onBenchmark: (input: unknown) => Promise<void>;
  loading?: boolean;
}) {
  const [name, setName] = useState(""),
    [type, setType] = useState<StrategyType>("external"),
    [latencyType, setLatencyType] = useState<StrategyLatencyType>("end_to_end"),
    [strategyIds, setStrategyIds] = useState<string[]>([]),
    [queryIds, setQueryIds] = useState<string[]>([]),
    [executionStrategyId, setExecutionStrategyId] = useState(""),
    [executionQueryId, setExecutionQueryId] = useState(""),
    [executionSource, setExecutionSource] = useState<StrategyExecutionSource>("imported"),
    [requestedResultCount, setRequestedResultCount] = useState(""),
    [executionLatencyMs, setExecutionLatencyMs] = useState(""),
    [rankedUrls, setRankedUrls] = useState(""),
    [providerMetadata, setProviderMetadata] = useState(""),
    [executionError, setExecutionError] = useState("");
  const activeStrategies = strategies.filter(strategy => strategy.status === "active"),
    selectedCoverage = missingExecutionCoverage(executions, strategyIds, queryIds);
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Strategy Lab</h1>
        <p className="text-muted-foreground">
          Compare quality, latency, hard-negative behavior, and available stage evidence on one
          frozen benchmark. No combined score or universal “best” claim is produced.
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Register Strategy</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <Input
            aria-label="Strategy name"
            value={name}
            onChange={event => setName(event.target.value)}
            placeholder="Strategy name"
          />
          <Select value={type} onValueChange={value => setType(value as StrategyType)}>
            <SelectTrigger aria-label="Strategy type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["keyword", "dense", "hybrid", "reranked", "external", "custom"].map(value => (
                <SelectItem value={value} key={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={latencyType}
            onValueChange={value => setLatencyType(value as StrategyLatencyType)}
          >
            <SelectTrigger aria-label="Latency type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["end_to_end", "retrieval_only", "rerank_only", "custom"].map(value => (
                <SelectItem value={value} key={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            disabled={!name || loading}
            onClick={async () => {
              await onCreate({ name, type, latencyType, configuration: {} });
              setName("");
            }}
          >
            Create Strategy
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Strategy Executions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2">
            <Select value={executionStrategyId} onValueChange={setExecutionStrategyId}>
              <SelectTrigger aria-label="Execution strategy">
                <SelectValue placeholder="Choose strategy" />
              </SelectTrigger>
              <SelectContent>
                {activeStrategies.map(strategy => (
                  <SelectItem value={strategy.id} key={strategy.id}>
                    {strategy.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={executionQueryId} onValueChange={setExecutionQueryId}>
              <SelectTrigger aria-label="Execution benchmark query">
                <SelectValue placeholder="Choose frozen benchmark query" />
              </SelectTrigger>
              <SelectContent>
                {queries.map(query => (
                  <SelectItem value={query.id} key={query.id}>
                    {query.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={executionSource}
              onValueChange={value => setExecutionSource(value as StrategyExecutionSource)}
            >
              <SelectTrigger aria-label="Execution source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="imported">Imported</SelectItem>
                <SelectItem value="native">Native</SelectItem>
              </SelectContent>
            </Select>
            <Input
              aria-label="Requested result count"
              type="number"
              min={1}
              value={requestedResultCount}
              onChange={event => setRequestedResultCount(event.target.value)}
              placeholder="Requested result count (optional)"
            />
            <Input
              aria-label="Execution latency in milliseconds"
              type="number"
              min={0}
              step="any"
              value={executionLatencyMs}
              onChange={event => setExecutionLatencyMs(event.target.value)}
              placeholder="Latency in ms (optional)"
            />
            <Input
              aria-label="Provider metadata"
              value={providerMetadata}
              onChange={event => setProviderMetadata(event.target.value)}
              placeholder='Provider metadata JSON (optional), e.g. {"region":"us"}'
            />
          </div>
          <Textarea
            aria-label="Ranked result URLs"
            value={rankedUrls}
            onChange={event => setRankedUrls(event.target.value)}
            placeholder={"One URL per line, in ranking order\nhttps://example.com/result-1\nhttps://example.com/result-2"}
            rows={8}
          />
          <p className="text-sm text-muted-foreground">
            Line order defines ranking. The server derives ranks, canonical URLs, and document
            identities.
          </p>
          {executionError && <p className="text-sm text-destructive">{executionError}</p>}
          <Button
            disabled={
              loading ||
              !executionStrategyId ||
              !executionQueryId ||
              parseRankedResultUrls(rankedUrls).length === 0
            }
            onClick={async () => {
              try {
                setExecutionError("");
                await submitStrategyExecution(
                  {
                    strategyId: executionStrategyId,
                    evaluationQueryId: executionQueryId,
                    source: executionSource,
                    rankedUrls,
                    requestedResultCount,
                    latencyMs: executionLatencyMs,
                    providerMetadata,
                  },
                  onCreateExecution,
                );
                setRankedUrls("");
                setRequestedResultCount("");
                setExecutionLatencyMs("");
                setProviderMetadata("");
              } catch (error) {
                setExecutionError(
                  error instanceof Error ? error.message : "Strategy execution creation failed",
                );
              }
            }}
          >
            Save Execution
          </Button>
          <div className="space-y-3">
            <strong>Execution coverage</strong>
            {activeStrategies.flatMap(strategy =>
              queries.map(query => {
                const matching = executions.filter(
                    execution =>
                      execution.strategyId === strategy.id &&
                      execution.evaluationQueryId === query.id,
                  ),
                  latest = latestExecution(executions, strategy.id, query.id);
                return (
                  <div className="rounded-md border p-3 text-sm" key={`${strategy.id}-${query.id}`}>
                    <p className="font-medium">
                      {strategy.name} × {query.name}
                    </p>
                    {latest ? (
                      <>
                        <p className="text-green-700">Execution available</p>
                        <p>
                          {matching.length} saved execution{matching.length === 1 ? "" : "s"}
                        </p>
                        <p>
                          Latest: {latest.resultCount} results · {latest.source} ·{" "}
                          {latest.latencyMs === null ? "latency unavailable" : `${latest.latencyMs} ms`}
                        </p>
                      </>
                    ) : (
                      <p className="text-muted-foreground">No execution yet</p>
                    )}
                  </div>
                );
              }),
            )}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Benchmark Selector</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <strong>Strategies (2–10)</strong>
            {strategies.length === 0 && (
              <p className="text-sm text-muted-foreground">No strategies registered yet.</p>
            )}
            {strategies.map(strategy => (
              <label className="flex gap-2" key={strategy.id}>
                <Checkbox
                  checked={strategyIds.includes(strategy.id)}
                  onCheckedChange={checked =>
                    setStrategyIds(ids =>
                      checked ? [...ids, strategy.id] : ids.filter(id => id !== strategy.id),
                    )
                  }
                />
                {strategy.name} · {strategy.type} · config {strategy.configHash.slice(0, 8)}
              </label>
            ))}
          </div>
          <div>
            <strong>Frozen benchmark queries</strong>
            {queries.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No frozen benchmark queries are available.
              </p>
            )}
            {queries.map(query => (
              <label className="flex gap-2" key={query.id}>
                <Checkbox
                  checked={queryIds.includes(query.id)}
                  onCheckedChange={checked =>
                    setQueryIds(ids =>
                      checked ? [...ids, query.id] : ids.filter(id => id !== query.id),
                    )
                  }
                />
                {query.name}
              </label>
            ))}
          </div>
          {selectedCoverage.length > 0 && (
            <div className="rounded-md border border-amber-500 p-3 text-sm" role="status">
              <strong>Missing execution:</strong>
              {selectedCoverage.map(item => (
                <p key={`${item.strategyId}-${item.queryId}`}>
                  {strategies.find(strategy => strategy.id === item.strategyId)?.name} ×{" "}
                  {queries.find(query => query.id === item.queryId)?.name}
                </p>
              ))}
            </div>
          )}
          <Button
            disabled={
              loading ||
              strategyIds.length < 2 ||
              !queryIds.length ||
              selectedCoverage.length > 0
            }
            onClick={() =>
              onBenchmark({ strategyIds, evaluationQueryIds: queryIds, cutoffs: [5, 10, 50] })
            }
          >
            Run Strategy Benchmark
          </Button>
        </CardContent>
      </Card>
      {benchmark && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{benchmark.leaderboardLabel}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th>Strategy</th>
                    <th>nDCG@10</th>
                    <th>Recall@10</th>
                    <th>MRR</th>
                    <th>Hit@10</th>
                    <th>Precision@10</th>
                    <th>Coverage@10</th>
                    <th>Mean latency</th>
                    <th>p95 latency</th>
                    <th>Hard negatives</th>
                    <th>Stage evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {benchmark.leaderboardStrategyIds.map(id => {
                    const result = benchmark.results.find(item => item.strategy.id === id)!,
                      at10 = result.aggregate.byCutoff.find(item => item.cutoff === 10);
                    return (
                      <tr key={id}>
                        <td>{result.strategy.name}</td>
                        <td>{metric(at10?.meanNdcg.value)}</td>
                        <td>{metric(at10?.meanBenchmarkRecall.value)}</td>
                        <td>{metric(result.aggregate.mrr.value)}</td>
                        <td>{metric(at10?.meanHit.value)}</td>
                        <td>{metric(at10?.meanJudgedPrecision.value)}</td>
                        <td>{metric(at10?.meanJudgmentCoverage.value)}</td>
                        <td>{ms(result.latency.mean)}</td>
                        <td>{ms(result.latency.p95)}</td>
                        <td>{result.errors.hardNegativeCandidateCount}</td>
                        <td>{result.stage.available ? "Available" : "Unavailable"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
          {benchmark.comparisons.map(comparison => (
            <Card key={`${comparison.strategyAId}-${comparison.strategyBId}`}>
              <CardHeader>
                <CardTitle>
                  Pairwise: {strategies.find(s => s.id === comparison.strategyAId)?.name} vs{" "}
                  {strategies.find(s => s.id === comparison.strategyBId)?.name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p>
                  Wins {comparison.wins} · Losses {comparison.losses} · Ties {comparison.ties} ·
                  Unavailable {comparison.unavailable}
                </p>
                <p>
                  Mean quality delta: {metric(comparison.metricDelta)} · Latency delta:{" "}
                  {ms(comparison.latencyDeltaMs)} · Hard-negative difference:{" "}
                  {comparison.hardNegativeDelta}
                </p>
                {comparison.warnings.map(warning => (
                  <p key={warning}>{warning}</p>
                ))}
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <strong>Biggest wins</strong>
                    {comparison.largestWins.map(item => (
                      <p key={item.evaluationQueryId}>
                        {item.queryText}: {metric(item.before)} → {metric(item.after)} (
                        {item.delta! >= 0 ? "+" : ""}
                        {metric(item.delta)})
                      </p>
                    ))}
                  </div>
                  <div>
                    <strong>Biggest regressions</strong>
                    {comparison.largestLosses.map(item => (
                      <p key={item.evaluationQueryId}>
                        {item.queryText}: {metric(item.before)} → {metric(item.after)} (
                        {metric(item.delta)})
                      </p>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
