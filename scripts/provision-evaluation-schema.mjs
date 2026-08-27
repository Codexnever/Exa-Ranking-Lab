import { readFileSync } from "node:fs"
import { Client, Databases, DatabasesIndexType as IndexType } from "node-appwrite"
import preflight from "./evaluation-schema-preflight.cjs"
const { DEFAULT_COLLECTION_IDS, analyzeSchemaBudget, parseMode, parseOnly, selectSchemas, validatePhysicalIds } = preflight
try {
  const contents = readFileSync(".env.local", "utf8")
  for (const raw of contents.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue
    const at = line.indexOf("=")
    if (at < 1) continue
    const key = line.slice(0, at).trim()
    let value = line.slice(at + 1).trim()
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1)
    if (process.env[key] === undefined) process.env[key] = value
  }
} catch (error) {
  if (error?.code !== "ENOENT") throw error
}

const mode = parseMode(process.argv)
const onlyIds = parseOnly(process.argv)
const dryRun = mode !== "apply"
const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID
const apiKey = process.env.APPWRITE_API_KEY
const databaseId = process.env.APPWRITE_DATABASE_ID ?? process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID
if (!endpoint || !projectId || !apiKey || !databaseId) {
  throw new Error("Missing Appwrite configuration: NEXT_PUBLIC_APPWRITE_ENDPOINT, NEXT_PUBLIC_APPWRITE_PROJECT_ID, APPWRITE_API_KEY, and APPWRITE_DATABASE_ID are required")
}
if (process.env.NEXT_PUBLIC_APPWRITE_API_KEY) {
  throw new Error("NEXT_PUBLIC_APPWRITE_API_KEY is forbidden; use server-only APPWRITE_API_KEY")
}
const ids = {
  datasets: process.env.COLLECTION_EVALUATION_DATASETS ?? DEFAULT_COLLECTION_IDS.datasets,
  queries: process.env.COLLECTION_EVALUATION_QUERIES ?? DEFAULT_COLLECTION_IDS.queries,
  queryConfigs: process.env.COLLECTION_EVALUATION_QUERY_CONFIGS ?? DEFAULT_COLLECTION_IDS.queryConfigs,
  judgments: process.env.COLLECTION_RELEVANCE_JUDGMENTS ?? DEFAULT_COLLECTION_IDS.judgments,
  judgmentPayloads: process.env.COLLECTION_RELEVANCE_JUDGMENT_PAYLOADS ?? DEFAULT_COLLECTION_IDS.judgmentPayloads,
  payloadChunks: process.env.COLLECTION_EVALUATION_PAYLOAD_CHUNKS ?? DEFAULT_COLLECTION_IDS.payloadChunks,
  runs: process.env.COLLECTION_EVALUATION_RUNS ?? DEFAULT_COLLECTION_IDS.runs,
  runQueries: process.env.COLLECTION_EVALUATION_RUN_QUERIES ?? DEFAULT_COLLECTION_IDS.runQueries,
  stageTraces: process.env.COLLECTION_EVALUATION_STAGE_TRACES ?? DEFAULT_COLLECTION_IDS.stageTraces,
  stageTraceDocuments: process.env.COLLECTION_EVALUATION_STAGE_TRACE_DOCUMENTS ?? DEFAULT_COLLECTION_IDS.stageTraceDocuments,
  strategies: process.env.COLLECTION_EVALUATION_STRATEGIES ?? DEFAULT_COLLECTION_IDS.strategies,
  strategyExecutions: process.env.COLLECTION_EVALUATION_STRATEGY_EXECUTIONS ?? DEFAULT_COLLECTION_IDS.strategyExecutions,
  strategyExecutionDocuments: process.env.COLLECTION_EVALUATION_STRATEGY_EXECUTION_DOCUMENTS ?? DEFAULT_COLLECTION_IDS.strategyExecutionDocuments,
}
validatePhysicalIds(ids)
const db = new Databases(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))
const s = (key, size, required = true) => ({ key, type: "string", size, required })
const i = (key, required = true, min = undefined, max = undefined) => ({ key, type: "integer", required, min, max })
const d = (key, required = true) => ({ key, type: "datetime", required })
const b = (key, required = true) => ({ key, type: "boolean", required })
const e = (key, values, required = true) => ({ key, type: "enum", values, required })

const schemas = [
  {
    id: ids.datasets, name: "Evaluation Datasets",
    attributes: [s("familyKey",128),s("name",256),s("description",2000,false),i("version",true,1),e("status",["draft","frozen","archived"]),s("parentVersionId",64,false),s("ownerUserId",64),s("createdByUserId",64),d("createdAt"),d("updatedAt"),d("frozenAt",false),s("frozenByUserId",64,false),i("queryCount",true,0),i("judgmentCount",true,0),i("conflictCount",true,0),s("canonicalizationVersion",32)],
    indexes: [
      { key:"family_version_unique", type:IndexType.Unique, attributes:["familyKey","version"] },
      { key:"owner_status", type:IndexType.Key, attributes:["ownerUserId","status"] },
      { key:"family_status", type:IndexType.Key, attributes:["familyKey","status"] },
      { key:"owner_created", type:IndexType.Key, attributes:["ownerUserId","createdAt"], orders:["ASC","DESC"] },
      { key:"owner_status_created", type:IndexType.Key, attributes:["ownerUserId","status","createdAt"], orders:["ASC","ASC","DESC"] },
      { key:"owner_family_created", type:IndexType.Key, attributes:["ownerUserId","familyKey","createdAt"], orders:["ASC","ASC","DESC"] },
      { key:"owner_family_status_created", type:IndexType.Key, attributes:["ownerUserId","familyKey","status","createdAt"], orders:["ASC","ASC","ASC","DESC"] },
      { key:"owner_family_version", type:IndexType.Key, attributes:["ownerUserId","familyKey","version"], orders:["ASC","ASC","DESC"] },
    ],
  },
  {
    id: ids.queries, name: "Evaluation Queries",
    attributes: [s("datasetVersionId",64),s("sourceQueryId",64),s("queryKey",64),s("name",256),s("queryText",2000),e("category",["company","news","research_paper","github","pdf","tweet","personal_site","linkedin_profile","financial_report"]),s("includeDomainsJson",4096),s("excludeDomainsJson",4096),d("startDate",false),d("endDate",false),i("numResults",true,1),s("configHash",64),d("createdAt"),s("createdByUserId",64)],
    indexes: [
      { key:"query_key_unique", type:IndexType.Unique, attributes:["queryKey"] },
      { key:"dataset_version", type:IndexType.Key, attributes:["datasetVersionId"] },
      { key:"dataset_query_key", type:IndexType.Key, attributes:["datasetVersionId","queryKey"], orders:["ASC","ASC"] },
      { key:"source_query", type:IndexType.Key, attributes:["sourceQueryId"] },
      { key:"dataset_category", type:IndexType.Key, attributes:["datasetVersionId","category"] },
    ],
  },
  {
    id: ids.queryConfigs, name: "Evaluation Query Configurations",
    attributes: [s("evaluationQueryId",64),s("datasetVersionId",64),s("searchConfigJson",8192),s("configHash",64),d("createdAt"),s("createdByUserId",64)],
    indexes: [
      { key:"query_config_unique", type:IndexType.Unique, attributes:["evaluationQueryId"] },
      { key:"dataset_query", type:IndexType.Key, attributes:["datasetVersionId","evaluationQueryId"], orders:["ASC","ASC"] },
      { key:"creator_created", type:IndexType.Key, attributes:["createdByUserId","createdAt"], orders:["ASC","DESC"] },
    ],
  },
  {
    id: ids.judgments, name: "Relevance Judgments",
    attributes: [s("judgmentKey",64),s("datasetVersionId",64),s("evaluationQueryId",64),s("sourceQueryId",64),s("documentKey",64),s("canonicalUrl",2048),s("domain",255),i("relevanceGrade",false,0,2),e("status",["pending","accepted","conflicted"]),e("source",["direct_label","feedback_promotion","curator_adjudication"]),s("evidenceRevision",64),s("evidencePayloadHash",64),i("evidenceChunkCount",true,1,100),s("rationale",2000,false),s("intent",500,false),s("subtopic",500,false),d("createdAt"),s("createdByUserId",64),d("updatedAt"),s("updatedByUserId",64),d("acceptedAt",false),s("acceptedByUserId",64,false)],
    indexes: [
      { key:"judgment_key_unique", type:IndexType.Unique, attributes:["judgmentKey"] },
      { key:"dataset_query", type:IndexType.Key, attributes:["datasetVersionId","evaluationQueryId"] },
      { key:"dataset_status", type:IndexType.Key, attributes:["datasetVersionId","status"] },
      { key:"document_key", type:IndexType.Key, attributes:["documentKey"] },
    ],
  },
  {
    id: ids.judgmentPayloads, name: "Relevance Judgment Payloads",
    attributes: [s("judgmentId",64),s("datasetVersionId",64),s("evidenceRevision",64),i("chunkIndex",true,0,99),i("chunkCount",true,1,100),s("payloadChunk",8000),s("payloadHash",64),d("createdAt"),s("createdByUserId",64)],
    indexes: [
      { key:"judgment_revision_chunk_unique", type:IndexType.Unique, attributes:["judgmentId","evidenceRevision","chunkIndex"] },
      { key:"judgment_revision_chunks", type:IndexType.Key, attributes:["judgmentId","evidenceRevision","chunkIndex"], orders:["asc","asc","asc"] },
      { key:"dataset_judgment", type:IndexType.Key, attributes:["datasetVersionId","judgmentId"], orders:["asc","asc"] },
    ],
  },
  {
    id: ids.payloadChunks, name: "Evaluation Payload Chunks",
    attributes: [s("ownerUserId",64),s("datasetVersionId",64,false),e("entityType",["evaluation_run","evaluation_run_query","stage_trace","strategy","strategy_execution"]),s("entityId",64),e("payloadField",["snapshot_selections","aggregate_result","warnings","query_result","stage_definitions","strategy_configuration","provider_metadata"]),s("payloadRevision",64),i("chunkIndex",true,0,99),i("chunkCount",true,1,100),s("payloadChunk",8000),s("payloadHash",64),d("createdAt"),],
    indexes: [
      { key:"entity_revision_field_chunk_unique", type:IndexType.Unique, attributes:["entityType","entityId","payloadRevision","payloadField","chunkIndex"] },
      { key:"entity_revision_chunks", type:IndexType.Key, attributes:["entityType","entityId","payloadRevision","payloadField","chunkIndex"], orders:["asc","asc","asc","asc","asc"] },
      { key:"owner_entity_created", type:IndexType.Key, attributes:["ownerUserId","entityType","createdAt"], orders:["asc","asc","desc"] },
      { key:"dataset_entity", type:IndexType.Key, attributes:["datasetVersionId","entityType","entityId"], orders:["asc","asc","asc"] },
    ],
  },
  {
    id: ids.runs, name: "Evaluation Runs",
    attributes: [s("datasetVersionId",64),s("datasetFamilyKey",128),i("datasetVersion",true,1),s("metricVersion",32),e("status",["completed"]),s("cutoffsJson",2048),s("payloadRevision",64),s("payloadManifestJson",4096),i("eligibleQueryCount",true,0),i("skippedQueryCount",true,0),i("selectedQueryCount",true,1),d("createdAt"),s("createdByUserId",64)],
    indexes: [
      { key:"dataset_created", type:IndexType.Key, attributes:["datasetVersionId","createdAt"], orders:["ASC","DESC"] },
      { key:"family_version_created", type:IndexType.Key, attributes:["datasetFamilyKey","datasetVersion","createdAt"], orders:["ASC","DESC","DESC"] },
      { key:"creator_created", type:IndexType.Key, attributes:["createdByUserId","createdAt"], orders:["ASC","DESC"] },
    ],
  },
  {
    id: ids.stageTraces, name: "Evaluation Stage Traces",
    attributes: [s("traceVersion",32),s("sourceQueryId",64),s("snapshotId",64,false),s("evaluationQueryId",64,false),s("datasetVersionId",64,false),s("queryText",2000,false),s("payloadRevision",64),s("payloadManifestJson",4096),i("stageCount",true,1,20),e("completeness",["complete","partial","final_only"]),b("completeFinalAlignment",false),d("createdAt"),s("createdByUserId",64)],
    indexes: [
      { key:"creator_created", type:IndexType.Key, attributes:["createdByUserId","createdAt"], orders:["ASC","DESC"] },
      { key:"creator_source_created", type:IndexType.Key, attributes:["createdByUserId","sourceQueryId","createdAt"], orders:["ASC","ASC","DESC"] },
      { key:"creator_snapshot", type:IndexType.Key, attributes:["createdByUserId","snapshotId"] },
      { key:"creator_evaluation", type:IndexType.Key, attributes:["createdByUserId","datasetVersionId","evaluationQueryId"] },
      { key:"creator_dataset_created", type:IndexType.Key, attributes:["createdByUserId","datasetVersionId","createdAt"], orders:["ASC","ASC","DESC"] },
      { key:"creator_query_created", type:IndexType.Key, attributes:["createdByUserId","evaluationQueryId","createdAt"], orders:["ASC","ASC","DESC"] },
    ],
  },
  {
    id: ids.stageTraceDocuments, name: "Evaluation Stage Trace Documents",
    attributes: [s("traceId",64),s("stageId",128),i("stageOrder"),s("documentKey",64),s("canonicalUrl",2048),s("rawUrl",2048),i("rank",false,1),i("rankSort",true,1),s("score",128,false),s("scoreType",128,false),s("title",1000,false),s("domain",255),s("contentHash",256,false),s("metadataJson",4096),i("relevanceGrade",false,0,2)],
    indexes: [
      { key:"trace_stage_rank", type:IndexType.Key, attributes:["traceId","stageOrder","rankSort"], orders:["ASC","ASC","ASC"] },
      { key:"trace_document", type:IndexType.Key, attributes:["traceId","documentKey"] },
    ],
  },
  {
    id: ids.strategies, name: "Evaluation Strategies",
    attributes: [s("name",256),e("type",["keyword","dense","hybrid","reranked","external","custom"]),s("description",2000,false),s("provider",256,false),s("model",256,false),s("payloadRevision",64),s("payloadManifestJson",4096),s("configHash",64),e("latencyType",["end_to_end","retrieval_only","rerank_only","custom"]),e("status",["active","archived"]),i("executionCount",true,0),d("createdAt"),s("createdByUserId",64),d("archivedAt",false)],
    indexes: [
      { key:"creator_created", type:IndexType.Key, attributes:["createdByUserId","createdAt"], orders:["ASC","DESC"] },
      { key:"creator_status_created", type:IndexType.Key, attributes:["createdByUserId","status","createdAt"], orders:["ASC","ASC","DESC"] },
      { key:"creator_hash", type:IndexType.Key, attributes:["createdByUserId","configHash"] },
    ],
  },
  {
    id: ids.strategyExecutions, name: "Evaluation Strategy Executions",
    attributes: [s("strategyId",64),s("datasetVersionId",64),s("evaluationQueryId",64),s("sourceQueryId",64),s("queryText",2000),e("source",["native","imported"]),s("configHash",64),i("requestedResultCount",false,1),i("resultCount",true,1,500),s("latencyMs",128,false),e("latencyType",["end_to_end","retrieval_only","rerank_only","custom"]),s("stageTraceId",64,false),s("payloadRevision",64,false),s("payloadManifestJson",4096,false),i("duplicateCanonicalResultsIgnored",true,0),d("createdAt"),s("createdByUserId",64)],
    indexes: [
      { key:"dataset_strategy_query_created", type:IndexType.Key, attributes:["datasetVersionId","strategyId","evaluationQueryId","createdAt"], orders:["ASC","ASC","ASC","DESC"] },
      { key:"strategy_created", type:IndexType.Key, attributes:["strategyId","createdAt"], orders:["ASC","DESC"] },
      { key:"creator_created", type:IndexType.Key, attributes:["createdByUserId","createdAt"], orders:["ASC","DESC"] },
    ],
  },
  {
    id: ids.strategyExecutionDocuments, name: "Evaluation Strategy Execution Documents",
    attributes: [s("executionId",64),s("documentKey",64),s("canonicalUrl",2048),s("rawUrl",2048),i("rank",true,1,500),s("score",128,false),s("scoreType",128,false),s("title",1000,false),s("domain",255)],
    indexes: [
      { key:"execution_rank_unique", type:IndexType.Unique, attributes:["executionId","rank"] },
      { key:"execution_document_unique", type:IndexType.Unique, attributes:["executionId","documentKey"] },
    ],
  },
  {
    id: ids.runQueries, name: "Evaluation Run Query Results",
    attributes: [s("runId",64),s("datasetVersionId",64),s("evaluationQueryId",64),s("snapshotId",64),s("ownerUserId",64),s("payloadRevision",64),s("payloadManifestJson",4096),d("createdAt")],
    indexes: [
      { key:"run_query_unique", type:IndexType.Unique, attributes:["runId","evaluationQueryId"] },
      { key:"run_query", type:IndexType.Key, attributes:["runId","evaluationQueryId"], orders:["ASC","ASC"] },
      { key:"dataset_run", type:IndexType.Key, attributes:["datasetVersionId","runId"] },
    ],
  },
]

const selectedSchemas = selectSchemas(schemas, onlyIds)

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
async function getCollection(id) {
  try { return await db.getCollection(databaseId, id) }
  catch (error) { if (error?.code === 404) return null; throw error }
}
async function waitAttribute(collectionId, key) {
  const deadline = Date.now() + 120000
  while (Date.now() < deadline) {
    const collection = await db.getCollection(databaseId, collectionId)
    const attr = collection.attributes.find(item => item.key === key)
    if (attr?.status === "available") return
    if (attr?.status === "failed") throw new Error(`${collectionId}.${key} entered failed status`)
    await sleep(1200)
  }
  throw new Error(`Timed out waiting for ${collectionId}.${key}`)
}
async function waitIndex(collectionId, key) {
  const deadline = Date.now() + 120000
  while (Date.now() < deadline) {
    const collection = await db.getCollection(databaseId, collectionId)
    const index = collection.indexes.find(item => item.key === key)
    if (index?.status === "available") return
    if (index?.status === "failed") throw new Error(`${collectionId}.${key} entered failed status`)
    await sleep(1200)
  }
  throw new Error(`Timed out waiting for ${collectionId}.${key}`)
}
function mismatches(existing, expected) {
  const issues = []
  const existingType = existing.format === "enum" ? "enum" : existing.type
  if (existingType !== expected.type) issues.push(`type expected=${expected.type} actual=${existingType}`)
  if (Boolean(existing.required) !== expected.required) issues.push(`required expected=${expected.required} actual=${existing.required}`)
  if (expected.size !== undefined && existing.size !== expected.size) issues.push(`size expected=${expected.size} actual=${existing.size}`)
  if (expected.min !== undefined && existing.min !== expected.min) issues.push(`min expected=${expected.min} actual=${existing.min}`)
  if (expected.max !== undefined && existing.max !== expected.max) issues.push(`max expected=${expected.max} actual=${existing.max}`)
  if (expected.values && JSON.stringify([...existing.elements].sort()) !== JSON.stringify([...expected.values].sort())) issues.push("enum values differ")
  return issues
}
async function createAttribute(collectionId, attr) {
  if (attr.type === "string") return db.createStringAttribute(databaseId, collectionId, attr.key, attr.size, attr.required)
  if (attr.type === "integer") return db.createIntegerAttribute(databaseId, collectionId, attr.key, attr.required, attr.min, attr.max)
  if (attr.type === "datetime") return db.createDatetimeAttribute(databaseId, collectionId, attr.key, attr.required)
  if (attr.type === "boolean") return db.createBooleanAttribute(databaseId, collectionId, attr.key, attr.required)
  if (attr.type === "enum") return db.createEnumAttribute(databaseId, collectionId, attr.key, attr.values, attr.required)
  throw new Error(`Unsupported attribute type ${attr.type}`)
}

async function main() {
  let mismatchCount = 0
  console.log(`[evaluation-schema] mode=${mode}; mutations=${dryRun ? "disabled" : "enabled"}; scope=${onlyIds ? "scoped" : "all"}`)
  console.log(`[evaluation-schema] selected=${selectedSchemas.map(schema => schema.id).join(",")}`)
  for (const schema of selectedSchemas) {
    let collection = await getCollection(schema.id)
    const { declaredStringChars, largeStrings, safeLimit, headroom, withinSafeLimit } = analyzeSchemaBudget(schema.attributes)
    console.log(`\n[evaluation-schema] logical="${schema.name}" physical="${schema.id}"`)
    console.log(`  budget: declaredStringChars=${declaredStringChars}; safeLimit=${safeLimit}; headroom=${headroom}; largeStrings=${largeStrings.map(attr => `${attr.key}(${attr.size})`).join(", ") || "none"}`)
    console.log("  budget: estimate only; Appwrite acceptance is authoritative")
    if (!withinSafeLimit) throw new Error(`${schema.id} exceeds the configured safe declared-string limit of ${safeLimit}`)
    if (!collection) {
      console.log("  collection: MISSING")
      if (!dryRun) {
        collection = await db.createCollection(databaseId, schema.id, schema.name, [], true, true)
        console.log("  collection: CREATED")
      }
    } else {
      console.log("  collection: existing")
      console.log(`  security: enabled=${collection.enabled}; documentSecurity=${collection.documentSecurity}; permissions=${JSON.stringify(collection.$permissions ?? [])}`)
      if (collection.bytesMax && collection.bytesUsed / collection.bytesMax >= 0.7) {
        console.warn(`  budget: WARNING existing schema uses ${collection.bytesUsed}/${collection.bytesMax} bytes`)
      }
      if (!collection.enabled || !collection.documentSecurity || (collection.$permissions ?? []).length) {
        mismatchCount++
        console.error("  security: MISMATCH expected enabled=true, documentSecurity=true, permissions=[]; existing settings were not changed")
      }
    }

    const attrs = new Map((collection?.attributes ?? []).map(attr => [attr.key, attr]))
    const expectedAttributeKeys = new Set(schema.attributes.map(attr => attr.key))
    for (const attr of collection?.attributes ?? []) {
      if (!expectedAttributeKeys.has(attr.key)) {
        mismatchCount++
        console.error(`  attribute ${attr.key}: UNEXPECTED (preserved)`)
      }
    }
    for (const attr of schema.attributes) {
      const existing = attrs.get(attr.key)
      if (!existing) {
        console.log(`  attribute ${attr.key}: MISSING${dryRun ? " (planned)" : ""}`)
        if (!dryRun) { await createAttribute(schema.id, attr); await waitAttribute(schema.id, attr.key) }
      } else {
        const issues = mismatches(existing, attr)
        if (issues.length) { mismatchCount++; console.error(`  attribute ${attr.key}: MISMATCH ${issues.join(", ")}`) }
        else console.log(`  attribute ${attr.key}: existing`)
      }
    }

    const indexes = new Map((collection?.indexes ?? []).map(index => [index.key, index]))
    const expectedIndexKeys = new Set(schema.indexes.map(index => index.key))
    for (const index of collection?.indexes ?? []) {
      if (!expectedIndexKeys.has(index.key)) {
        mismatchCount++
        console.error(`  index ${index.key}: UNEXPECTED (preserved)`)
      }
    }
    for (const index of schema.indexes) {
      const existing = indexes.get(index.key)
      if (!existing) {
        console.log(`  index ${index.key}: MISSING${dryRun ? " (planned)" : ""}`)
        if (!dryRun) { await db.createIndex(databaseId, schema.id, index.key, index.type, index.attributes, index.orders); await waitIndex(schema.id, index.key) }
      } else if (existing.type !== index.type || JSON.stringify(existing.attributes) !== JSON.stringify(index.attributes) || (index.orders && JSON.stringify(existing.orders) !== JSON.stringify(index.orders))) {
        mismatchCount++; console.error(`  index ${index.key}: MISMATCH`)
      } else console.log(`  index ${index.key}: existing`)
    }
  }
  console.log(`\n[evaluation-schema] ${dryRun ? `${mode} complete; no changes made` : "provisioning complete"}`)
  if (mismatchCount) throw new Error(`${mismatchCount} schema mismatch(es) require manual review; nothing was deleted`)
}
main().catch(error => { console.error("[evaluation-schema] failed", error); process.exitCode = 1 })
