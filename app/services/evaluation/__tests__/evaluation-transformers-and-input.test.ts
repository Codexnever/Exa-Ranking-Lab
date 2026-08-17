import { transformEvaluationDatasetDocument,transformEvaluationQueryDocument } from "../evaluation-document-transformers"
import { parseCreateDatasetInput,parseListInput,parseQueryIds } from "../evaluation-input-validation"
const baseDataset={ $id:"d1",familyKey:"core",name:"Core",version:1,status:"draft",ownerUserId:"u",createdByUserId:"u",createdAt:"2026-01-01T00:00:00Z",updatedAt:"2026-01-01T00:00:00Z",queryCount:0,judgmentCount:0,conflictCount:0,canonicalizationVersion:"1" }
const baseQuery={ $id:"eq1",datasetVersionId:"d1",sourceQueryId:"q1",queryKey:"key",name:"Q",queryText:"text",category:"news",includeDomainsJson:"[]",excludeDomainsJson:"[]",numResults:10,configHash:"hash",createdAt:"2026-01-01T00:00:00Z",createdByUserId:"u" }
describe("strict evaluation transformers",()=>{
 test("transforms valid stored documents",()=>{expect(transformEvaluationDatasetDocument(baseDataset).version).toBe(1);expect(transformEvaluationQueryDocument(baseQuery).filters.numResults).toBe(10)})
 test("rejects invalid stored dataset status and version",()=>{expect(()=>transformEvaluationDatasetDocument({...baseDataset,status:"open"})).toThrow();expect(()=>transformEvaluationDatasetDocument({...baseDataset,version:0})).toThrow()})
 test("rejects missing IDs and malformed query",()=>{expect(()=>transformEvaluationDatasetDocument({...baseDataset,$id:""})).toThrow();expect(()=>transformEvaluationQueryDocument({...baseQuery,category:"bad"})).toThrow();expect(()=>transformEvaluationQueryDocument({...baseQuery,includeDomainsJson:"bad"})).toThrow()})
})
describe("Phase 2 API input shaping",()=>{
 test("rejects arbitrary authoritative create fields",()=>expect(()=>parseCreateDatasetInput({name:"Core",status:"frozen"})).toThrow())
 test("rejects oversized batches",()=>expect(()=>parseQueryIds({queryIds:Array.from({length:51},(_,i)=>`q${i}`)})).toThrow())
 test("rejects invalid pagination and status",()=>{expect(()=>parseListInput(new URLSearchParams("limit=0"))).toThrow();expect(()=>parseListInput(new URLSearchParams("offset=-1"))).toThrow();expect(()=>parseListInput(new URLSearchParams("status=open"))).toThrow()})
})
