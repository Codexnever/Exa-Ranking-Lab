import type { StageDiagnosisResult } from "@/types/evaluation-stage-diagnosis";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
const metric = (value: number | null) => (value === null ? "Unavailable" : value.toFixed(2)),
  percent = (value: number | null) =>
    value === null ? "Unavailable" : `${Math.round(value * 100)}%`;
export function StageDiagnosisPanel({ diagnosis }: { diagnosis: StageDiagnosisResult }) {
  return (
    <section className="space-y-4" aria-label="Relevance Diagnosis">
      <h3 className="text-lg font-semibold">
        Relevance Diagnosis · Policy v{diagnosis.diagnosisVersion}
      </h3>
      <p>
        <strong>{diagnosis.direction}</strong> — {diagnosis.summary}
      </p>
      {diagnosis.traceCompleteness !== "complete" && (
        <Alert>
          <AlertDescription>
            Partial trace: conclusions apply only to recorded stages.
          </AlertDescription>
        </Alert>
      )}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {diagnosis.stages.map(stage => (
          <Card key={stage.stageId}>
            <CardHeader>
              <CardTitle>{stage.stageName}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p>
                {stage.ranked ? "Ranked stage" : "Unordered stage"} · {stage.recordedResultCount}{" "}
                results
              </p>
              <p>
                Known relevant present: {stage.judgedRelevantCount} /{" "}
                {stage.knownRelevantBenchmarkCount}
              </p>
              <p>
                {stage.ranked ? "Stage Benchmark Recall" : "Candidate set Benchmark Recall"}:{" "}
                {metric(stage.stageBenchmarkRecall.value)}
              </p>
              <p>Hit: {stage.stageHit ? "Yes" : "No"}</p>
              <p>Judged Precision: {metric(stage.stageJudgedPrecision.value)}</p>
              <p>Judgment Coverage: {metric(stage.stageJudgmentCoverage.value)}</p>
              {stage.cutoffs.map(cutoff => (
                <div key={cutoff.cutoff} className="border-t pt-1">
                  <p>
                    Benchmark Recall@{cutoff.cutoff}: {metric(cutoff.benchmarkRecall.value)}
                  </p>
                  <p>
                    nDCG@{cutoff.cutoff}: {metric(cutoff.ndcg.value)}
                  </p>
                </div>
              ))}
              {!stage.ranked && <p>nDCG: Unavailable for unordered stage</p>}
              {stage.warnings.map(warning => (
                <p key={warning} className="text-amber-700">
                  {warning}
                </p>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="space-y-3">
        {diagnosis.transitions.map(item => (
          <Card key={`${item.fromStageId}-${item.toStageId}`}>
            <CardHeader>
              <CardTitle>
                {item.fromStageId} → {item.toStageId}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p>
                Relevant survival: {percent(item.relevantSurvivalRate)} · loss:{" "}
                {percent(item.relevantLossRate)}
              </p>
              <p>Grade-2 survival: {percent(item.grade2SurvivalRate)}</p>
              <p>
                Relevant promoted: {item.relevantRankChange.promotedCount} · demoted:{" "}
                {item.relevantRankChange.demotedCount} · unchanged:{" "}
                {item.relevantRankChange.unchangedCount} · lost: {item.relevantLostCount} · entered:{" "}
                {item.relevantEntryCount}
              </p>
              {item.documentOutcomes.filter(
                outcome => outcome.outcome === "lost" || outcome.outcome === "demoted",
              ).length > 0 && (
                <details>
                  <summary>Relevant-document evidence</summary>
                  {item.documentOutcomes
                    .filter(outcome => outcome.outcome === "lost" || outcome.outcome === "demoted")
                    .map(outcome => (
                      <p key={outcome.documentKey}>
                        Grade {outcome.grade} {outcome.title ?? outcome.canonicalUrl}:{" "}
                        {outcome.previousRank === null ? "unranked" : `#${outcome.previousRank}`} →{" "}
                        {outcome.nextRank === null ? "absent" : `#${outcome.nextRank}`} (
                        {outcome.outcome})
                      </p>
                    ))}
                </details>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Candidate to Final</CardTitle>
        </CardHeader>
        <CardContent>
          {diagnosis.candidateToFinal.available ? (
            <p>
              Relevant retention: {percent(diagnosis.candidateToFinal.retentionRate)} ·{" "}
              {diagnosis.candidateToFinal.finalRetainedRelevantCount}/
              {diagnosis.candidateToFinal.candidateRelevantCount} retained ·{" "}
              {diagnosis.candidateToFinal.candidateRelevantLostCount} lost
            </p>
          ) : (
            <p>{diagnosis.candidateToFinal.warning}</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Diagnosis Patterns</CardTitle>
        </CardHeader>
        <CardContent>
          {diagnosis.patterns.map(pattern => (
            <p key={pattern}>{pattern}</p>
          ))}
        </CardContent>
      </Card>
      {diagnosis.warnings.length > 0 && (
        <Alert>
          <AlertDescription>
            <ul className="list-disc pl-5">
              {diagnosis.warnings.map(warning => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </section>
  );
}