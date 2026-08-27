"use client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RelevanceGradeControl, gradeLabel } from "./RelevanceGradeControl";
import type { RelevanceGrade, RelevanceJudgment } from "@/types/evaluation";
import type { SearchResult } from "@/types/type";
import { canonicalizeDocumentUrl } from "@/utils/canonicalize-url-policy";

export function JudgmentResultList({
  results,
  judgments,
  drafts,
  onDraft,
  disabled,
}: {
  results: SearchResult[];
  judgments: RelevanceJudgment[];
  drafts: Record<string, RelevanceGrade>;
  onDraft: (url: string, grade: RelevanceGrade) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-3">
      {results.map((result, index) => {
        const judgment = judgments.find(
          item => item.canonicalUrl === canonicalizeDocumentUrl(result.url),
        );
        return (
          <Card key={`${result.url}-${index}`}>
            <CardContent className="pt-5">
              <div className="flex gap-4">
                <div className="text-xl font-semibold text-muted-foreground w-8">
                  {result.position ?? index + 1}
                </div>
                <div className="min-w-0 flex-1 space-y-3">
                  <div>
                    <a
                      href={result.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-blue-700 hover:underline"
                    >
                      {result.title || result.url}
                    </a>
                    <p className="text-xs text-muted-foreground break-all">{result.url}</p>
                    <p className="mt-1 text-sm text-muted-foreground line-clamp-3">
                      {result.snippet}
                    </p>
                  </div>
                  <div>
                    {!judgment ? (
                      <Badge variant="outline">Unjudged</Badge>
                    ) : judgment.status === "conflicted" ? (
                      <div className="flex gap-2">
                        <Badge variant="destructive">Conflict</Badge>
                        <span className="text-sm">No authoritative grade — needs adjudication</span>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Badge>Accepted</Badge>
                        <span className="text-sm">
                          Grade: {judgment.relevanceGrade} — {gradeLabel(judgment.relevanceGrade!)}
                        </span>
                      </div>
                    )}
                  </div>
                  <RelevanceGradeControl
                    value={drafts[result.url]}
                    onChange={grade => onDraft(result.url, grade)}
                    disabled={disabled}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}