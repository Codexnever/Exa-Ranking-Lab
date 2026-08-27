"use client";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { EvaluationDatasetDetail } from "@/types/evaluation";

export function DatasetVersionCard({ detail }: { detail: EvaluationDatasetDetail }) {
  const d = detail.dataset;
  return (
    <Link
      href={`/evaluation/${d.id}`}
      className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-lg"
    >
      <Card className="h-full transition hover:border-blue-300 hover:shadow-sm">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <CardTitle>{d.name}</CardTitle>
            <Badge variant={d.status === "frozen" ? "default" : "secondary"}>{d.status}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">Version {d.version}</p>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <strong>{d.queryCount}</strong>
            <span className="block text-muted-foreground">Queries</span>
          </div>
          <div>
            <strong>{d.judgmentCount}</strong>
            <span className="block text-muted-foreground">Accepted</span>
          </div>
          <div>
            <strong>{d.conflictCount}</strong>
            <span className="block text-muted-foreground">Conflicts</span>
          </div>
          <div className="col-span-3 flex gap-2">
            <Badge variant={detail.readiness.queryFoundationReady ? "default" : "outline"}>
              Queries {detail.readiness.queryFoundationReady ? "ready" : "incomplete"}
            </Badge>
            <Badge variant={detail.readiness.judgmentFoundationReady ? "default" : "outline"}>
              Judgments {detail.readiness.judgmentFoundationReady ? "ready" : "incomplete"}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}