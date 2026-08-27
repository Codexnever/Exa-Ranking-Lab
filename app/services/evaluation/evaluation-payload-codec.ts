import { createHash } from "node:crypto"

export const PAYLOAD_CHUNK_MAX_UTF8_BYTES = 8_000
export const PAYLOAD_CHUNK_MAX_SCHEMA_CHARACTERS = 8_000
export const PAYLOAD_MAX_CHUNKS = 100

export type PayloadEntityType = "evaluation_run" | "evaluation_run_query" | "stage_trace" | "strategy" | "strategy_execution"
export type PayloadField = "snapshot_selections" | "aggregate_result" | "warnings" | "query_result" | "stage_definitions" | "strategy_configuration" | "provider_metadata"
export type PayloadManifest = Record<string, { hash: string; chunks: number }>
export type PayloadChunk = {
  ownerUserId: string
  datasetVersionId?: string | null
  entityType: PayloadEntityType
  entityId: string
  payloadField: PayloadField
  payloadRevision: string
  chunkIndex: number
  chunkCount: number
  payloadChunk: string
  payloadHash: string
}

const fields: Record<PayloadEntityType, readonly PayloadField[]> = {
  evaluation_run: ["snapshot_selections", "aggregate_result", "warnings"],
  evaluation_run_query: ["query_result"],
  stage_trace: ["stage_definitions", "warnings"],
  strategy: ["strategy_configuration"],
  strategy_execution: ["provider_metadata"],
}

export function assertPayloadField(entityType: PayloadEntityType, field: string): asserts field is PayloadField {
  if (!fields[entityType]?.includes(field as PayloadField)) {
    throw new Error(`Payload field ${field} is not allowed for ${entityType}`)
  }
}

function normalize(value: unknown, seen: Set<object>): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Non-finite numbers are not supported")
    return value
  }
  if (["undefined", "function", "symbol", "bigint"].includes(typeof value)) {
    throw new Error("Unsupported payload value")
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error("Invalid Date values are not supported")
    return value.toISOString()
  }
  if (typeof value !== "object") throw new Error("Unsupported payload value")
  if (seen.has(value)) throw new Error("Cyclic payload is not supported")
  seen.add(value)
  if (Array.isArray(value)) {
    const result = value.map(item => normalize(item, seen))
    seen.delete(value)
    return result
  }
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== null && prototype.constructor?.name !== "Object") throw new Error("Class instances are not supported")
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    if (["__proto__", "constructor", "prototype"].includes(key)) throw new Error("Unsafe payload key")
    result[key] = normalize((value as Record<string, unknown>)[key], seen)
  }
  seen.delete(value)
  return result
}

export function deterministicJson(value: unknown): string {
  return JSON.stringify(normalize(value, new Set()))
}

export function sha256(value: string): string {
  return createHash("sha256").update(Buffer.from(value, "utf8")).digest("hex")
}

// Appwrite string(8000) is character-sized. The 8000-byte ceiling is deliberately
// more conservative and also enforces the schema character ceiling.
export function splitPayload(
  serialized: string,
  maxUtf8Bytes = PAYLOAD_CHUNK_MAX_UTF8_BYTES,
  maxSchemaCharacters = PAYLOAD_CHUNK_MAX_SCHEMA_CHARACTERS
): string[] {
  if (!Number.isInteger(maxUtf8Bytes) || maxUtf8Bytes < 1 || !Number.isInteger(maxSchemaCharacters) || maxSchemaCharacters < 1) {
    throw new Error("Payload chunk limits must be positive integers")
  }
  const chunks: string[] = []
  let current = ""
  let currentBytes = 0
  let currentCharacters = 0
  for (const codePoint of serialized) {
    const bytes = Buffer.byteLength(codePoint, "utf8")
    if (bytes > maxUtf8Bytes) throw new Error("A Unicode code point exceeds the payload byte limit")
    if (current && (currentBytes + bytes > maxUtf8Bytes || currentCharacters + 1 > maxSchemaCharacters)) {
      chunks.push(current)
      current = ""
      currentBytes = 0
      currentCharacters = 0
    }
    current += codePoint
    currentBytes += bytes
    currentCharacters += 1
  }
  chunks.push(current)
  if (chunks.length > PAYLOAD_MAX_CHUNKS) throw new Error(`Payload exceeds ${PAYLOAD_MAX_CHUNKS} chunks`)
  return chunks
}

export function createManifest(values: Record<string, unknown>): {
  revision: string
  manifest: PayloadManifest
  serialized: Record<string, string>
} {
  const serialized: Record<string, string> = {}
  const manifest: PayloadManifest = {}
  for (const field of Object.keys(values).sort()) {
    const raw = deterministicJson(values[field])
    const chunks = splitPayload(raw)
    serialized[field] = raw
    manifest[field] = { hash: sha256(raw), chunks: chunks.length }
  }
  return { revision: sha256(Object.keys(serialized).map(field => `${field}:${serialized[field]}`).join("|")), manifest, serialized }
}

export function manifestJson(manifest: PayloadManifest): string {
  return JSON.stringify(Object.fromEntries(Object.keys(manifest).sort().map(key => [key, manifest[key]])))
}

export function parseManifest(raw: string, entityType: PayloadEntityType): PayloadManifest {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error("Malformed payload manifest JSON")
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Malformed payload manifest")
  const result: PayloadManifest = {}
  for (const field of Object.keys(parsed as Record<string, unknown>).sort()) {
    assertPayloadField(entityType, field)
    const item = (parsed as Record<string, unknown>)[field]
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Malformed payload manifest entry")
    const entry = item as Record<string, unknown>
    if (Object.keys(entry).sort().join(",") !== "chunks,hash") throw new Error("Unknown payload manifest entry property")
    if (typeof entry.hash !== "string" || !/^[a-f0-9]{64}$/.test(entry.hash)) throw new Error("Invalid payload manifest hash")
    if (!Number.isInteger(entry.chunks) || Number(entry.chunks) < 1 || Number(entry.chunks) > PAYLOAD_MAX_CHUNKS) {
      throw new Error("Invalid payload manifest chunk count")
    }
    result[field] = { hash: entry.hash, chunks: Number(entry.chunks) }
  }
  if (Object.keys(result).length !== fields[entityType].length || fields[entityType].some(field => !result[field])) {
    throw new Error("Payload manifest is missing required fields")
  }
  if (raw !== manifestJson(result)) throw new Error("Payload manifest must use canonical field order without duplicates")
  return result
}

export function reconstructChunks(
  rows: PayloadChunk[],
  expected: {
    ownerUserId: string
    datasetVersionId?: string | null
    entityType: PayloadEntityType
    entityId: string
    payloadField: PayloadField
    payloadRevision: string
    hash: string
    chunks: number
  }
): string {
  assertPayloadField(expected.entityType, expected.payloadField)
  if (!rows.length) throw new Error("Empty payload chunk list")
  if (rows.length !== expected.chunks) throw new Error("Missing payload chunks")
  const seen = new Set<number>()
  for (const row of rows) {
    assertPayloadField(row.entityType, row.payloadField)
    if (
      row.ownerUserId !== expected.ownerUserId ||
      (row.datasetVersionId ?? null) !== (expected.datasetVersionId ?? null) ||
      row.entityType !== expected.entityType ||
      row.entityId !== expected.entityId ||
      row.payloadField !== expected.payloadField ||
      row.payloadRevision !== expected.payloadRevision ||
      row.payloadHash !== expected.hash ||
      row.chunkCount !== expected.chunks ||
      !Number.isInteger(row.chunkIndex) ||
      row.chunkIndex < 0 ||
      seen.has(row.chunkIndex)
    ) {
      throw new Error("Payload chunk identity mismatch")
    }
    seen.add(row.chunkIndex)
  }
  for (let index = 0; index < expected.chunks; index++) {
    if (!seen.has(index)) throw new Error("Payload chunk indexes are not contiguous")
  }
  const raw = [...rows].sort((a, b) => a.chunkIndex - b.chunkIndex).map(row => row.payloadChunk).join("")
  if (sha256(raw) !== expected.hash) throw new Error("Payload hash mismatch")
  return raw
}

export const allowedPayloadFields = fields
