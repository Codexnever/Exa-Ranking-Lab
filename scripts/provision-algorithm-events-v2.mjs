import { readFileSync } from "node:fs"
import { Client, Databases } from "node-appwrite"

try {
  const localEnv = readFileSync(".env.local", "utf8")
  for (const rawLine of localEnv.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue
    const separator = line.indexOf("=")
    if (separator < 1) continue
    const key = line.slice(0, separator).trim()
    let value = line.slice(separator + 1).trim()
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("\'") && value.endsWith("\'"))) value = value.slice(1, -1)
    if (process.env[key] === undefined) process.env[key] = value
  }
} catch (error) {
  if (error?.code !== "ENOENT") throw error
}

const databaseId = process.env.APPWRITE_DATABASE_ID ?? process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID
const collectionId = process.env.COLLECTION_ALGORITHM_EVENTS ?? "algorithm_events"
const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID
const apiKey = process.env.APPWRITE_API_KEY ?? process.env.NEXT_PUBLIC_APPWRITE_API_KEY
const dryRun = process.argv.includes("--dry-run")

if (!endpoint || !projectId || !apiKey || !databaseId) {
  throw new Error("Missing Appwrite configuration: NEXT_PUBLIC_APPWRITE_ENDPOINT, NEXT_PUBLIC_APPWRITE_PROJECT_ID, APPWRITE_API_KEY, and APPWRITE_DATABASE_ID are required")
}

const configuredDatabaseId = databaseId
const databases = new Databases(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))
const definitions = [
  { key: "schemaVersion", create: () => databases.createIntegerAttribute(configuredDatabaseId, collectionId, "schemaVersion", false, 1, 2) },
  { key: "detectorVersion", create: () => databases.createStringAttribute(configuredDatabaseId, collectionId, "detectorVersion", 32, false) },
  { key: "detectionMode", create: () => databases.createStringAttribute(configuredDatabaseId, collectionId, "detectionMode", 32, false) },
  { key: "confidenceValue", create: () => databases.createFloatAttribute(configuredDatabaseId, collectionId, "confidenceValue", false, 0, 1) },
  { key: "confidencePercentage", create: () => databases.createIntegerAttribute(configuredDatabaseId, collectionId, "confidencePercentage", false, 0, 100) },
  { key: "observedQueryCount", create: () => databases.createIntegerAttribute(configuredDatabaseId, collectionId, "observedQueryCount", false, 0) },
  { key: "affectedQueryCount", create: () => databases.createIntegerAttribute(configuredDatabaseId, collectionId, "affectedQueryCount", false, 0) },
  { key: "affectedAverageDrift", create: () => databases.createFloatAttribute(configuredDatabaseId, collectionId, "affectedAverageDrift", false) },
  { key: "currentObservedAverageDrift", create: () => databases.createFloatAttribute(configuredDatabaseId, collectionId, "currentObservedAverageDrift", false) },
  { key: "historicalBaselineAvailable", create: () => databases.createBooleanAttribute(configuredDatabaseId, collectionId, "historicalBaselineAvailable", false) },
  { key: "historicalDeviation", create: () => databases.createFloatAttribute(configuredDatabaseId, collectionId, "historicalDeviation", false) },
  { key: "historicalObservationCount", create: () => databases.createIntegerAttribute(configuredDatabaseId, collectionId, "historicalObservationCount", false, 0) },
  { key: "historicalQueryCount", create: () => databases.createIntegerAttribute(configuredDatabaseId, collectionId, "historicalQueryCount", false, 0) },
  { key: "windowStart", create: () => databases.createDatetimeAttribute(configuredDatabaseId, collectionId, "windowStart", false) },
  { key: "windowEnd", create: () => databases.createDatetimeAttribute(configuredDatabaseId, collectionId, "windowEnd", false) },
  { key: "correlationWindowMs", create: () => databases.createIntegerAttribute(configuredDatabaseId, collectionId, "correlationWindowMs", false, 1) },
  { key: "createdAt", create: () => databases.createDatetimeAttribute(configuredDatabaseId, collectionId, "createdAt", false) },
  { key: "thresholdsJson", create: () => databases.createStringAttribute(configuredDatabaseId, collectionId, "thresholdsJson", 4_096, false) },
  { key: "evidenceJson", create: () => databases.createStringAttribute(configuredDatabaseId, collectionId, "evidenceJson", 16_384, false) },
  { key: "confidenceJson", create: () => databases.createStringAttribute(configuredDatabaseId, collectionId, "confidenceJson", 8_192, false) },
]

async function inspect() {
  const collection = await databases.getCollection(configuredDatabaseId, collectionId)
  const existing = new Map(collection.attributes.map(attribute => [attribute.key, attribute.status]))
  const missing = definitions.filter(definition => !existing.has(definition.key))
  console.log(`[algorithm-events-v2] collection=${collectionId} database=${configuredDatabaseId}`)
  console.log(`[algorithm-events-v2] existing attributes: ${[...existing.keys()].sort().join(", ") || "none"}`)
  console.log(`[algorithm-events-v2] missing v2 attributes: ${missing.map(item => item.key).join(", ") || "none"}`)
  console.log(`[algorithm-events-v2] existing indexes: ${collection.indexes.map(index => index.key).sort().join(", ") || "none"}`)
  return { existing, missing }
}

async function waitUntilReady(keys) {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    const collection = await databases.getCollection(configuredDatabaseId, collectionId)
    const statuses = new Map(collection.attributes.map(attribute => [attribute.key, attribute.status]))
    const failed = keys.find(key => statuses.get(key) === "failed")
    if (failed) throw new Error(`Appwrite attribute ${failed} entered failed status`)
    if (keys.every(key => statuses.get(key) === "available")) return
    await new Promise(resolve => setTimeout(resolve, 1_500))
  }
  throw new Error(`Timed out waiting for Appwrite attributes to become available: ${keys.join(", ")}`)
}

async function main() {
  const { missing } = await inspect()
  if (dryRun) {
    console.log("[algorithm-events-v2] dry run: no changes made")
    return
  }
  for (const definition of missing) {
    console.log(`[algorithm-events-v2] creating ${definition.key}`)
    await definition.create()
  }
  if (missing.length > 0) await waitUntilReady(missing.map(item => item.key))
  console.log("[algorithm-events-v2] schema v2 attributes are available; no collection or documents were recreated")
}

main().catch(error => {
  console.error("[algorithm-events-v2] failed", error)
  process.exitCode = 1
})
