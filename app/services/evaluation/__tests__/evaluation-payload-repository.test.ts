const documents: Array<Record<string, unknown> & { $id: string }> = []
let sequence = 0

jest.mock("@/app/server/appwrite/appwrite-server", () => ({
  DATABASE_ID: "database",
  COLLECTIONS: { EVALUATION_PAYLOAD_CHUNKS: "payload_chunks" },
  ID: { unique: () => `chunk-${++sequence}` },
  Query: {
    equal: (key: string, value: unknown) => ({ key, value }),
    limit: (value:number) => ({kind:"limit",value}),
    offset: (value:number) => ({kind:"offset",value}),
    orderAsc: () => ({kind:"order"}),
  },
  databases: {
    createDocument: jest.fn(async (_databaseId: string, _collectionId: string, id: string, value: Record<string, unknown>) => {
      const document = { $id: id, ...structuredClone(value) }
      documents.push(document)
      return document
    }),
    listDocuments: jest.fn(async (_databaseId: string, _collectionId: string, queries: Array<{ key?: string; value?: unknown;kind?:string } | null>) => {
      const filters = queries.filter((query): query is { key: string; value: unknown } => Boolean(query?.key))
      const selected = documents.filter(document => filters.every(filter => Array.isArray(filter.value)?filter.value.includes(document[filter.key]):document[filter.key] === filter.value))
      const limit=Number(queries.find(query=>query?.kind==="limit")?.value??100)
      const offset=Number(queries.find(query=>query?.kind==="offset")?.value??0)
      return { documents: structuredClone(selected.slice(offset,offset+limit)), total: selected.length }
    }),
    deleteDocument: jest.fn(async (_databaseId: string, _collectionId: string, id: string) => {
      const index = documents.findIndex(document => document.$id === id)
      if (index >= 0) documents.splice(index, 1)
    }),
  },
}))

import { databases } from "@/app/server/appwrite/appwrite-server"
import { createManifest } from "../evaluation-payload-codec"
import { EvaluationPayloadRepository, type PayloadRevisionRef } from "../evaluation-payload-repository"

describe("EvaluationPayloadRepository", () => {
  beforeEach(() => {
    documents.splice(0)
    sequence = 0
    jest.clearAllMocks()
  })

  test("writes deterministic chunks and reconstructs a revision", async () => {
    const repository = new EvaluationPayloadRepository()
    const values = { aggregate_result: { z: 1, a: 2 } }
    const expected = createManifest(values)
    const manifest = await repository.writeRevision({
      ownerUserId: "owner",
      datasetVersionId: "dataset",
      entityType: "evaluation_run",
      entityId: "run",
      payloadRevision: expected.revision,
      values,
    })
    expect(manifest.aggregate_result).toEqual(expected.manifest.aggregate_result)
    await expect(repository.readRevision({
      ownerUserId: "owner",
      datasetVersionId: "dataset",
      entityType: "evaluation_run",
      entityId: "run",
      payloadRevision: expected.revision,
      manifest: { aggregate_result: manifest.aggregate_result },
    })).resolves.toEqual(values)
  })

  test("normalizes an absent dataset ID to null and deletes only the requested revision", async () => {
    const repository = new EvaluationPayloadRepository()
    const values = { query_result: { value: 1 } }
    const expected = createManifest(values)
    const input = {
      ownerUserId: "owner",
      entityType: "evaluation_run_query" as const,
      entityId: "query-result",
      payloadRevision: expected.revision,
      values,
    }
    const manifest = await repository.writeRevision(input)
    expect(documents[0].datasetVersionId).toBeNull()
    await expect(repository.readRevision({ ...input, manifest })).resolves.toEqual(values)
    await repository.deleteRevision(input)
    expect(documents).toHaveLength(0)
    expect(databases.deleteDocument).toHaveBeenCalledTimes(1)
  })

  test("rejects tampered payload chunks", async () => {
    const repository = new EvaluationPayloadRepository()
    const values = { query_result: { value: 1 } }
    const expected = createManifest(values)
    const input = {
      ownerUserId: "owner",
      datasetVersionId: "dataset",
      entityType: "evaluation_run_query" as const,
      entityId: "query-result",
      payloadRevision: expected.revision,
      values,
    }
    const manifest = await repository.writeRevision(input)
    documents[0].payloadChunk = '{"value":2}'
    await expect(repository.readRevision({ ...input, manifest })).rejects.toThrow(/hash mismatch/i)
  })

  test("batch reads multiple query payloads without one request per entity and enforces the batch bound",async()=>{
    const repository=new EvaluationPayloadRepository()
    const refs: PayloadRevisionRef[]=[]
    for(const id of ["q1","q2"]){const values={query_result:{id}},made=createManifest(values);const input={ownerUserId:"owner",datasetVersionId:"dataset",entityType:"evaluation_run_query" as const,entityId:id,payloadRevision:made.revision,values};const manifest=await repository.writeRevision(input);refs.push({...input,manifest})}
    jest.mocked(databases.listDocuments).mockClear()
    const result=await repository.batchReadRevisions(refs)
    expect(result).toHaveProperty("size",2)
    expect(databases.listDocuments).toHaveBeenCalledTimes(1)
    await expect(repository.batchReadRevisions(Array.from({length:101},(_,index)=>({...refs[0],entityId:`q-${index}`})))).rejects.toThrow(/exceeds 100/)
  })

  test("rejects foreign dataset identity and maps Appwrite failures safely",async()=>{
    const repository=new EvaluationPayloadRepository(),values={query_result:{value:1}},made=createManifest(values)
    const input={ownerUserId:"owner",datasetVersionId:"dataset",entityType:"evaluation_run_query" as const,entityId:"query",payloadRevision:made.revision,values}
    const manifest=await repository.writeRevision(input)
    await expect(repository.readRevision({...input,datasetVersionId:"other",manifest})).rejects.toThrow(/identity mismatch/)
    jest.mocked(databases.listDocuments).mockRejectedValueOnce(new Error("secret endpoint"))
    await expect(repository.readRevision({...input,manifest})).rejects.toMatchObject({code:"STORAGE_ERROR",message:"Failed to read evaluation payload"})
  })

  test("deletion remains exact and drains paginated results",async()=>{
    const repository=new EvaluationPayloadRepository(),values={query_result:{value:1}},made=createManifest(values)
    const target={ownerUserId:"owner",datasetVersionId:"dataset",entityType:"evaluation_run_query" as const,entityId:"target",payloadRevision:made.revision,values}
    const other={...target,entityId:"other"}
    await repository.writeRevision(target);await repository.writeRevision(other)
    await repository.deleteRevision(target)
    expect(documents.some(document=>document.entityId==="target")).toBe(false)
    expect(documents.some(document=>document.entityId==="other")).toBe(true)
  })
})
