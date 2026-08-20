import { renderToStaticMarkup } from "react-dom/server"
import { EvaluationMetricsPanel } from "../EvaluationMetricsPanel"
import type { EvaluationMetricsResponse } from "@/app/services/evaluation/metrics/types"

test("renders Phase 5 metrics, unavailable states, eligibility, and warnings",()=>{
 const metric=(value:number|null,count=1)=>({value,eligibleQueryCount:count})
 const result:EvaluationMetricsResponse={metricVersion:"1",datasetVersionId:"d",snapshotSelections:{eq:"s"},perQuery:[],persisted:false,aggregate:{metricVersion:"1",queryCount:2,eligibleQueryCount:1,skippedQueryCount:1,mrr:metric(.5),warnings:["eq: Judgment coverage is low; Judged Precision may be unreliable."],byCutoff:[5,10].map(cutoff=>({cutoff,meanNdcg:metric(cutoff===5?1:null,cutoff===5?1:0),meanBenchmarkRecall:metric(.5),meanHit:metric(1),meanJudgedPrecision:metric(.5),meanJudgmentCoverage:metric(.25)}))}}
 const html=renderToStaticMarkup(<EvaluationMetricsPanel result={result}/>)
 expect(html).toContain("Metric Policy v1")
 expect(html).toContain("nDCG@5")
 expect(html).toContain("Benchmark Recall@10")
 expect(html).toContain("Judged Precision@5")
 expect(html).toContain("Judgment Coverage@10")
 expect(html).toContain("Unavailable")
 expect(html).toContain("1 eligible · 1 skipped")
 expect(html).toContain("Judgment coverage is low")
})

