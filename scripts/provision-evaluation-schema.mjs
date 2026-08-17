import { readFileSync } from "node:fs"
import { Client, Databases, IndexType } from "node-appwrite"

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

const dryRun = process.argv.includes("--dry-run") || process.argv.includes("--inspect")
const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID
const apiKey = process.env.APPWRITE_API_KEY ?? process.env.NEXT_PUBLIC_APPWRITE_API_KEY
const databaseId = process.env.APPWRITE_DATABASE_ID ?? process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID
if (!endpoint || !projectId || !apiKey || !databaseId) {
  throw new Error("Missing Appwrite configuration: NEXT_PUBLIC_APPWRITE_ENDPOINT, NEXT_PUBLIC_APPWRITE_PROJECT_ID, APPWRITE_API_KEY, and APPWRITE_DATABASE_ID are required")
}

const db = new Databases(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))
const ids = {
  datasets: process.env.COLLECTION_EVALUATION_DATASETS ?? "evaluation_datasets",
  queries: process.env.COLLECTION_EVALUATION_QUERIES ?? "evaluation_queries",
  judgments: process.env.COLLECTION_RELEVANCE_JUDGMENTS ?? "relevance_judgments",
}
const s = (key, size, required = true) => ({ key, type: "string", size, required })
const i = (key, required = true, min = undefined, max = undefined) => ({ key, type: "integer", required, min, max })
const d = (key, required = true) => ({ key, type: "datetime", required })
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
    attributes: [s("datasetVersionId",64),s("sourceQueryId",64),s("queryKey",64),s("name",256),s("queryText",2000),e("category",["company","news","research_paper","github","pdf","tweet","personal_site","linkedin_profile","financial_report"]),s("includeDomainsJson",4096),s("excludeDomainsJson",4096),d("startDate",false),d("endDate",false),i("numResults",true,1),s("configHash",64),s("searchConfigJson",8192,false),d("createdAt"),s("createdByUserId",64)],
    indexes: [
      { key:"query_key_unique", type:IndexType.Unique, attributes:["queryKey"] },
      { key:"dataset_version", type:IndexType.Key, attributes:["datasetVersionId"] },
      { key:"dataset_query_key", type:IndexType.Key, attributes:["datasetVersionId","queryKey"], orders:["ASC","ASC"] },
      { key:"source_query", type:IndexType.Key, attributes:["sourceQueryId"] },
      { key:"dataset_category", type:IndexType.Key, attributes:["datasetVersionId","category"] },
    ],
  },
  {
    id: ids.judgments, name: "Relevance Judgments",
    attributes: [s("judgmentKey",64),s("datasetVersionId",64),s("evaluationQueryId",64),s("sourceQueryId",64),s("documentKey",64),s("canonicalUrl",2048),s("domain",255),i("relevanceGrade",false,0,2),e("status",["pending","accepted","conflicted"]),e("source",["direct_label","feedback_promotion","curator_adjudication"]),s("assessmentsJson",16384),s("sourceFeedbackIdsJson",4096),s("sourceSnapshotIdsJson",4096),s("observedRawUrlsJson",16384),s("observedContentHashesJson",8192),s("rationale",2000,false),s("intent",500,false),s("subtopic",500,false),d("createdAt"),s("createdByUserId",64),d("updatedAt"),s("updatedByUserId",64),d("acceptedAt",false),s("acceptedByUserId",64,false)],
    indexes: [
      { key:"judgment_key_unique", type:IndexType.Unique, attributes:["judgmentKey"] },
      { key:"dataset_query", type:IndexType.Key, attributes:["datasetVersionId","evaluationQueryId"] },
      { key:"dataset_status", type:IndexType.Key, attributes:["datasetVersionId","status"] },
      { key:"document_key", type:IndexType.Key, attributes:["documentKey"] },
    ],
  },
]

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
  if (existing.type !== expected.type) issues.push(`type expected=${expected.type} actual=${existing.type}`)
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
  if (attr.type === "enum") return db.createEnumAttribute(databaseId, collectionId, attr.key, attr.values, attr.required)
  throw new Error(`Unsupported attribute type ${attr.type}`)
}

async function main() {
  let mismatchCount = 0
  for (const schema of schemas) {
    let collection = await getCollection(schema.id)
    console.log(`\n[evaluation-schema] ${schema.id}`)
    if (!collection) {
      console.log("  collection: MISSING")
      if (!dryRun) {
        collection = await db.createCollection(databaseId, schema.id, schema.name, [], true, true)
        console.log("  collection: CREATED")
      }
    } else console.log("  collection: existing")

    const attrs = new Map((collection?.attributes ?? []).map(attr => [attr.key, attr]))
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
  console.log(`\n[evaluation-schema] ${dryRun ? "inspection complete; no changes made" : "provisioning complete"}`)
  if (mismatchCount) throw new Error(`${mismatchCount} schema mismatch(es) require manual review; nothing was deleted`)
}
main().catch(error => { console.error("[evaluation-schema] failed", error); process.exitCode = 1 })
