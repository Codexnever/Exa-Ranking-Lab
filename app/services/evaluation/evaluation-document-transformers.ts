import { VALID_CATEGORIES, type ExaCategory } from "@/constants/category-map"
import type { EvaluationDatasetVersion, EvaluationQuery, JudgmentSource, JudgmentStatus, RelevanceJudgment } from "@/types/evaluation"
import { assertEvaluationDatasetVersion, assertJudgmentState, assertRequiredId } from "./evaluation-validation"

function requiredString(doc: Record<string, unknown>, key: string): string {
  const value = doc[key]
  assertRequiredId(key, value)
  return value
}
function date(doc: Record<string, unknown>, key: string, optional = false): Date | undefined {
  const value = doc[key]
  if (optional && (value === undefined || value === null || value === "")) return undefined
  if (typeof value !== "string" && !(value instanceof Date)) throw new TypeError(`${key} must be a date`)
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) throw new TypeError(`${key} must be a valid date`)
  return parsed
}
function stringArray(doc: Record<string, unknown>, key: string): string[] {
  const raw = requiredString(doc, key)
  let value: unknown
  try { value = JSON.parse(raw) } catch { throw new TypeError(`${key} must be valid JSON`) }
  if (!Array.isArray(value) || value.some(item => typeof item !== "string")) throw new TypeError(`${key} must contain a string array`)
  return [...value]
}
export function transformEvaluationDatasetDocument(input: unknown): EvaluationDatasetVersion {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("Dataset document must be an object")
  const doc = input as Record<string, unknown>
  const dataset: EvaluationDatasetVersion = {
    id: requiredString(doc, "$id"), familyKey: requiredString(doc, "familyKey"), name: requiredString(doc, "name"),
    ...(typeof doc.description === "string" && doc.description ? { description: doc.description } : {}),
    version: doc.version as number, status: doc.status as EvaluationDatasetVersion["status"],
    ...(typeof doc.parentVersionId === "string" && doc.parentVersionId ? { parentVersionId: doc.parentVersionId } : {}),
    ownerUserId: requiredString(doc, "ownerUserId"), createdByUserId: requiredString(doc, "createdByUserId"),
    createdAt: date(doc, "createdAt")!, updatedAt: date(doc, "updatedAt")!,
    ...(date(doc, "frozenAt", true) ? { frozenAt: date(doc, "frozenAt", true) } : {}),
    ...(typeof doc.frozenByUserId === "string" && doc.frozenByUserId ? { frozenByUserId: doc.frozenByUserId } : {}),
    queryCount: doc.queryCount as number, judgmentCount: doc.judgmentCount as number, conflictCount: doc.conflictCount as number,
    canonicalizationVersion: requiredString(doc, "canonicalizationVersion"),
  }
  assertEvaluationDatasetVersion(dataset)
  return dataset
}
export function transformEvaluationQueryDocument(input: unknown): EvaluationQuery {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("Evaluation query document must be an object")
  const doc = input as Record<string, unknown>
  const category = requiredString(doc, "category")
  if (!VALID_CATEGORIES.includes(category as ExaCategory)) throw new TypeError("Invalid stored evaluation query category")
  const numResults = doc.numResults
  if (!Number.isInteger(numResults) || (numResults as number) <= 0) throw new TypeError("numResults must be a positive integer")
  let searchConfig: Record<string, unknown> | undefined
  if (typeof doc.searchConfigJson === "string" && doc.searchConfigJson) {
    try { searchConfig = JSON.parse(doc.searchConfigJson) } catch { throw new TypeError("searchConfigJson must be valid JSON") }
    if (!searchConfig || typeof searchConfig !== "object" || Array.isArray(searchConfig)) throw new TypeError("searchConfigJson must contain an object")
  }
  return {
    id: requiredString(doc, "$id"), datasetVersionId: requiredString(doc, "datasetVersionId"),
    sourceQueryId: requiredString(doc, "sourceQueryId"), queryKey: requiredString(doc, "queryKey"),
    name: requiredString(doc, "name"), queryText: requiredString(doc, "queryText"), category: category as ExaCategory,
    filters: {
      includeDomains: stringArray(doc, "includeDomainsJson"), excludeDomains: stringArray(doc, "excludeDomainsJson"),
      ...(date(doc, "startDate", true) ? { startDate: date(doc, "startDate", true)!.toISOString() } : {}),
      ...(date(doc, "endDate", true) ? { endDate: date(doc, "endDate", true)!.toISOString() } : {}),
      numResults: numResults as number,
    },
    configHash: requiredString(doc, "configHash"), ...(searchConfig ? { searchConfig } : {}),
    createdAt: date(doc, "createdAt")!, createdByUserId: requiredString(doc, "createdByUserId"),
  }
}

function jsonArray(doc: Record<string, unknown>, key: string): unknown[] {
  const raw = requiredString(doc,key)
  let value: unknown
  try { value=JSON.parse(raw) } catch { throw new TypeError(`${key} must be valid JSON`) }
  if (!Array.isArray(value)) throw new TypeError(`${key} must contain an array`)
  return value
}
export function transformRelevanceJudgmentDocument(input: unknown): RelevanceJudgment {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("Judgment document must be an object")
  const doc=input as Record<string,unknown>
  const status=requiredString(doc,"status")
  const grade=doc.relevanceGrade === undefined || doc.relevanceGrade === null ? null : doc.relevanceGrade
  assertJudgmentState(status,grade)
  const assessmentValues=jsonArray(doc,"assessmentsJson")
  const assessments=assessmentValues.map((value,index) => {
    if (!value || typeof value!=="object" || Array.isArray(value)) throw new TypeError(`assessmentsJson[${index}] must be an object`)
    const item=value as Record<string,unknown>
    if (typeof item.assessorUserId!=="string" || !item.assessorUserId || ![0,1,2].includes(item.proposedGrade as number) || !["direct_label","feedback_promotion","curator_adjudication"].includes(item.source as string)) throw new TypeError(`assessmentsJson[${index}] is invalid`)
    const createdAt=new Date(item.createdAt as string)
    if(Number.isNaN(createdAt.getTime())) throw new TypeError(`assessmentsJson[${index}].createdAt is invalid`)
    return { assessorUserId:item.assessorUserId,proposedGrade:item.proposedGrade as 0|1|2,source:item.source as JudgmentSource,createdAt,
      ...(typeof item.rationale==="string"&&item.rationale?{rationale:item.rationale}:{}),...(typeof item.sourceFeedbackId==="string"&&item.sourceFeedbackId?{sourceFeedbackId:item.sourceFeedbackId}:{}),
      ...(typeof item.sourceSnapshotId==="string"&&item.sourceSnapshotId?{sourceSnapshotId:item.sourceSnapshotId}:{}),...(typeof item.observedRawUrl==="string"&&item.observedRawUrl?{observedRawUrl:item.observedRawUrl}:{}),
      ...(typeof item.observedContentHash==="string"&&item.observedContentHash?{observedContentHash:item.observedContentHash}:{}), }
  })
  const strings=(key:string)=>{const values=jsonArray(doc,key);if(values.some(value=>typeof value!=="string"))throw new TypeError(`${key} must contain strings`);return values as string[]}
  const source=requiredString(doc,"source")
  if(!["direct_label","feedback_promotion","curator_adjudication"].includes(source))throw new TypeError("Invalid stored judgment source")
  const acceptedAt=date(doc,"acceptedAt",true); const acceptedBy=typeof doc.acceptedByUserId==="string"&&doc.acceptedByUserId?doc.acceptedByUserId:undefined
  if(status==="accepted"&&(!acceptedAt||!acceptedBy))throw new TypeError("Accepted judgment requires accepted metadata")
  if(status!=="accepted"&&(acceptedAt||acceptedBy))throw new TypeError("Non-accepted judgment cannot expose accepted metadata")
  return { id:requiredString(doc,"$id"),judgmentKey:requiredString(doc,"judgmentKey"),datasetVersionId:requiredString(doc,"datasetVersionId"),evaluationQueryId:requiredString(doc,"evaluationQueryId"),sourceQueryId:requiredString(doc,"sourceQueryId"),documentKey:requiredString(doc,"documentKey"),canonicalUrl:requiredString(doc,"canonicalUrl"),domain:requiredString(doc,"domain"),status:status as JudgmentStatus,relevanceGrade:grade as 0|1|2|null,source:source as JudgmentSource,assessments,sourceFeedbackIds:strings("sourceFeedbackIdsJson"),sourceSnapshotIds:strings("sourceSnapshotIdsJson"),observedRawUrls:strings("observedRawUrlsJson"),observedContentHashes:strings("observedContentHashesJson"),...(typeof doc.rationale==="string"&&doc.rationale?{rationale:doc.rationale}:{}),...(typeof doc.intent==="string"&&doc.intent?{intent:doc.intent}:{}),...(typeof doc.subtopic==="string"&&doc.subtopic?{subtopic:doc.subtopic}:{}),createdAt:date(doc,"createdAt")!,createdByUserId:requiredString(doc,"createdByUserId"),updatedAt:date(doc,"updatedAt")!,updatedByUserId:requiredString(doc,"updatedByUserId"),...(acceptedAt?{acceptedAt}:{}),...(acceptedBy?{acceptedByUserId:acceptedBy}:{}) }
}
