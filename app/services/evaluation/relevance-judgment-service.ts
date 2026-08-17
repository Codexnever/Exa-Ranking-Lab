import { databases, DATABASE_ID, COLLECTIONS } from "@/app/server/appwrite/appwrite-server"
import { transformSnapshotDocument } from "@/utils/db-utils"
import { createJudgmentKey, getDocumentIdentity } from "@/utils/canonicalize-document-url"
import type { RankingSnapshot, SearchResult } from "@/types/type"
import type { EvaluationDatasetVersion, EvaluationQuery, EvaluationQueryJudgments, JudgmentAssessment, JudgmentSummary, RelevanceGrade, RelevanceJudgment } from "@/types/evaluation"
import { AppwriteEvaluationRepository, type EvaluationRepository } from "./evaluation-dataset-service"
import { EvaluationError, invalid } from "./evaluation-errors"
import { parseAdjudicationInput, parseJudgmentBatch, type ParsedJudgmentLabel } from "./evaluation-input-validation"

const MAX_ASSESSMENTS=50,MAX_PROVENANCE_ITEMS=50
const JSON_LIMITS={assessments:16_384,feedback:4_096,snapshots:4_096,rawUrls:16_384,hashes:8_192}
export interface SnapshotReader { getSnapshot(id:string):Promise<RankingSnapshot|null> }
class AppwriteSnapshotReader implements SnapshotReader {
  async getSnapshot(id:string):Promise<RankingSnapshot|null>{try{return transformSnapshotDocument(await databases.getDocument(DATABASE_ID,COLLECTIONS.SNAPSHOTS,id),false)}catch(error){if((error as{code?:number})?.code===404)return null;throw new EvaluationError("STORAGE_ERROR","Failed to read snapshot",500)}}
}
export interface JudgmentBatch { snapshotId:string;labels:ParsedJudgmentLabel[] }
function uniqueBounded(values:string[],name:string):string[]{const result=[...new Set(values)];if(result.length>MAX_PROVENANCE_ITEMS)throw new EvaluationError("PROVENANCE_LIMIT",`${name} exceeds ${MAX_PROVENANCE_ITEMS} entries`,409);return result}
function assertJson(value:unknown,limit:number,name:string){if(Buffer.byteLength(JSON.stringify(value),"utf8")>limit)throw new EvaluationError("PROVENANCE_LIMIT",`${name} exceeds its storage limit`,409)}
function assessmentKey(assessment:JudgmentAssessment,documentKey:string){return [assessment.assessorUserId,assessment.proposedGrade,assessment.sourceSnapshotId??"",assessment.sourceFeedbackId??"",documentKey].join("\n")}

export class RelevanceJudgmentService {
  constructor(private readonly repository:EvaluationRepository,private readonly snapshotReader:SnapshotReader=new AppwriteSnapshotReader()){}

  async submitDirectLabels(ownerUserId:string,datasetId:string,evaluationQueryId:string,batch:JudgmentBatch):Promise<EvaluationQueryJudgments>{
    batch=parseJudgmentBatch(batch)
    const {dataset,query}=await this.context(ownerUserId,datasetId,evaluationQueryId,true)
    const snapshot=await this.snapshotReader.getSnapshot(batch.snapshotId)
    if(!snapshot)throw new EvaluationError("NOT_FOUND","Snapshot not found",404)
    if(snapshot.userId!==ownerUserId)throw new EvaluationError("UNAUTHORIZED","Snapshot is not owned by the dataset owner",403)
    if(snapshot.queryId!==query.sourceQueryId)throw new EvaluationError("SNAPSHOT_MISMATCH","Snapshot does not belong to the benchmark source query",409)
    const snapshotConfig=typeof snapshot.metadata.configHash==="string"?snapshot.metadata.configHash:undefined
    if(snapshotConfig&&snapshotConfig!==query.configHash)throw new EvaluationError("CONFIG_MISMATCH","Snapshot configuration does not match the frozen benchmark query",409)
    // Resolve the complete request before the first write so an invalid later label
    // cannot leave a partially-applied batch.
    const resolved=batch.labels.map(label=>({label,result:this.result(snapshot,label.resultUrl)}))
    let mutationStarted=false
    try{
      for(const {label,result} of resolved){mutationStarted=true;await this.applyProposal(dataset,query,snapshot,result,label,ownerUserId)}
    }finally{
      // Appwrite has no cross-document transaction here. Reconciliation also keeps
      // server-owned counts correct if a storage failure interrupts the batch.
      if(mutationStarted)await this.reconcileCounts(dataset.id)
    }
    return this.getJudgmentsForEvaluationQuery(ownerUserId,datasetId,evaluationQueryId)
  }

  async adjudicate(ownerUserId:string,datasetId:string,judgmentId:string,grade:RelevanceGrade,rationale:string):Promise<RelevanceJudgment>{
    ;({grade,rationale}=parseAdjudicationInput({grade,rationale}))
    const dataset=await this.ownedDataset(ownerUserId,datasetId,true)
    const judgment=await this.repository.getJudgment(judgmentId)
    if(!judgment||judgment.datasetVersionId!==dataset.id)throw new EvaluationError("NOT_FOUND","Relevance judgment not found",404)
    if(judgment.status!=="conflicted")throw new EvaluationError("INVALID_STATE","Only a conflicted judgment can be adjudicated",409)
    if(!rationale.trim())throw invalid("A rationale is required to adjudicate a conflict")
    const now=new Date();const assessment:JudgmentAssessment={assessorUserId:ownerUserId,proposedGrade:grade,rationale:rationale.trim(),source:"curator_adjudication",createdAt:now}
    const updated={...judgment,status:"accepted" as const,relevanceGrade:grade,rationale:rationale.trim(),assessments:this.appendAssessment(judgment.assessments,assessment,judgment.documentKey),updatedAt:now,updatedByUserId:ownerUserId,acceptedAt:now,acceptedByUserId:ownerUserId}
    this.assertStorageBounds(updated)
    const saved=await this.repository.updateJudgment(updated);await this.reconcileCounts(dataset.id);return saved
  }

  async getJudgmentsForEvaluationQuery(ownerUserId:string,datasetId:string,evaluationQueryId:string):Promise<EvaluationQueryJudgments>{
    const {dataset,query}=await this.context(ownerUserId,datasetId,evaluationQueryId,false)
    const judgments=await this.repository.listJudgments(datasetId,evaluationQueryId)
    return {dataset,query,judgments,summary:this.summary(judgments)}
  }
  async getAcceptedJudgmentsForEvaluationQuery(ownerUserId:string,datasetId:string,evaluationQueryId:string):Promise<RelevanceJudgment[]>{
    const detail=await this.getJudgmentsForEvaluationQuery(ownerUserId,datasetId,evaluationQueryId)
    return detail.judgments.filter(judgment=>judgment.status==="accepted"&&judgment.relevanceGrade!==null)
  }

  private async applyProposal(dataset:EvaluationDatasetVersion,query:EvaluationQuery,snapshot:RankingSnapshot,result:SearchResult,label:ParsedJudgmentLabel,userId:string){
    const identity=getDocumentIdentity(result.url);const key=createJudgmentKey(dataset.id,query.id,identity.documentKey);const now=new Date()
    const assessment:JudgmentAssessment={assessorUserId:userId,proposedGrade:label.grade,source:"direct_label",sourceSnapshotId:snapshot.id,observedRawUrl:result.url,observedContentHash:result.contentHash,createdAt:now,...(label.rationale?{rationale:label.rationale}:{})}
    let existing=await this.repository.getJudgmentByKey(key)
    if(!existing){
      const judgment:Omit<RelevanceJudgment,"id">={judgmentKey:key,datasetVersionId:dataset.id,evaluationQueryId:query.id,sourceQueryId:query.sourceQueryId,documentKey:identity.documentKey,canonicalUrl:identity.canonicalUrl,domain:result.domain||new URL(identity.canonicalUrl).hostname,status:"accepted",relevanceGrade:label.grade,source:"direct_label",assessments:[assessment],sourceFeedbackIds:[],sourceSnapshotIds:[snapshot.id],observedRawUrls:[result.url],observedContentHashes:result.contentHash?[result.contentHash]:[],...(label.rationale?{rationale:label.rationale}:{}),createdAt:now,createdByUserId:userId,updatedAt:now,updatedByUserId:userId,acceptedAt:now,acceptedByUserId:userId}
      this.assertStorageBounds(judgment)
      try{await this.repository.createJudgment(judgment);return}catch(error){if(!(error instanceof EvaluationError)||error.code!=="CONFLICT")throw error;existing=await this.repository.getJudgmentByKey(key);if(!existing)throw error}
    }
    const assessments=this.appendAssessment(existing.assessments,assessment,identity.documentKey)
    const isDuplicate=assessments.length===existing.assessments.length
    const sourceSnapshotIds=uniqueBounded([...existing.sourceSnapshotIds,snapshot.id],"sourceSnapshotIds")
    const observedRawUrls=uniqueBounded([...existing.observedRawUrls,result.url],"observedRawUrls")
    const observedContentHashes=uniqueBounded([...existing.observedContentHashes,...(result.contentHash?[result.contentHash]:[])],"observedContentHashes")
    if(isDuplicate&&sourceSnapshotIds.length===existing.sourceSnapshotIds.length&&observedRawUrls.length===existing.observedRawUrls.length&&observedContentHashes.length===existing.observedContentHashes.length)return
    const conflicted=existing.status==="conflicted"||(existing.status==="accepted"&&existing.relevanceGrade!==label.grade)
    const updated:RelevanceJudgment={...existing,assessments,sourceSnapshotIds,observedRawUrls,observedContentHashes,status:conflicted?"conflicted":"accepted",relevanceGrade:conflicted?null:label.grade,updatedAt:now,updatedByUserId:userId,...(conflicted?{acceptedAt:undefined,acceptedByUserId:undefined}:{acceptedAt:existing.acceptedAt??now,acceptedByUserId:existing.acceptedByUserId??userId})}
    this.assertStorageBounds(updated);await this.repository.updateJudgment(updated)
  }
  private result(snapshot:RankingSnapshot,rawUrl:string):SearchResult{const target=getDocumentIdentity(rawUrl).documentKey;const result=snapshot.results.find(item=>{try{return getDocumentIdentity(item.url).documentKey===target}catch{return false}});if(!result)throw new EvaluationError("RESULT_NOT_FOUND","Submitted result URL is not present in the snapshot",404);return result}
  private appendAssessment(existing:JudgmentAssessment[],next:JudgmentAssessment,documentKey:string){if(existing.some(item=>assessmentKey(item,documentKey)===assessmentKey(next,documentKey)))return existing;if(existing.length>=MAX_ASSESSMENTS)throw new EvaluationError("PROVENANCE_LIMIT",`assessments exceeds ${MAX_ASSESSMENTS} entries`,409);return [...existing,next]}
  private assertStorageBounds(j:Omit<RelevanceJudgment,"id">|RelevanceJudgment){assertJson(j.assessments,JSON_LIMITS.assessments,"assessmentsJson");assertJson(j.sourceFeedbackIds,JSON_LIMITS.feedback,"sourceFeedbackIdsJson");assertJson(j.sourceSnapshotIds,JSON_LIMITS.snapshots,"sourceSnapshotIdsJson");assertJson(j.observedRawUrls,JSON_LIMITS.rawUrls,"observedRawUrlsJson");assertJson(j.observedContentHashes,JSON_LIMITS.hashes,"observedContentHashesJson")}
  private summary(items:RelevanceJudgment[]):JudgmentSummary{return{accepted:items.filter(i=>i.status==="accepted").length,pending:items.filter(i=>i.status==="pending").length,conflicted:items.filter(i=>i.status==="conflicted").length,total:items.length}}
  private async reconcileCounts(datasetId:string){const items=await this.repository.listJudgments(datasetId);await this.repository.updateDataset(datasetId,{judgmentCount:items.filter(i=>i.status==="accepted").length,conflictCount:items.filter(i=>i.status==="conflicted").length,updatedAt:new Date()})}
  private async ownedDataset(userId:string,id:string,mutable:boolean){const dataset=await this.repository.getDataset(id);if(!dataset)throw new EvaluationError("NOT_FOUND","Evaluation dataset not found",404);if(dataset.ownerUserId!==userId)throw new EvaluationError("UNAUTHORIZED","Evaluation dataset access denied",403);if(mutable&&dataset.status!=="draft")throw new EvaluationError("DATASET_NOT_DRAFT","Judgments can only be changed on a draft dataset",409);return dataset}
  private async context(userId:string,datasetId:string,queryId:string,mutable:boolean){const dataset=await this.ownedDataset(userId,datasetId,mutable);const query=await this.repository.getQuery(queryId);if(!query||query.datasetVersionId!==dataset.id)throw new EvaluationError("NOT_FOUND","Evaluation query not found in dataset",404);return{dataset,query}}
}
export function createRelevanceJudgmentService(repository:EvaluationRepository,snapshotReader?:SnapshotReader){return new RelevanceJudgmentService(repository,snapshotReader)}

export const relevanceJudgmentService = new RelevanceJudgmentService(new AppwriteEvaluationRepository())
