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

import { transformRelevanceJudgmentDocument } from "../evaluation-document-transformers"
import { MAX_JUDGMENT_BATCH, MAX_RATIONALE, parseAdjudicationInput, parseJudgmentBatch } from "../evaluation-input-validation"

const assessment = { assessorUserId:"u", proposedGrade:2, source:"direct_label", createdAt:"2026-01-01T00:00:00Z" }
const baseJudgment = {
  $id:"j1", judgmentKey:"jk", datasetVersionId:"d1", evaluationQueryId:"eq1", sourceQueryId:"q1",
  documentKey:"dk", canonicalUrl:"https://example.com/", domain:"example.com", relevanceGrade:2,
  status:"accepted", source:"direct_label", assessmentsJson:JSON.stringify([assessment]),
  sourceFeedbackIdsJson:"[]", sourceSnapshotIdsJson:'["s1"]', observedRawUrlsJson:'["https://example.com/"]',
  observedContentHashesJson:"[]", createdAt:"2026-01-01T00:00:00Z", createdByUserId:"u",
  updatedAt:"2026-01-01T00:00:00Z", updatedByUserId:"u", acceptedAt:"2026-01-01T00:00:00Z", acceptedByUserId:"u",
}

describe("strict relevance judgment transformer", () => {
  test("transforms a valid authoritative judgment", () => expect(transformRelevanceJudgmentDocument(baseJudgment).relevanceGrade).toBe(2))
  test("rejects invalid stored grades and state combinations", () => {
    expect(() => transformRelevanceJudgmentDocument({...baseJudgment,relevanceGrade:3})).toThrow()
    expect(() => transformRelevanceJudgmentDocument({...baseJudgment,relevanceGrade:null})).toThrow()
    expect(() => transformRelevanceJudgmentDocument({...baseJudgment,status:"conflicted"})).toThrow()
  })
  test("rejects malformed assessment and provenance JSON", () => {
    expect(() => transformRelevanceJudgmentDocument({...baseJudgment,assessmentsJson:"{"})).toThrow()
    expect(() => transformRelevanceJudgmentDocument({...baseJudgment,sourceSnapshotIdsJson:'[1]'})).toThrow()
  })
  test("rejects missing identity and invalid source", () => {
    expect(() => transformRelevanceJudgmentDocument({...baseJudgment,documentKey:""})).toThrow()
    expect(() => transformRelevanceJudgmentDocument({...baseJudgment,source:"stars"})).toThrow()
  })
})

describe("Phase 3 API input shaping", () => {
  const valid={snapshotId:"s1",labels:[{resultUrl:"https://example.com",grade:2}]}
  test("accepts only safe judgment and adjudication fields", () => {
    expect(parseJudgmentBatch(valid).labels[0].grade).toBe(2)
    expect(parseAdjudicationInput({grade:1,rationale:"Reviewed conflict"})).toEqual({grade:1,rationale:"Reviewed conflict"})
    expect(() => parseJudgmentBatch({...valid,status:"accepted"})).toThrow()
    expect(() => parseAdjudicationInput({grade:1,rationale:"ok",acceptedByUserId:"u"})).toThrow()
  })
  test("rejects invalid grades, IDs, oversized batches, and rationale", () => {
    expect(() => parseJudgmentBatch({...valid,snapshotId:""})).toThrow()
    expect(() => parseJudgmentBatch({snapshotId:"s1",labels:[{resultUrl:"https://example.com",grade:1.5}]})).toThrow()
    expect(() => parseJudgmentBatch({snapshotId:"s1",labels:Array.from({length:MAX_JUDGMENT_BATCH+1},()=>valid.labels[0])})).toThrow()
    expect(() => parseJudgmentBatch({snapshotId:"s1",labels:[{...valid.labels[0],rationale:"x".repeat(MAX_RATIONALE+1)}]})).toThrow()
  })
})
