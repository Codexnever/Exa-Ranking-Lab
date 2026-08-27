"use client";
import { History, Loader2 } from "lucide-react";
import type { EvaluationRun, EvaluationRunSummary } from "@/types/evaluation-runs";
import type { EvaluationMetricsResponse } from "@/app/services/evaluation/metrics/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EvaluationMetricsPanel } from "./EvaluationMetricsPanel";

const value = (number: number | null) =>
  number === null ? "Unavailable" : `${(number * 100).toFixed(1)}%`;
function cutoff(run: EvaluationRunSummary) {
  return run.aggregate.byCutoff.find(item => item.cutoff === 10) ?? run.aggregate.byCutoff.at(-1);
}
export function EvaluationHistory({
  runs,
  selected,
  loading,
  onSelect,
}: {
  runs: EvaluationRunSummary[];
  selected?: EvaluationRun;
  loading?: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="space-y-4" aria-label="Evaluation History">
      <h2 className="flex items-center gap-2 text-xl font-semibold">
        <History className="h-5 w-5" />
        Evaluation History
      </h2>
      {runs.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No saved evaluation runs yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {runs.map(run => {
            const at = cutoff(run);
            return (
              <Card key={run.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
                  <div>
                    <p className="font-medium">{new Date(run.createdAt).toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">
                      Metric Policy v{run.metricVersion} · dataset v{run.datasetVersion} ·{" "}
                      {run.selectedQueryCount} selected · {run.eligibleQueryCount} eligible /{" "}
                      {run.skippedQueryCount} skipped
                    </p>
                    <p className="mt-1 text-sm">
                      nDCG@{at?.cutoff ?? "—"}: {value(at?.meanNdcg.value ?? null)} · Benchmark
                      Recall: {value(at?.meanBenchmarkRecall.value ?? null)} · MRR:{" "}
                      {value(run.aggregate.mrr.value)} · Coverage:{" "}
                      {value(at?.meanJudgmentCoverage.value ?? null)}
                    </p>
                  </div>
                  <Button variant="outline" onClick={() => onSelect(run.id)} disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "View details"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      {selected && (
        <Card>
          <CardHeader>
            <CardTitle>
              Saved run detail · {new Date(selected.createdAt).toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <EvaluationMetricsPanel
              persisted
              result={
                {
                  metricVersion: selected.metricVersion as "1",
                  datasetVersionId: selected.datasetVersionId,
                  snapshotSelections: Object.fromEntries(
                    selected.snapshotSelections.map(item => [
                      item.evaluationQueryId,
                      item.snapshotId,
                    ]),
                  ),
                  perQuery: selected.perQuery,
                  aggregate: selected.aggregate,
                  persisted: false,
                } satisfies EvaluationMetricsResponse
              }
            />
          </CardContent>
        </Card>
      )}
    </section>
  );
}