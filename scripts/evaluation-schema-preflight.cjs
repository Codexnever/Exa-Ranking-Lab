"use strict"

const DEFAULT_COLLECTION_IDS = Object.freeze({
  datasets: "evaluation_datasets_v1",
  queries: "evaluation_queries_v1",
  queryConfigs: "evaluation_query_configs_v1",
  judgments: "relevance_judgments_v2",
  judgmentPayloads: "relevance_judgment_payloads_v1",
  payloadChunks: "evaluation_payload_chunks_v1",
  runs: "evaluation_runs_v1",
  runQueries: "evaluation_run_queries_v1",
  stageTraces: "evaluation_stage_traces_v1",
  stageTraceDocuments: "evaluation_stage_docs_v1",
  strategies: "evaluation_strategies_v1",
  strategyExecutions: "evaluation_strategy_execs_v1",
  strategyExecutionDocuments: "evaluation_strategy_docs_v1",
})

const SAFE_DECLARED_STRING_CHARS = 16384

function parseMode(argv) {
  if (argv.includes("--inspect")) return "inspect"
  if (argv.includes("--dry-run")) return "dry-run"
  return "apply"
}

function parseOnly(argv) {
  const values = []
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]
    if (argument === "--only") {
      if (index + 1 >= argv.length || argv[index + 1].startsWith("--")) throw new Error("--only requires a non-empty comma-separated physical collection ID list")
      values.push(argv[++index])
    } else if (argument.startsWith("--only=")) {
      values.push(argument.slice("--only=".length))
    }
  }
  if (!values.length) return null
  if (values.length > 1) throw new Error("--only may be specified only once")
  const ids = values[0].split(",").map(value => value.trim())
  if (!ids.length || ids.some(id => !id)) throw new Error("--only requires a non-empty comma-separated physical collection ID list")
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index)
  if (duplicates.length) throw new Error(`Duplicate --only physical collection ID: ${duplicates[0]}`)
  return ids
}

function selectSchemas(schemas, onlyIds) {
  if (onlyIds === null) return schemas
  const byPhysicalId = new Map()
  for (const schema of schemas) {
    if (byPhysicalId.has(schema.id)) throw new Error(`Ambiguous physical collection ID: ${schema.id}`)
    byPhysicalId.set(schema.id, schema)
  }
  for (const id of onlyIds) {
    if (!byPhysicalId.has(id)) throw new Error(`Unknown --only physical collection ID: ${id}`)
  }
  return onlyIds.map(id => byPhysicalId.get(id))
}

function validatePhysicalIds(values) {
  const seen = new Map()
  for (const [role, id] of Object.entries(values)) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,35}$/.test(id)) {
      throw new Error(`Invalid Appwrite collection ID for ${role}: ${id}`)
    }
    if (seen.has(id)) {
      throw new Error(`Duplicate physical collection ID ${id} for ${seen.get(id)} and ${role}`)
    }
    seen.set(id, role)
  }
}

function analyzeSchemaBudget(attributes) {
  const strings = attributes.filter(attribute => attribute.type === "string")
  const declaredStringChars = strings.reduce((total, attribute) => total + attribute.size, 0)
  return {
    declaredStringChars,
    safeLimit: SAFE_DECLARED_STRING_CHARS,
    headroom: SAFE_DECLARED_STRING_CHARS - declaredStringChars,
    withinSafeLimit: declaredStringChars <= SAFE_DECLARED_STRING_CHARS,
    largeStrings: strings.filter(attribute => attribute.size >= 4096).map(attribute => ({
      key: attribute.key,
      size: attribute.size,
    })),
  }
}

module.exports = { DEFAULT_COLLECTION_IDS, SAFE_DECLARED_STRING_CHARS, analyzeSchemaBudget, parseMode, parseOnly, selectSchemas, validatePhysicalIds }
