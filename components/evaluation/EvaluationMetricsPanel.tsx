"use client"
import { BarChart3,Info } from "lucide-react"
import type { AggregateMetricValue,EvaluationMetricsResponse } from "@/app/services/evaluation/metrics/types"
import { Alert,AlertDescription } from "@/components/ui/alert"
import { Card,CardContent,CardHeader,CardTitle } from "@/components/ui/card"
import { Tooltip,TooltipContent,TooltipProvider,TooltipTrigger } from "@/components/ui/tooltip"

const explanations:Record<string,string>={
  "nDCG":"Graded ranking quality using gains 0, 1, and 3 with logarithmic rank discount.",
  "Benchmark Recall":"Share of known accepted relevant benchmark documents retrieved in the top K; not exhaustive web recall.",
  "Hit":"Whether at least one accepted relevant result appears in the top K, macro-averaged across queries.",
  "Judged Precision":"Relevant accepted judgments divided by all accepted judgments in the top K; unjudged results are excluded.",
  "Judgment Coverage":"Share of evaluated top-K results that have an accepted judgment.",
  "MRR":"Mean reciprocal rank of the first accepted relevant result; unjudged results retain their ranks.",
}
function display(metric:AggregateMetricValue){return metric.value===null?"Unavailable":`${(metric.value*100).toFixed(1)}%`}
function Metric({label,value}:{label:string;value:AggregateMetricValue}){const name=label.replace(/@\d+$/,"");return <Card><CardContent className="p-4"><div className="flex items-center gap-1 text-xs text-muted-foreground"><span>{label}</span><Tooltip><TooltipTrigger aria-label={`About ${label}`}><Info className="h-3.5 w-3.5"/></TooltipTrigger><TooltipContent className="max-w-xs">{explanations[name]}</TooltipContent></Tooltip></div><p className="mt-1 text-2xl font-semibold">{display(value)}</p><p className="text-xs text-muted-foreground">{value.eligibleQueryCount} eligible</p></CardContent></Card>}
export function EvaluationMetricsPanel({result,persisted=false}:{result:EvaluationMetricsResponse;persisted?:boolean}){const a=result.aggregate;return <TooltipProvider><section className="space-y-4" aria-label="Search relevance metrics"><div><h2 className="flex items-center gap-2 text-xl font-semibold"><BarChart3 className="h-5 w-5"/>Search relevance metrics</h2><p className="text-sm text-muted-foreground">Metric Policy v{result.metricVersion} · {persisted?"immutable saved evaluation run":"deterministic on-demand evaluation · not persisted"}</p></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"><Metric label="MRR" value={a.mrr}/>{a.byCutoff.flatMap(group=><div className="contents" key={group.cutoff}><Metric label={`nDCG@${group.cutoff}`} value={group.meanNdcg}/><Metric label={`Benchmark Recall@${group.cutoff}`} value={group.meanBenchmarkRecall}/><Metric label={`Hit@${group.cutoff}`} value={group.meanHit}/><Metric label={`Judged Precision@${group.cutoff}`} value={group.meanJudgedPrecision}/><Metric label={`Judgment Coverage@${group.cutoff}`} value={group.meanJudgmentCoverage}/></div>)}</div><Card><CardHeader><CardTitle className="text-base">Evaluation eligibility</CardTitle></CardHeader><CardContent><p>{a.eligibleQueryCount} eligible · {a.skippedQueryCount} skipped · {a.queryCount} selected</p></CardContent></Card>{a.warnings.length>0&&<Alert><AlertDescription><strong>Warnings</strong><ul className="mt-2 list-disc space-y-1 pl-5">{a.warnings.map(warning=><li key={warning}>{warning}</li>)}</ul></AlertDescription></Alert>}</section></TooltipProvider>}
