import { databases, DATABASE_ID, COLLECTIONS, Query, ID } from "@/app/server/appwrite/appwrite-server"
import { EvaluationError } from "./evaluation-errors"
import {
  assertPayloadField,
  deterministicJson,
  reconstructChunks,
  sha256,
  splitPayload,
  type PayloadChunk,
  type PayloadEntityType,
} from "./evaluation-payload-codec"

export type PayloadRevisionRef = {
  ownerUserId: string
  datasetVersionId?: string
  entityType: PayloadEntityType
  entityId: string
  payloadRevision: string
  manifest: Record<string, { hash: string; chunks: number }>
}

const PAGE_SIZE = 100
const BATCH_SIZE = 100
const QUERY_GROUP_SIZE = 25

function storageError(action: string): EvaluationError {
  return new EvaluationError("STORAGE_ERROR", `Failed to ${action}`, 500)
}

async function listPages(queries: string[], action: string): Promise<PayloadChunk[]> {
  const rows: PayloadChunk[] = []
  let offset = 0
  try {
    while (true) {
      const result = await databases.listDocuments(DATABASE_ID, COLLECTIONS.EVALUATION_PAYLOAD_CHUNKS, [
        ...queries,
        Query.orderAsc("payloadField"),
        Query.orderAsc("chunkIndex"),
        Query.limit(PAGE_SIZE),
        Query.offset(offset),
      ])
      rows.push(...(result.documents as unknown as PayloadChunk[]))
      if (result.documents.length < PAGE_SIZE) return rows
      offset += result.documents.length
    }
  } catch {
    throw storageError(action)
  }
}

function decode(ref: PayloadRevisionRef, rows: PayloadChunk[]): Record<string, unknown> {
  const expectedFields = new Set(Object.keys(ref.manifest))
  if (rows.some(row => !expectedFields.has(row.payloadField))) throw new Error("Unexpected payload field in revision")
  const output: Record<string, unknown> = {}
  for (const field of Object.keys(ref.manifest).sort()) {
    assertPayloadField(ref.entityType, field)
    const raw = reconstructChunks(rows.filter(row => row.payloadField === field), {
      ...ref,
      datasetVersionId: ref.datasetVersionId ?? null,
      payloadField: field,
      hash: ref.manifest[field].hash,
      chunks: ref.manifest[field].chunks,
    })
    try {
      output[field] = JSON.parse(raw)
    } catch {
      throw new Error(`Malformed payload JSON for ${field}`)
    }
  }
  return output
}

export class EvaluationPayloadRepository {
  async writeRevision(input: Omit<PayloadRevisionRef, "manifest"> & { values: Record<string, unknown> }): Promise<PayloadRevisionRef["manifest"]> {
    const manifest: PayloadRevisionRef["manifest"] = {}
    for (const field of Object.keys(input.values).sort()) {
      assertPayloadField(input.entityType, field)
      const raw = deterministicJson(input.values[field])
      const chunks = splitPayload(raw)
      const hash = sha256(raw)
      manifest[field] = { hash, chunks: chunks.length }
      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        try {
          await databases.createDocument(DATABASE_ID, COLLECTIONS.EVALUATION_PAYLOAD_CHUNKS, ID.unique(), {
            ownerUserId: input.ownerUserId,
            datasetVersionId: input.datasetVersionId ?? null,
            entityType: input.entityType,
            entityId: input.entityId,
            payloadField: field,
            payloadRevision: input.payloadRevision,
            chunkIndex,
            chunkCount: chunks.length,
            payloadChunk: chunks[chunkIndex],
            payloadHash: hash,
            createdAt: new Date().toISOString(),
          })
        } catch {
          throw storageError("write evaluation payload")
        }
      }
    }
    return manifest
  }

  async readRevision(input: PayloadRevisionRef): Promise<Record<string, unknown>> {
    const rows = await listPages([
      Query.equal("ownerUserId", input.ownerUserId),
      Query.equal("entityType", input.entityType),
      Query.equal("entityId", input.entityId),
      Query.equal("payloadRevision", input.payloadRevision),
    ], "read evaluation payload")
    return decode(input, rows)
  }

  async batchReadRevisions(refs: PayloadRevisionRef[]): Promise<Map<string, Record<string, unknown>>> {
    if (!refs.length) return new Map()
    if (refs.length > BATCH_SIZE) throw new Error(`Payload batch exceeds ${BATCH_SIZE} entities`)
    const output = new Map<string, Record<string, unknown>>()
    const groups = new Map<string, PayloadRevisionRef[]>()
    for (const ref of refs) {
      const key = `${ref.ownerUserId}\0${ref.entityType}`
      groups.set(key, [...(groups.get(key) ?? []), ref])
    }
    for (const group of groups.values()) {
      for (let start = 0; start < group.length; start += QUERY_GROUP_SIZE) {
        const subset = group.slice(start, start + QUERY_GROUP_SIZE)
        const rows = await listPages([
          Query.equal("ownerUserId", subset[0].ownerUserId),
          Query.equal("entityType", subset[0].entityType),
          Query.equal("entityId", [...new Set(subset.map(ref => ref.entityId))]),
          Query.equal("payloadRevision", [...new Set(subset.map(ref => ref.payloadRevision))]),
        ], "batch read evaluation payloads")
        for (const ref of subset) {
          const relevant = rows.filter(row => row.entityId === ref.entityId && row.payloadRevision === ref.payloadRevision)
          const key = `${ref.entityType}:${ref.entityId}:${ref.payloadRevision}`
          if (!relevant.length) throw new Error(`Missing payload entity ${key}`)
          output.set(key, decode(ref, relevant))
        }
      }
    }
    if (output.size !== refs.length) throw new Error("Missing or duplicate payload entity reference")
    return output
  }

  async deleteRevision(input: Pick<PayloadRevisionRef, "ownerUserId" | "entityType" | "entityId" | "payloadRevision">): Promise<void> {
    while (true) {
      let result
      try {
        result = await databases.listDocuments(DATABASE_ID, COLLECTIONS.EVALUATION_PAYLOAD_CHUNKS, [
          Query.equal("ownerUserId", input.ownerUserId),
          Query.equal("entityType", input.entityType),
          Query.equal("entityId", input.entityId),
          Query.equal("payloadRevision", input.payloadRevision),
          Query.limit(PAGE_SIZE),
          Query.offset(0),
        ])
      } catch {
        throw storageError("list evaluation payload cleanup")
      }
      if (!result.documents.length) return
      for (const document of result.documents) {
        try {
          await databases.deleteDocument(DATABASE_ID, COLLECTIONS.EVALUATION_PAYLOAD_CHUNKS, String(document.$id))
        } catch {
          throw storageError("delete evaluation payload")
        }
      }
    }
  }
}

export const evaluationPayloadRepository = new EvaluationPayloadRepository()
