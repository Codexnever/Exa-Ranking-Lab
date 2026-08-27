"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, BarChart3, Copy, Loader2, Lock, Save, Plus } from "lucide-react";
import Link from "next/link";
import { evaluationApi } from "@/lib/evaluation-api";
import type {
  EvaluationDatasetDetail,
  EvaluationQuery,
  EvaluationQueryJudgments,
  RelevanceGrade,
} from "@/types/evaluation";
import type { QueryConfig, RankingSnapshot } from "@/types/type";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FreezeReadiness } from "@/components/evaluation/FreezeReadiness";
import { JudgmentResultList } from "@/components/evaluation/JudgmentResultList";
import { ConflictReview } from "@/components/evaluation/ConflictReview";
import { EvaluationMetricsPanel } from "@/components/evaluation/EvaluationMetricsPanel";
import type { EvaluationMetricsResponse } from "@/app/services/evaluation/metrics/types";
import type { EvaluationRun, EvaluationRunSummary } from "@/types/evaluation-runs";
import { EvaluationHistory } from "@/components/evaluation/EvaluationHistory";
import { EvaluationRunComparison } from "@/components/evaluation/EvaluationRunComparison";
import type { EvaluationRunComparison as RunComparison } from "@/types/evaluation-comparison";
import { canonicalizeDocumentUrl } from "@/utils/canonicalize-url-policy";
import { StageTraceInspector } from "@/components/evaluation/StageTraceInspector";
import type {
  EvaluationExecutionTrace,
  EvaluationStageTraceSummary,
} from "@/types/evaluation-stage-trace";
import type { StageDiagnosisResult } from "@/types/evaluation-stage-diagnosis";
import type { HardNegativeAnalysis as HardNegativeResult } from "@/types/evaluation-hard-negatives";
import { HardNegativeAnalysis } from "@/components/evaluation/HardNegativeAnalysis";

export default function EvaluationWorkspace() {
  const { datasetVersionId: id } = useParams<{ datasetVersionId: string }>();
  const router = useRouter();
  const [detail, setDetail] = useState<EvaluationDatasetDetail>();
  const [operational, setOperational] = useState<QueryConfig[]>([]);
  const [selectedOps, setSelectedOps] = useState<string[]>([]);
  const [selectedQueryId, setSelectedQueryId] = useState("");
  const [snapshots, setSnapshots] = useState<RankingSnapshot[]>([]);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState("");
  const [metricSelections, setMetricSelections] = useState<Record<string, string>>({});
  const [metricResult, setMetricResult] = useState<EvaluationMetricsResponse>();
  const [runHistory, setRunHistory] = useState<EvaluationRunSummary[]>([]);
  const [selectedRun, setSelectedRun] = useState<EvaluationRun>();
  const [beforeRunId, setBeforeRunId] = useState("");
  const [afterRunId, setAfterRunId] = useState("");
  const [comparison, setComparison] = useState<RunComparison>();
  const [comparisonError, setComparisonError] = useState("");
  const [stageTraces, setStageTraces] = useState<EvaluationStageTraceSummary[]>([]);
  const [selectedTrace, setSelectedTrace] = useState<EvaluationExecutionTrace>();
  const [stageDiagnosis, setStageDiagnosis] = useState<StageDiagnosisResult>();
  const [hardNegatives, setHardNegatives] = useState<HardNegativeResult>();
  const [judgmentData, setJudgmentData] = useState<EvaluationQueryJudgments>();
  const [queryProgress, setQueryProgress] = useState<
    Record<string, { accepted: number; conflicted: number }>
  >({});
  const [drafts, setDrafts] = useState<Record<string, RelevanceGrade>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const selectedQuery = detail?.queries.find(q => q.id === selectedQueryId);
  const selectedSnapshot = snapshots.find(s => s.id === selectedSnapshotId);
  const frozen = detail?.dataset.status === "frozen";
  const refresh = useCallback(async () => {
    setError("");
    try {
      const value = await evaluationApi.detail(id);
      setDetail(value);
      const summaries = await Promise.all(
        value.queries.map(async q => (await evaluationApi.judgments(id, q.id)).summary),
      );
      setQueryProgress(
        Object.fromEntries(
          value.queries.map((q, index) => [
            q.id,
            { accepted: summaries[index].accepted, conflicted: summaries[index].conflicted },
          ]),
        ),
      );
      if (!selectedQueryId && value.queries[0]) setSelectedQueryId(value.queries[0].id);
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  }, [id, selectedQueryId]);
  useEffect(() => {
    refresh();
    evaluationApi
      .queries()
      .then(setOperational)
      .catch(e => setError(message(e)));
  }, [refresh]);
  useEffect(() => {
    if (!selectedQuery) return;
    setSelectedSnapshotId(metricSelections[selectedQuery.id] ?? "");
    setDrafts({});
    Promise.all([
      evaluationApi.snapshots(selectedQuery.sourceQueryId),
      evaluationApi.judgments(id, selectedQuery.id),
    ])
      .then(([all, j]) => {
        setSnapshots(
          all.filter(
            s => !s.metadata.configHash || s.metadata.configHash === selectedQuery.configHash,
          ),
        );
        setJudgmentData(j);
      })
      .catch(e => setError(message(e)));
  }, [id, selectedQuery, metricSelections]);
  useEffect(() => {
    if (frozen) {
      evaluationApi
        .runs(id)
        .then(result => setRunHistory(result.runs))
        .catch(e => setError(message(e)));
      evaluationApi
        .stageTraces({ datasetVersionId: id })
        .then(result => setStageTraces(result.traces))
        .catch(e => setError(message(e)));
      evaluationApi
        .hardNegatives(id)
        .then(setHardNegatives)
        .catch(e => setError(message(e)));
    }
  }, [frozen, id]);
  const addedSourceIds = useMemo(
    () => new Set(detail?.queries.map(q => q.sourceQueryId)),
    [detail],
  );
  const judgedDisplayed =
    selectedSnapshot?.results.filter(result =>
      judgmentData?.judgments.some(j => j.canonicalUrl === canonicalizeDocumentUrl(result.url)),
    ).length ?? 0;
  async function addQueries() {
    setBusy(true);
    try {
      await evaluationApi.addQueries(id, selectedOps);
      setSelectedOps([]);
      setNotice("Benchmark queries added.");
      await refresh();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!selectedQuery || !selectedSnapshot) return;
    setBusy(true);
    try {
      await evaluationApi.saveJudgments(
        id,
        selectedQuery.id,
        selectedSnapshot.id,
        Object.entries(drafts).map(([resultUrl, grade]) => ({ resultUrl, grade })),
      );
      setDrafts({});
      setNotice("Judgments saved.");
      setJudgmentData(await evaluationApi.judgments(id, selectedQuery.id));
      await refresh();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function adjudicate(judgmentId: string, grade: RelevanceGrade, rationale: string) {
    await evaluationApi.adjudicate(id, judgmentId, grade, rationale);
    setNotice("Conflict resolved.");
    if (selectedQuery) setJudgmentData(await evaluationApi.judgments(id, selectedQuery.id));
    await refresh();
  }
  async function freeze() {
    if (
      !window.confirm(
        "Freeze this dataset version? Benchmark queries and judgments will become immutable. Future changes require cloning a new version.",
      )
    )
      return;
    setBusy(true);
    try {
      setDetail(await evaluationApi.freeze(id));
      setNotice("Dataset version frozen.");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function clone() {
    setBusy(true);
    try {
      const next = await evaluationApi.clone(id);
      router.push(`/evaluation/${next.dataset.id}`);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function calculateMetrics() {
    setBusy(true);
    setError("");
    try {
      setMetricResult(
        await evaluationApi.metrics(
          id,
          Object.entries(metricSelections).map(([evaluationQueryId, snapshotId]) => ({
            evaluationQueryId,
            snapshotId,
          })),
        ),
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function saveRun() {
    if (!metricResult) return;
    setBusy(true);
    setError("");
    try {
      const selections = Object.entries(metricResult.snapshotSelections).map(
        ([evaluationQueryId, snapshotId]) => ({ evaluationQueryId, snapshotId }),
      );
      const cutoffs = metricResult.aggregate.byCutoff.map(item => item.cutoff);
      const saved = await evaluationApi.saveRun(id, selections, cutoffs);
      setSelectedRun(saved);
      setRunHistory((await evaluationApi.runs(id)).runs);
      setNotice("Evaluation run saved as immutable history.");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function openRun(runId: string) {
    setBusy(true);
    try {
      setSelectedRun(await evaluationApi.runDetail(id, runId));
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function openTrace(traceId: string) {
    setBusy(true);
    setStageDiagnosis(undefined);
    try {
      const trace = await evaluationApi.stageTrace(traceId);
      setSelectedTrace(trace);
      if (trace.datasetVersionId && trace.evaluationQueryId)
        setStageDiagnosis(await evaluationApi.stageDiagnosis(traceId));
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function compareRuns() {
    const before = runHistory.find(run => run.id === beforeRunId),
      after = runHistory.find(run => run.id === afterRunId);
    if (!before || !after) return;
    if (new Date(after.createdAt).getTime() <= new Date(before.createdAt).getTime()) {
      setComparisonError("After Run must be newer than Before Run.");
      return;
    }
    setBusy(true);
    setComparisonError("");
    try {
      setComparison(await evaluationApi.compareRuns(id, beforeRunId, afterRunId));
    } catch (e) {
      setComparisonError(message(e));
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  if (!detail)
    return (
      <Alert variant="destructive">
        <AlertDescription>{error || "Dataset not found"}</AlertDescription>
      </Alert>
    );
  return (
    <div className="space-y-6">
      <Link
        href="/evaluation"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="mr-1 h-4 w-4" />
        All datasets
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold">{detail.dataset.name}</h1>
            <Badge>{detail.dataset.status}</Badge>
          </div>
          <p className="text-muted-foreground">
            Version {detail.dataset.version} · {detail.dataset.queryCount} queries ·{" "}
            {detail.dataset.judgmentCount} accepted · {detail.dataset.conflictCount} conflicts
          </p>
          {frozen && detail.dataset.frozenAt && (
            <p className="text-sm text-muted-foreground">
              Frozen {new Date(detail.dataset.frozenAt).toLocaleString()}
            </p>
          )}
        </div>
        {frozen ? (
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href={`/evaluation/${id}/strategies`}>Strategy Lab</Link>
            </Button>
            <Button onClick={clone} disabled={busy}>
              <Copy className="mr-2 h-4 w-4" />
              Create New Version
            </Button>
          </div>
        ) : (
          <Button
            variant="destructive"
            onClick={freeze}
            disabled={busy || !detail.readiness.fullEvaluationFreezeReady}
          >
            <Lock className="mr-2 h-4 w-4" />
            Freeze Dataset Version
          </Button>
        )}
      </header>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {notice && (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      <FreezeReadiness readiness={detail.readiness} />
      {!frozen && (
        <Card>
          <CardHeader>
            <CardTitle>Add operational queries</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 md:grid-cols-2">
              {operational.map(q => {
                const added = addedSourceIds.has(q.id);
                return (
                  <label key={q.id} className="flex items-start gap-2 rounded border p-3">
                    <Checkbox
                      checked={added || selectedOps.includes(q.id)}
                      disabled={added}
                      onCheckedChange={checked =>
                        setSelectedOps(values =>
                          checked ? [...values, q.id] : values.filter(id => id !== q.id),
                        )
                      }
                    />
                    <span>
                      <strong>{q.name}</strong>
                      <span className="block text-xs text-muted-foreground">{q.query}</span>
                      {added && <Badge variant="outline">Already added</Badge>}
                    </span>
                  </label>
                );
              })}
            </div>
            {operational.length === 0 && (
              <p className="text-sm text-muted-foreground">No operational queries are available.</p>
            )}
            <Button onClick={addQueries} disabled={busy || selectedOps.length === 0}>
              <Plus className="mr-2 h-4 w-4" />
              Add selected queries
            </Button>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Benchmark query and snapshot</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Benchmark query</label>
            <Select value={selectedQueryId} onValueChange={setSelectedQueryId}>
              <SelectTrigger>
                <SelectValue placeholder="Select benchmark query" />
              </SelectTrigger>
              <SelectContent>
                {detail.queries.map(q => (
                  <SelectItem key={q.id} value={q.id}>
                    {q.name} · {q.category} · {q.filters.numResults} results ·{" "}
                    {queryProgress[q.id]?.accepted ?? 0} accepted
                    {queryProgress[q.id]?.conflicted
                      ? ` · ${queryProgress[q.id].conflicted} conflicts`
                      : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedQuery && (
              <p className="mt-2 text-xs text-muted-foreground">
                {selectedQuery.queryText}
                <br />
                Source: {selectedQuery.sourceQueryId}
              </p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Compatible snapshot</label>
            <Select
              value={selectedSnapshotId}
              onValueChange={value => {
                setSelectedSnapshotId(value);
                if (selectedQuery)
                  setMetricSelections(current => ({ ...current, [selectedQuery.id]: value }));
              }}
              disabled={!selectedQuery}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select snapshot" />
              </SelectTrigger>
              <SelectContent>
                {snapshots.map(s => (
                  <SelectItem key={s.id} value={s.id}>
                    {new Date(s.timestamp).toLocaleString()} · {s.results.length} results ·{" "}
                    {s.metadata.configHash ? "Verified" : "Compatibility not verifiable"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedQuery && snapshots.length === 0 && (
              <p className="mt-2 text-sm text-muted-foreground">
                No compatible snapshots. Known config mismatches are excluded.
              </p>
            )}
            {frozen && (
              <p className="mt-2 text-xs text-muted-foreground">
                Select one explicit snapshot for each query you want to evaluate.{" "}
                {Object.keys(metricSelections).length} selected.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
      {selectedSnapshot && judgmentData && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {judgedDisplayed} judged · {selectedSnapshot.results.length - judgedDisplayed}{" "}
              unjudged in displayed snapshot
            </p>
            <Button onClick={save} disabled={frozen || busy || Object.keys(drafts).length === 0}>
              {busy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save {Object.keys(drafts).length} judgment
              {Object.keys(drafts).length === 1 ? "" : "s"}
            </Button>
          </div>
          <JudgmentResultList
            results={selectedSnapshot.results}
            judgments={judgmentData.judgments}
            drafts={drafts}
            onDraft={(url, grade) => setDrafts(d => ({ ...d, [url]: grade }))}
            disabled={Boolean(frozen) || busy}
          />
          <ConflictReview
            judgments={judgmentData.judgments}
            disabled={Boolean(frozen) || busy}
            onAdjudicate={adjudicate}
          />
        </>
      )}
      {frozen && (
        <Card>
          <CardHeader>
            <CardTitle>Run authoritative evaluation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Metrics use accepted judgments and explicit snapshots at cutoffs 5 and 10. Preview
              remains on demand; saving causes a fresh authoritative server calculation.
            </p>
            <Button
              onClick={calculateMetrics}
              disabled={busy || Object.keys(metricSelections).length === 0}
            >
              <BarChart3 className="mr-2 h-4 w-4" />
              Run Evaluation for {Object.keys(metricSelections).length} quer
              {Object.keys(metricSelections).length === 1 ? "y" : "ies"}
            </Button>
          </CardContent>
        </Card>
      )}
      {metricResult && (
        <>
          <EvaluationMetricsPanel result={metricResult} />
          <Button onClick={saveRun} disabled={busy}>
            <Save className="mr-2 h-4 w-4" />
            Save This Run
          </Button>
        </>
      )}
      {frozen && (
        <EvaluationHistory
          runs={runHistory}
          selected={selectedRun}
          loading={busy}
          onSelect={openRun}
        />
      )}
      {frozen && hardNegatives && <HardNegativeAnalysis analysis={hardNegatives} />}
      {frozen && (
        <StageTraceInspector
          traces={stageTraces}
          trace={selectedTrace}
          diagnosis={stageDiagnosis}
          onOpen={openTrace}
        />
      )}
      {frozen && runHistory.length >= 2 && (
        <EvaluationRunComparison
          runs={runHistory}
          beforeId={beforeRunId}
          afterId={afterRunId}
          onBefore={setBeforeRunId}
          onAfter={setAfterRunId}
          onCompare={compareRuns}
          result={comparison}
          loading={busy}
          error={comparisonError}
        />
      )}
    </div>
  );
}
function message(error: unknown) {
  return error instanceof Error ? error.message : "Evaluation operation failed";
}