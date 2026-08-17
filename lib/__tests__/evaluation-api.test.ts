import { evaluationApi } from "../evaluation-api"

describe("evaluation API client input shaping",()=>{beforeEach(()=>{global.fetch=jest.fn().mockResolvedValue({ok:true,json:async()=>({})}) as jest.Mock})
 test("creates datasets with user-editable fields only",async()=>{await evaluationApi.create({name:"Core",description:"Benchmark"});expect(fetch).toHaveBeenCalledWith("/api/evaluation/datasets",expect.objectContaining({method:"POST",body:JSON.stringify({name:"Core",description:"Benchmark"})}))})
 test("adds only operational query IDs",async()=>{await evaluationApi.addQueries("d1",["q1","q2"]);expect(fetch).toHaveBeenCalledWith("/api/evaluation/datasets/d1/queries",expect.objectContaining({body:JSON.stringify({queryIds:["q1","q2"]})}))})
 test("saves one safe judgment batch instead of per-click requests",async()=>{await evaluationApi.saveJudgments("d1","eq1","s1",[{resultUrl:"https://example.com",grade:0}]);expect(fetch).toHaveBeenCalledTimes(1);expect(fetch).toHaveBeenCalledWith("/api/evaluation/datasets/d1/queries/eq1/judgments",expect.objectContaining({method:"PUT",body:JSON.stringify({snapshotId:"s1",labels:[{resultUrl:"https://example.com",grade:0}]})}))})
})
