import { databases, DATABASE_ID, COLLECTIONS, ID, Query } from "@/app/server/appwrite/appwrite-server"
import { transformQueryDocument } from "@/utils/db-utils"
import { computeConfigHash } from "@/utils/coverage-and-versioning"
import { CANONICALIZATION_VERSION, createEvaluationQueryKey } from "@/utils/canonicalize-document-url"
import type { QueryConfig } from "@/types/type"
import type { EvaluationDatasetDetail, EvaluationDatasetStatus, EvaluationDatasetVersion, EvaluationQuery, QueryFoundationReadiness } from "@/types/evaluation"
import { transformEvaluationDatasetDocument, transformEvaluationQueryDocument } from "./evaluation-document-transformers"
import { EvaluationError, invalid } from "./evaluation-errors"
import { normalizeFamilyKey, parseCloneInput, parseCreateDatasetInput, parseQueryIds } from "./evaluation-input-validation"

export interface DatasetListOptions { status?: EvaluationDatasetStatus; familyKey?: string; limit: number; offset: number }
export interface EvaluationRepository {
  createDataset(data: Omit<EvaluationDatasetVersion, "id">): Promise<EvaluationDatasetVersion>
  updateDataset(id: string, data: Partial<Pick<EvaluationDatasetVersion, "queryCount" | "updatedAt">>): Promise<EvaluationDatasetVersion>
  getDataset(id: string): Promise<EvaluationDatasetVersion | null>
  listDatasets(ownerUserId: string, options: DatasetListOptions): Promise<EvaluationDatasetVersion[]>
  listFamily(ownerUserId: string, familyKey: string): Promise<EvaluationDatasetVersion[]>
  listQueries(datasetVersionId: string): Promise<EvaluationQuery[]>
  createQuery(query: Omit<EvaluationQuery, "id">): Promise<EvaluationQuery>
}
export interface OperationalQueryReader { getQuery(id: string): Promise<QueryConfig | null> }

function isSchemaFailure(error: unknown): boolean {
  const type = typeof error === "object" && error !== null && "type" in error ? String((error as { type: unknown }).type) : ""
  return /(?:collection|database|attribute|index)_not_found|general_argument_invalid/.test(type)
}
function storageError(error: unknown, action: string): never {
  if (error instanceof EvaluationError) throw error
  if (isSchemaFailure(error)) throw new EvaluationError("SCHEMA_ERROR", "Evaluation storage schema is not provisioned or is incompatible", 500)
  const code = typeof error === "object" && error !== null && "code" in error ? Number((error as { code: unknown }).code) : 0
  if (code === 404) throw new EvaluationError("NOT_FOUND", `${action} not found`, 404)
  if (code === 409) throw new EvaluationError("CONFLICT", `${action} already exists`, 409)
  throw new EvaluationError("STORAGE_ERROR", `Failed to ${action}`, 500)
}

class AppwriteEvaluationRepository implements EvaluationRepository {
  async createDataset(data: Omit<EvaluationDatasetVersion, "id">): Promise<EvaluationDatasetVersion> {
    try {
      const doc = await databases.createDocument(DATABASE_ID, COLLECTIONS.EVALUATION_DATASETS, ID.unique(), {
        familyKey:data.familyKey,name:data.name,...(data.description ? { description:data.description } : {}),version:data.version,status:data.status,
        ...(data.parentVersionId ? { parentVersionId:data.parentVersionId } : {}),ownerUserId:data.ownerUserId,createdByUserId:data.createdByUserId,
        createdAt:data.createdAt.toISOString(),updatedAt:data.updatedAt.toISOString(),queryCount:data.queryCount,
        judgmentCount:data.judgmentCount,conflictCount:data.conflictCount,canonicalizationVersion:data.canonicalizationVersion,
      })
      return transformEvaluationDatasetDocument(doc)
    } catch (error) { storageError(error, "create evaluation dataset") }
  }
  async updateDataset(id: string, data: Partial<Pick<EvaluationDatasetVersion, "queryCount" | "updatedAt">>): Promise<EvaluationDatasetVersion> {
    try {
      const doc = await databases.updateDocument(DATABASE_ID, COLLECTIONS.EVALUATION_DATASETS, id, {
        ...(data.queryCount !== undefined ? { queryCount:data.queryCount } : {}),
        ...(data.updatedAt ? { updatedAt:data.updatedAt.toISOString() } : {}),
      })
      return transformEvaluationDatasetDocument(doc)
    } catch (error) { storageError(error, "update evaluation dataset") }
  }
  async getDataset(id: string): Promise<EvaluationDatasetVersion | null> {
    try { return transformEvaluationDatasetDocument(await databases.getDocument(DATABASE_ID, COLLECTIONS.EVALUATION_DATASETS, id)) }
    catch (error) { if (isSchemaFailure(error)) storageError(error,"read evaluation dataset"); if ((error as { code?: number })?.code === 404) return null; storageError(error, "read evaluation dataset") }
  }
  async listDatasets(ownerUserId: string, options: DatasetListOptions): Promise<EvaluationDatasetVersion[]> {
    try {
      const filters = [Query.equal("ownerUserId",ownerUserId),Query.orderDesc("createdAt"),Query.limit(options.limit),Query.offset(options.offset)]
      if (options.status) filters.push(Query.equal("status",options.status))
      if (options.familyKey) filters.push(Query.equal("familyKey",options.familyKey))
      const result = await databases.listDocuments(DATABASE_ID,COLLECTIONS.EVALUATION_DATASETS,filters)
      return result.documents.map(transformEvaluationDatasetDocument)
    } catch (error) { storageError(error, "list evaluation datasets") }
  }
  async listFamily(ownerUserId: string, familyKey: string): Promise<EvaluationDatasetVersion[]> {
    try {
      const result = await databases.listDocuments(DATABASE_ID,COLLECTIONS.EVALUATION_DATASETS,[Query.equal("ownerUserId",ownerUserId),Query.equal("familyKey",familyKey),Query.orderDesc("version"),Query.limit(100)])
      return result.documents.map(transformEvaluationDatasetDocument)
    } catch (error) { storageError(error, "list dataset family") }
  }
  async listQueries(datasetVersionId: string): Promise<EvaluationQuery[]> {
    try {
      const output: EvaluationQuery[] = []; let offset = 0
      while (true) {
        const result = await databases.listDocuments(DATABASE_ID,COLLECTIONS.EVALUATION_QUERIES,[Query.equal("datasetVersionId",datasetVersionId),Query.orderAsc("queryKey"),Query.limit(500),Query.offset(offset)])
        output.push(...result.documents.map(transformEvaluationQueryDocument)); offset += result.documents.length
        if (result.documents.length < 500) return output
      }
    } catch (error) { storageError(error, "list evaluation queries") }
  }
  async createQuery(query: Omit<EvaluationQuery, "id">): Promise<EvaluationQuery> {
    try {
      const doc = await databases.createDocument(DATABASE_ID,COLLECTIONS.EVALUATION_QUERIES,ID.unique(),{
        datasetVersionId:query.datasetVersionId,sourceQueryId:query.sourceQueryId,queryKey:query.queryKey,name:query.name,
        queryText:query.queryText,category:query.category,includeDomainsJson:JSON.stringify(query.filters.includeDomains ?? []),
        excludeDomainsJson:JSON.stringify(query.filters.excludeDomains ?? []),
        ...(query.filters.startDate ? { startDate:new Date(query.filters.startDate).toISOString() } : {}),
        ...(query.filters.endDate ? { endDate:new Date(query.filters.endDate).toISOString() } : {}),
        numResults:query.filters.numResults,configHash:query.configHash,...(query.searchConfig ? { searchConfigJson:JSON.stringify(query.searchConfig) } : {}),
        createdAt:query.createdAt.toISOString(),createdByUserId:query.createdByUserId,
      })
      return transformEvaluationQueryDocument(doc)
    } catch (error) { storageError(error, "create evaluation query") }
  }
}
class AppwriteOperationalQueryReader implements OperationalQueryReader {
  async getQuery(id: string): Promise<QueryConfig | null> {
    try { return transformQueryDocument(await databases.getDocument(DATABASE_ID,COLLECTIONS.QUERIES,id),false) }
    catch (error) { if (isSchemaFailure(error)) storageError(error,"read operational query"); if ((error as { code?: number })?.code === 404) return null; storageError(error,"read operational query") }
  }
}

export class EvaluationDatasetService {
  constructor(private readonly repository: EvaluationRepository = new AppwriteEvaluationRepository(), private readonly queryReader: OperationalQueryReader = new AppwriteOperationalQueryReader()) {}

  async createDataset(ownerUserId: string, input: { name: string; description?: string; familyKey?: string }): Promise<EvaluationDatasetVersion> {
    this.requiredOwner(ownerUserId)
    input = parseCreateDatasetInput(input)
    const familyKey = input.familyKey ? normalizeFamilyKey(input.familyKey) : `${normalizeFamilyKey(input.name)}-${ID.unique().slice(0,8).toLowerCase()}`
    const now = new Date()
    return this.repository.createDataset({ familyKey,name:input.name,description:input.description,version:1,status:"draft",ownerUserId,createdByUserId:ownerUserId,createdAt:now,updatedAt:now,queryCount:0,judgmentCount:0,conflictCount:0,canonicalizationVersion:CANONICALIZATION_VERSION })
  }
  listDatasets(ownerUserId: string, options: DatasetListOptions) { this.requiredOwner(ownerUserId); return this.repository.listDatasets(ownerUserId,options) }
  async getDatasetDetail(ownerUserId: string, id: string): Promise<EvaluationDatasetDetail> {
    const dataset = await this.ownedDataset(ownerUserId,id); const queries = await this.repository.listQueries(id)
    return { dataset,queries,readiness:this.freezeReadiness(dataset,queries) }
  }
  async addOperationalQueries(ownerUserId: string, datasetId: string, queryIds: string[]): Promise<{ dataset: EvaluationDatasetVersion; queries: EvaluationQuery[]; added: number }> {
    queryIds = parseQueryIds({ queryIds })
    const dataset = await this.ownedDataset(ownerUserId,datasetId)
    if (dataset.status !== "draft") throw new EvaluationError("DATASET_NOT_DRAFT","Queries can only be added to a draft dataset",409)
    const existing = await this.repository.listQueries(datasetId); const byKey = new Map(existing.map(query => [query.queryKey,query])); let added = 0
    for (const queryId of queryIds) {
      const key = createEvaluationQueryKey(datasetId,queryId)
      if (byKey.has(key)) continue
      const operational = await this.queryReader.getQuery(queryId)
      if (!operational) throw new EvaluationError("NOT_FOUND",`Operational query ${queryId} not found`,404)
      if (operational.userId !== ownerUserId) throw new EvaluationError("UNAUTHORIZED","Operational query is not owned by the dataset owner",403)
      const snapshot = await this.repository.createQuery(this.snapshotQuery(datasetId,operational,ownerUserId,key))
      byKey.set(key,snapshot); added++
    }
    const queries = [...byKey.values()].sort((a,b) => a.queryKey.localeCompare(b.queryKey))
    const updated = await this.repository.updateDataset(datasetId,{ queryCount:queries.length,updatedAt:new Date() })
    return { dataset:updated,queries,added }
  }
  async cloneFrozenDataset(ownerUserId: string, parentId: string, overrides: { name?: string; description?: string } = {}): Promise<EvaluationDatasetDetail> {
    overrides = parseCloneInput(overrides)
    const parent = await this.ownedDataset(ownerUserId,parentId)
    if (parent.status !== "frozen") throw new EvaluationError("DATASET_NOT_FROZEN","Only a frozen dataset version can be cloned",409)
    const parentQueries = await this.repository.listQueries(parentId)
    let clone: EvaluationDatasetVersion | undefined
    for (let attempt=0; attempt<3 && !clone; attempt++) {
      const family = await this.repository.listFamily(ownerUserId,parent.familyKey)
      const version = Math.max(...family.map(item => item.version),parent.version)+1
      const now = new Date()
      try {
        clone = await this.repository.createDataset({ familyKey:parent.familyKey,name:overrides.name ?? parent.name,description:overrides.description ?? parent.description,version,status:"draft",parentVersionId:parent.id,ownerUserId,createdByUserId:ownerUserId,createdAt:now,updatedAt:now,queryCount:0,judgmentCount:0,conflictCount:0,canonicalizationVersion:CANONICALIZATION_VERSION })
      } catch (error) {
        if (!(error instanceof EvaluationError) || error.code !== "CONFLICT" || attempt === 2) throw error
      }
    }
    if (!clone) throw new EvaluationError("CONFLICT","Could not allocate a dataset version",409)
    const copied: EvaluationQuery[] = []
    const copiedAt = new Date()
    for (const source of parentQueries) {
      const { id: _sourceId, ...definition } = source
      copied.push(await this.repository.createQuery({ ...definition,datasetVersionId:clone.id,queryKey:createEvaluationQueryKey(clone.id,source.sourceQueryId),filters:{...source.filters,includeDomains:[...(source.filters.includeDomains ?? [])],excludeDomains:[...(source.filters.excludeDomains ?? [])]},createdAt:copiedAt,createdByUserId:ownerUserId }))
    }
    const updated = await this.repository.updateDataset(clone.id,{queryCount:copied.length,updatedAt:new Date()})
    return { dataset:updated,queries:copied,readiness:this.freezeReadiness(updated,copied) }
  }
  freezeReadiness(dataset: EvaluationDatasetVersion, queries: EvaluationQuery[]): QueryFoundationReadiness {
    const checks = { hasQueries:queries.length>0,noConflicts:dataset.conflictCount===0,canonicalizationVersionPresent:Boolean(dataset.canonicalizationVersion.trim()),queryCountConsistent:dataset.queryCount===queries.length,noOrphanQueries:queries.every(query => query.datasetVersionId===dataset.id) }
    return { queryFoundationReady:Object.values(checks).every(Boolean),fullEvaluationFreezeReady:false,checks,pendingPhases:["judgments","conflict_resolution","final_freeze"] }
  }
  private snapshotQuery(datasetVersionId: string, query: QueryConfig, userId: string, queryKey: string): Omit<EvaluationQuery,"id"> {
    const numResults = query.filters.numResults ?? 50
    if (!Number.isInteger(numResults) || numResults <= 0) throw invalid("Operational query numResults must be a positive integer")
    return { datasetVersionId,sourceQueryId:query.id,queryKey,name:query.name,queryText:query.query,category:query.category,filters:{includeDomains:[...(query.filters.includeDomains ?? [])],excludeDomains:[...(query.filters.excludeDomains ?? [])],...(query.filters.startDate?{startDate:query.filters.startDate}:{}),...(query.filters.endDate?{endDate:query.filters.endDate}:{}),numResults},configHash:computeConfigHash(query),createdAt:new Date(),createdByUserId:userId }
  }
  private async ownedDataset(userId: string,id: string) { this.requiredOwner(userId); const dataset=await this.repository.getDataset(id); if(!dataset) throw new EvaluationError("NOT_FOUND","Evaluation dataset not found",404); if(dataset.ownerUserId!==userId) throw new EvaluationError("UNAUTHORIZED","Evaluation dataset access denied",403); return dataset }
  private requiredOwner(value:string) { if(!value?.trim()) throw invalid("Authenticated owner ID is required") }
}
export const evaluationDatasetService = new EvaluationDatasetService()
