"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { evaluationApi } from "@/lib/evaluation-api";
import { StrategyLab } from "@/components/evaluation/StrategyLab";
import type {
  EvaluationStrategy,
  StrategyBenchmark,
  StrategyExecution,
} from "@/types/evaluation-strategy";
import type { EvaluationDatasetDetail } from "@/types/evaluation";
import { Alert, AlertDescription } from "@/components/ui/alert";
export default function StrategyLabPage() {
  const { datasetVersionId } = useParams<{ datasetVersionId: string }>(),
    [detail, setDetail] = useState<EvaluationDatasetDetail>(),
    [strategies, setStrategies] = useState<EvaluationStrategy[]>([]),
    [executions, setExecutions] = useState<StrategyExecution[]>([]),
    [benchmark, setBenchmark] = useState<StrategyBenchmark>(),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    const [d, s, e] = await Promise.all([
      evaluationApi.detail(datasetVersionId),
      evaluationApi.strategies(),
      evaluationApi.strategyExecutions(datasetVersionId),
    ]);
    setDetail(d);
    setStrategies(s.strategies);
    setExecutions(e.executions);
  }, [datasetVersionId]);
  useEffect(() => {
    refresh()
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [refresh]);
  if (error)
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  if (!detail) return <p>{loading ? "Loading Strategy Lab…" : "Dataset unavailable"}</p>;
  return (
    <div className="space-y-4">
      <Link href={`/evaluation/${datasetVersionId}`}>← Evaluation workspace</Link>
      <StrategyLab
        strategies={strategies}
        queries={detail.queries}
        executions={executions}
        benchmark={benchmark}
        loading={loading}
        onCreate={async input => {
          setLoading(true);
          try {
            setError("");
            await evaluationApi.createStrategy(input);
            await refresh();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Strategy creation failed");
          } finally {
            setLoading(false);
          }
        }}
        onCreateExecution={async input => {
          setLoading(true);
          try {
            setError("");
            await evaluationApi.createStrategyExecution(datasetVersionId, input);
            await refresh();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Strategy execution creation failed");
            throw e;
          } finally {
            setLoading(false);
          }
        }}
        onBenchmark={async input => {
          setLoading(true);
          try {
            setError("");
            setBenchmark(await evaluationApi.runStrategyBenchmark(datasetVersionId, input));
          } catch (e) {
            setError(e instanceof Error ? e.message : "Strategy benchmark failed");
          } finally {
            setLoading(false);
          }
        }}
      />
    </div>
  );
}
