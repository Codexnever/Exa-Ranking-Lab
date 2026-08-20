import { aggregateEvaluation, benchmarkRecallAtK, hitAtK, judgedPrecisionAtK, judgmentCoverageAtK, ndcgAtK, reciprocalRank } from "../metrics/calculations"
import type { PerQueryEvaluationResult, RankedEvaluationItem } from "../metrics/types"

const item=(rank:number,grade:0|1|2|null,key=`d${rank}`):RankedEvaluationItem=>({rank,grade,documentKey:key})

describe("Evaluation Metric Policy v1 formulas",()=>{
  test("nDCG is perfect for ideal order and lower for a worse graded order",()=>{
    expect(ndcgAtK([item(1,2),item(2,1)],[2,1],2).value).toBe(1)
    expect(ndcgAtK([item(1,1),item(2,2)],[2,1],2).value!).toBeLessThan(1)
  })
  test("nDCG uses graded gain, cutoff, preserves unjudged ranks, and is unavailable without relevant truth",()=>{
    const high=ndcgAtK([item(1,2)],[2,1],1).value!
    const low=ndcgAtK([item(1,1)],[2,1],1).value!
    expect(high).toBeGreaterThan(low)
    expect(ndcgAtK([item(1,null),item(2,2)],[2],2).value).toBeCloseTo(1/Math.log2(3))
    expect(ndcgAtK([item(1,null),item(2,2)],[2],1).value).toBe(0)
    expect(ndcgAtK([],[],5)).toMatchObject({value:null,eligible:false})
  })
  test.each([[1,1],[2,.5],[5,.2]] as const)("reciprocal rank at rank %i is %f",(rank,expected)=>expect(reciprocalRank([item(rank,1)])).toBe(expected))
  test("reciprocal rank is zero without a ranked relevant result",()=>expect(reciprocalRank([item(1,null),item(2,0)])).toBe(0))
  test("Hit@K detects relevant results only inside K",()=>{const rows=[item(1,null),item(3,1)];expect(hitAtK(rows,3)).toBe(1);expect(hitAtK(rows,2)).toBe(0);expect(hitAtK([item(1,0)],5)).toBe(0)})
  test("benchmark recall is benchmark-relative, cutoff-aware, and unavailable without known relevant docs",()=>{
    const rows=[item(1,1,"a"),item(4,2,"b")],known=new Set(["a","b"])
    expect(benchmarkRecallAtK(rows,known,4).value).toBe(1)
    expect(benchmarkRecallAtK(rows,known,2).value).toBe(.5)
    expect(benchmarkRecallAtK(rows,new Set(),5).value).toBeNull()
  })
  test("judged precision excludes unjudged results and is unavailable without judged top-K docs",()=>{
    expect(judgedPrecisionAtK([item(1,1),item(2,2)],2).value).toBe(1)
    expect(judgedPrecisionAtK([item(1,1),item(2,0),item(3,null)],3).value).toBe(.5)
    expect(judgedPrecisionAtK([item(1,null)],1).value).toBeNull()
  })
  test("coverage uses evaluated results when K exceeds length and handles empty rankings",()=>{
    expect(judgmentCoverageAtK([item(1,1),item(2,0)],5).value).toBe(1)
    expect(judgmentCoverageAtK([item(1,1),item(2,null)],2).value).toBe(.5)
    expect(judgmentCoverageAtK([],5).value).toBeNull()
  })
})

describe("macro aggregation",()=>{
  const result=(id:string,rr:number,value:number,eligible=true,warnings:string[]=[]):PerQueryEvaluationResult=>({datasetVersionId:"d",evaluationQueryId:id,sourceQueryId:id,snapshotId:`s-${id}`,metricVersion:"1",eligible,reciprocalRank:rr,warnings,metrics:[{cutoff:5,ndcg:{value,eligible:true},benchmarkRecall:{value,eligible:true},hit:value?1:0,judgedPrecision:{value,eligible:true},judgmentCoverage:{value,eligible:true},counts:{evaluatedTopK:1,judged:1,judgedRelevant:1,judgedIrrelevant:0,unjudged:0,knownRelevantBenchmarkDocuments:1,duplicateCanonicalResultsIgnored:0}}]})
  test("uses query-level macro means, excludes skipped queries, and preserves warnings",()=>{
    const aggregate=aggregateEvaluation([result("a",1,1),result("b",.5,.5),result("skip",0,0,false,["No truth"])],[5])
    expect(aggregate).toMatchObject({eligibleQueryCount:2,skippedQueryCount:1,mrr:{value:.75,eligibleQueryCount:2}})
    expect(aggregate.byCutoff[0].meanNdcg.value).toBeCloseTo(.75)
    expect(aggregate.byCutoff[0].meanHit.value).toBe(1)
    expect(aggregate.warnings).toContain("skip: No truth")
  })
})
