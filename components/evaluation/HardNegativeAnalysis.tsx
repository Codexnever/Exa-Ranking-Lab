import type {
  HardNegativeAnalysis as Analysis,
  HardNegativeCandidate,
} from "@/types/evaluation-hard-negatives";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
const rank = (value: number | null) => (value === null ? "Unranked" : `#${value}`);
function Candidate({ candidate }: { candidate: HardNegativeCandidate }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{candidate.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p>
          <strong>{candidate.severity}</strong> severity · Grade 0 — Not relevant · Final{" "}
          {rank(candidate.finalRank)}
        </p>
        <p>
          {candidate.domain} ·{" "}
          <a href={candidate.canonicalUrl} className="break-all underline">
            {candidate.canonicalUrl}
          </a>
        </p>
        <p>
          Repeated in {candidate.history.distinctRunCount} run(s) · top 5:{" "}
          {candidate.history.top5Count} · top 10: {candidate.history.top10Count} · best{" "}
          {rank(candidate.history.bestRank)} · mean #{candidate.history.meanRank.toFixed(1)}
        </p>
        <p>
          Outranks {candidate.outrankedGrade2Count} highly relevant and{" "}
          {candidate.outrankedGrade1Count} relevant document(s).
        </p>
        <p>Evidence: {candidate.reasons.join(" · ")}</p>
        {candidate.topOccurrence.stagePath.length > 0 && (
          <div>
            <strong>Recorded stage path</strong>
            {candidate.topOccurrence.stagePath.map(stage => (
              <p key={stage.stageId}>
                {stage.stageName}: {rank(stage.rank)}
                {stage.score !== null ? ` · ${stage.scoreType ?? "score"} ${stage.score}` : ""}
              </p>
            ))}
            {candidate.topOccurrence.largestPromotion && (
              <p>
                Promoted +{candidate.topOccurrence.largestPromotion.rankDelta} ranks across{" "}
                {candidate.topOccurrence.largestPromotion.fromStageId} →{" "}
                {candidate.topOccurrence.largestPromotion.toStageId}.
              </p>
            )}
          </div>
        )}
        <details>
          <summary>Occurrence history</summary>
          {candidate.occurrences.map(item => (
            <p key={`${item.evaluationRunId}-${item.snapshotId}`}>
              {item.evaluationRunId}: {rank(item.finalRank)} ·{" "}
              {new Date(item.timestamp).toLocaleString()}
            </p>
          ))}
        </details>
        {candidate.topOccurrence.pairwiseEvidence.length > 0 && (
          <details>
            <summary>Outranked relevant documents</summary>
            {candidate.topOccurrence.pairwiseEvidence.map(item => (
              <p key={item.relevantDocumentKey}>
                Grade {item.relevantGrade} {item.relevantCanonicalUrl}: {rank(item.relevantRank)}
              </p>
            ))}
          </details>
        )}
      </CardContent>
    </Card>
  );
}
export function HardNegativeAnalysis({ analysis }: { analysis: Analysis }) {
  return (
    <section className="space-y-4" aria-label="Hard Negative Analysis">
      <h2 className="text-xl font-semibold">
        Hard Negative Analysis · Policy v{analysis.policyVersion}
      </h2>
      <p className="text-sm text-muted-foreground">
        Accepted grade-0 documents qualify only when ranking prominence, repetition, outranking, or
        recorded stage evidence indicates a difficult false positive.
      </p>
      <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
        {(["critical", "high", "medium", "low"] as const).map(level => (
          <Card key={level}>
            <CardContent className="p-4">
              <p className="capitalize">{level}</p>
              <strong className="text-2xl">{analysis.severityCounts[level]}</strong>
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardContent className="p-4">
            <p>Repeated</p>
            <strong className="text-2xl">{analysis.repeatedCandidateCount}</strong>
          </CardContent>
        </Card>
      </div>
      {analysis.candidates.length ? (
        <div className="space-y-4">
          {analysis.querySummaries
            .filter(query => query.candidateCount > 0)
            .map(query => (
              <details open key={query.evaluationQueryId}>
                <summary className="font-semibold">
                  Query {query.evaluationQueryId} · {query.candidateCount} candidates
                </summary>
                <div className="mt-3 space-y-3">
                  {analysis.candidates
                    .filter(candidate => candidate.evaluationQueryId === query.evaluationQueryId)
                    .map(candidate => (
                      <Candidate key={candidate.documentKey} candidate={candidate} />
                    ))}
                </div>
              </details>
            ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No hard-negative candidates qualified under Policy v{analysis.policyVersion}.
        </p>
      )}
      {analysis.domainSummaries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Domain Error Summary</CardTitle>
          </CardHeader>
          <CardContent>
            {analysis.domainSummaries.map(domain => (
              <p key={domain.domain}>
                {domain.domain}: {domain.candidateCount} candidates · {domain.uniqueQueryCount}{" "}
                queries · {domain.top5Appearances} top-5 appearances
              </p>
            ))}
          </CardContent>
        </Card>
      )}
      {analysis.warnings.length > 0 && (
        <Alert>
          <AlertDescription>{analysis.warnings.join(" ")}</AlertDescription>
        </Alert>
      )}
    </section>
  );
}