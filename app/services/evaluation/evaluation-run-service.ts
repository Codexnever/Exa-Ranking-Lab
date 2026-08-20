import { databases, DATABASE_ID, COLLECTIONS, ID, Query } from "@/app/server/appwrite/appwrite-server"
import type { EvaluationDatasetVersion } from "@/types/evaluation"
import type { EvaluationRun, EvaluationRunList, EvaluationRunSummary } from "@/types/evaluation-runs"
import type { EvaluationMetricsInput } from "./metrics/evaluation-metrics-service"
import { evaluationMetricsService, type EvaluationMetricsService } from "./metrics/evaluation-metrics-service"
import { EVALUATION_METRIC_VERSION, type EvaluationMetricsResponse } from "./metrics/types"
import { AppwriteEvaluationRepository, type EvaluationRepository } from "./evaluation-dataset-service"
import { EvaluationError, invalid } from "./evaluation-errors"
import { transformEvaluationRun, transformEvaluationRunSummary } from "./evaluation-run-transformers"

type Document = Record<string, unknown>
export interface EvaluationRunRepository {
  createRun(id:string,data:Record<string,unknown>):Promise<Document>
  createRunQuery(id:string,data:Record<string,unknown>):Promise<Document>
  deleteRun(id:string):Promise<void>
  deleteRunQueries(runId:string):Promise<void>
  listRuns(datasetVersionId:string,limit:number,offset:number):Promise<{documents:Document[];total:number}>
  getRun(id:string):Promise<Document|null>
  listRunQueries(runId:string):Promise<Document[]>
}

function storageError(error:unknown,action:string):never{if(error instanceof EvaluationError)throw error;const code=(error as{code?:number})?.code;if(code===404)throw new EvaluationError("NOT_FOUND",`${action} not found`,404);throw new EvaluationError("STORAGE_ERROR",`Failed to ${action}`,500)}
export class AppwriteEvaluationRunRepository implements EvaluationRunRepository{
 async createRun(id:string,data:Record<string,unknown>){try{return await databases.createDocument(DATABASE_ID,COLLECTIONS.EVALUATION_RUNS,id,data) as unknown as Document}catch(error){storageError(error,"create evaluation run")}}
 async createRunQuery(id:string,data:Record<string,unknown>){try{return await databases.createDocument(DATABASE_ID,COLLECTIONS.EVALUATION_RUN_QUERIES,id,data) as unknown as Document}catch(error){storageError(error,"create evaluation run query")}}
 async deleteRun(id:string){try{await databases.deleteDocument(DATABASE_ID,COLLECTIONS.EVALUATION_RUNS,id)}catch(error){if((error as{code?:number})?.code!==404)storageError(error,"clean incomplete evaluation run")}}
 async deleteRunQueries(runId:string){try{const docs=await this.listRunQueries(runId);await Promise.all(docs.map(doc=>databases.deleteDocument(DATABASE_ID,COLLECTIONS.EVALUATION_RUN_QUERIES,String(doc.$id))))}catch(error){storageError(error,"clean incomplete evaluation run")}}
 async listRuns(datasetVersionId:string,limit:number,offset:number){try{const result=await databases.listDocuments(DATABASE_ID,COLLECTIONS.EVALUATION_RUNS,[Query.equal("datasetVersionId",datasetVersionId),Query.orderDesc("createdAt"),Query.limit(limit),Query.offset(offset)]);return{documents:result.documents as unknown as Document[],total:result.total}}catch(error){storageError(error,"list evaluation runs")}}
 async getRun(id:string){try{return await databases.getDocument(DATABASE_ID,COLLECTIONS.EVALUATION_RUNS,id) as unknown as Document}catch(error){if((error as{code?:number})?.code===404)return null;storageError(error,"read evaluation run")}}
 async listRunQueries(runId:string){try{const output:Document[]=[];let offset=0;while(true){const result=await databases.listDocuments(DATABASE_ID,COLLECTIONS.EVALUATION_RUN_QUERIES,[Query.equal("runId",runId),Query.orderAsc("evaluationQueryId"),Query.limit(500),Query.offset(offset)]);output.push(...result.documents as unknown as Document[]);if(result.documents.length<500)return output;offset+=result.documents.length}}catch(error){storageError(error,"list evaluation run queries")}}
}

const json=(value:unknown,name:string,max:number)=>{const serialized=JSON.stringify(value);if(Buffer.byteLength(serialized,"utf8")>max)throw new EvaluationError("PROVENANCE_LIMIT",`${name} exceeds the evaluation history storage limit`,413);return serialized}
export class EvaluationRunService{
 constructor(private readonly evaluationRepository:EvaluationRepository=new AppwriteEvaluationRepository(),private readonly runRepository:EvaluationRunRepository=new AppwriteEvaluationRunRepository(),private readonly metricsService:EvaluationMetricsService=evaluationMetricsService){}

 async createRun(ownerUserId:string,datasetId:string,input:EvaluationMetricsInput):Promise<EvaluationRun>{
  const dataset=await this.ownedFrozenDataset(ownerUserId,datasetId)
  const result=await this.metricsService.evaluate(ownerUserId,datasetId,input)
  if(result.metricVersion!==EVALUATION_METRIC_VERSION)throw new EvaluationError("INVALID_STATE","Metric service returned an unsupported policy version",500)
  const runId=ID.unique(),createdAt=new Date()
  try{
   for(const perQuery of result.perQuery)await this.runRepository.createRunQuery(ID.unique(),{runId,datasetVersionId:dataset.id,evaluationQueryId:perQuery.evaluationQueryId,snapshotId:perQuery.snapshotId,resultJson:json(perQuery,"per-query result",32_768),createdAt:createdAt.toISOString()})
   const header=await this.runRepository.createRun(runId,this.header(dataset,result,createdAt,ownerUserId))
   return transformEvaluationRun(header,await this.runRepository.listRunQueries(runId))
  }catch(error){await Promise.all([this.runRepository.deleteRun(runId).catch(()=>undefined),this.runRepository.deleteRunQueries(runId).catch(()=>undefined)]);throw error}
 }
 async listRuns(ownerUserId:string,datasetId:string,options:{limit?:number;offset?:number}={}):Promise<EvaluationRunList>{const dataset=await this.ownedDataset(ownerUserId,datasetId);const limit=this.page(options.limit,"limit",20,1,100),offset=this.page(options.offset,"offset",0,0,10_000);const result=await this.runRepository.listRuns(dataset.id,limit,offset),runs=result.documents.map(transformEvaluationRunSummary);if(runs.some(run=>run.datasetVersionId!==dataset.id||run.datasetFamilyKey!==dataset.familyKey||run.datasetVersion!==dataset.version||run.createdByUserId!==ownerUserId))throw new EvaluationError("INVALID_STATE","Evaluation history contains a foreign or incompatible run",409);return{runs,total:result.total,limit,offset}}
 async getRun(ownerUserId:string,datasetId:string,runId:string):Promise<EvaluationRun>{const dataset=await this.ownedDataset(ownerUserId,datasetId);if(!runId?.trim())throw invalid("Run ID is required");const document=await this.runRepository.getRun(runId);if(!document||document.datasetVersionId!==datasetId)throw new EvaluationError("NOT_FOUND","Evaluation run not found",404);const run=transformEvaluationRun(document,await this.runRepository.listRunQueries(runId));if(run.createdByUserId!==ownerUserId)throw new EvaluationError("UNAUTHORIZED","Evaluation run access denied",403);if(run.datasetFamilyKey!==dataset.familyKey||run.datasetVersion!==dataset.version)throw new EvaluationError("INVALID_STATE","Evaluation run does not match the immutable dataset version",409);return run}
 private header(dataset:EvaluationDatasetVersion,result:EvaluationMetricsResponse,createdAt:Date,userId:string):Record<string,unknown>{const cutoffs=result.aggregate.byCutoff.map(item=>item.cutoff);const selections=Object.entries(result.snapshotSelections).map(([evaluationQueryId,snapshotId])=>({evaluationQueryId,snapshotId}));return{datasetVersionId:dataset.id,datasetFamilyKey:dataset.familyKey,datasetVersion:dataset.version,metricVersion:EVALUATION_METRIC_VERSION,status:"completed",cutoffsJson:json(cutoffs,"cutoffs",2_048),snapshotSelectionsJson:json(selections,"snapshot selections",32_768),aggregateResultJson:json(result.aggregate,"aggregate result",32_768),warningsJson:json(result.aggregate.warnings,"warnings",32_768),eligibleQueryCount:result.aggregate.eligibleQueryCount,skippedQueryCount:result.aggregate.skippedQueryCount,selectedQueryCount:result.perQuery.length,createdAt:createdAt.toISOString(),createdByUserId:userId}}
 private async ownedDataset(userId:string,id:string){if(!userId?.trim()||!id?.trim())throw invalid("Authenticated owner and dataset ID are required");const dataset=await this.evaluationRepository.getDataset(id);if(!dataset)throw new EvaluationError("NOT_FOUND","Evaluation dataset not found",404);if(dataset.ownerUserId!==userId)throw new EvaluationError("UNAUTHORIZED","Evaluation dataset access denied",403);return dataset}
 private async ownedFrozenDataset(userId:string,id:string){const dataset=await this.ownedDataset(userId,id);if(dataset.status!=="frozen")throw new EvaluationError("DATASET_NOT_FROZEN","Persisted evaluation runs require a frozen dataset",409);return dataset}
 private page(value:number|undefined,name:string,fallback:number,min:number,max:number){const parsed=value===undefined?fallback:value;if(!Number.isInteger(parsed)||parsed<min||parsed>max)throw invalid(`${name} must be an integer between ${min} and ${max}`);return parsed}
}
export const evaluationRunService=new EvaluationRunService()
