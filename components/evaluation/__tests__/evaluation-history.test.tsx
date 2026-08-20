import {renderToStaticMarkup} from "react-dom/server"
import {EvaluationHistory} from "../EvaluationHistory"
import type {EvaluationRun,EvaluationRunSummary} from "@/types/evaluation-runs"

const metric=(value:number)=>({value,eligibleQueryCount:1})
const aggregate={metricVersion:"1" as const,queryCount:1,eligibleQueryCount:1,skippedQueryCount:0,mrr:metric(.5),byCutoff:[{cutoff:10,meanNdcg:metric(.74),meanBenchmarkRecall:metric(.6),meanHit:metric(1),meanJudgedPrecision:metric(.8),meanJudgmentCoverage:metric(.7)}],warnings:[]}
const summary:EvaluationRunSummary={id:"run",datasetVersionId:"dataset",datasetFamilyKey:"core",datasetVersion:1,metricVersion:"1",status:"completed",cutoffs:[10],selectedQueryCount:1,eligibleQueryCount:1,skippedQueryCount:0,aggregate:{mrr:aggregate.mrr,byCutoff:aggregate.byCutoff},createdAt:new Date("2026-08-18T00:00:00Z"),createdByUserId:"owner"}
const detail:EvaluationRun={...summary,datasetFamilyKey:"core",snapshotSelections:[{evaluationQueryId:"eq",snapshotId:"snapshot"}],aggregate,perQuery:[],warnings:[]}
describe("Evaluation History",()=>{
 test("renders the empty history state",()=>expect(renderToStaticMarkup(<EvaluationHistory runs={[]} onSelect={()=>{}}/>)).toContain("No saved evaluation runs yet"))
 test("renders summary metrics, policy version, and detail",()=>{const html=renderToStaticMarkup(<EvaluationHistory runs={[summary]} selected={detail} onSelect={()=>{}}/>);expect(html).toContain("Evaluation History");expect(html).toContain("Metric Policy v1");expect(html).toContain("dataset v1");expect(html).toContain("nDCG@10: 74.0%");expect(html).toContain("Benchmark Recall: 60.0%");expect(html).toContain("MRR: 50.0%");expect(html).toContain("Coverage: 70.0%");expect(html).toContain("Saved run detail");expect(html).toContain("immutable saved evaluation run")})
})
