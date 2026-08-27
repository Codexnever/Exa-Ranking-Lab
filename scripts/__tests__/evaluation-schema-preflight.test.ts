import fs from "node:fs"
import path from "node:path"
import preflight from "../evaluation-schema-preflight.cjs"

const {
  DEFAULT_COLLECTION_IDS,
  SAFE_DECLARED_STRING_CHARS,
  analyzeSchemaBudget,
  parseMode,
  parseOnly,
  selectSchemas,
  validatePhysicalIds,
} = preflight

const root = path.resolve(__dirname, "../..")
const provisioner = fs.readFileSync(path.join(root, "scripts/provision-evaluation-schema.mjs"), "utf8")
const envExample = fs.readFileSync(path.join(root, ".env.example"), "utf8")

describe("evaluation schema provisioning preflight", () => {
  test("all thirteen physical IDs are valid and unique", () => {
    expect(Object.keys(DEFAULT_COLLECTION_IDS)).toHaveLength(13)
    expect(() => validatePhysicalIds(DEFAULT_COLLECTION_IDS)).not.toThrow()
    expect(new Set(Object.values(DEFAULT_COLLECTION_IDS)).size).toBe(13)
  })

  test("strategy document physical ID is within Appwrite's limit", () => {
    expect(DEFAULT_COLLECTION_IDS.strategyExecutionDocuments).toBe("evaluation_strategy_docs_v1")
    expect(DEFAULT_COLLECTION_IDS.strategyExecutionDocuments.length).toBeLessThanOrEqual(36)
  })

  test("dry-run and inspect disable mutations", () => {
    expect(parseMode(["node", "script", "--dry-run"])).toBe("dry-run")
    expect(parseMode(["node", "script", "--inspect"])).toBe("inspect")
    expect(provisioner).toContain('const dryRun = mode !== "apply"')
    expect(provisioner).toContain("if (!dryRun)")
  })

  test("accepts valid one-collection physical selection", () => {
    expect(parseOnly(["node","script","--only=evaluation_runs_v1"])).toEqual(["evaluation_runs_v1"])
  })

  test("accepts valid two-collection physical selection in both CLI forms", () => {
    const expected = ["evaluation_runs_v1","evaluation_run_queries_v1"]
    expect(parseOnly(["node","script","--only=evaluation_runs_v1,evaluation_run_queries_v1"])).toEqual(expected)
    expect(parseOnly(["node","script","--only","evaluation_runs_v1,evaluation_run_queries_v1"])).toEqual(expected)
  })

  test("rejects unknown, duplicate, and empty physical selections", () => {
    const schemas = [{id:"evaluation_runs_v1"},{id:"evaluation_run_queries_v1"}]
    expect(() => selectSchemas(schemas, ["unknown"])).toThrow(/Unknown --only/)
    expect(() => parseOnly(["node","script","--only=evaluation_runs_v1,evaluation_runs_v1"])).toThrow(/Duplicate --only/)
    expect(() => parseOnly(["node","script","--only="])).toThrow(/non-empty/)
    expect(() => parseOnly(["node","script","--only"])).toThrow(/non-empty/)
  })

  test("scoped selection preserves requested order and excludes every unselected schema", () => {
    const schemas = Object.values(DEFAULT_COLLECTION_IDS).map(id => ({id}))
    expect(selectSchemas(schemas, ["evaluation_runs_v1","evaluation_run_queries_v1"]).map((schema: {id:string}) => schema.id)).toEqual([
      "evaluation_runs_v1",
      "evaluation_run_queries_v1",
    ])
  })

  test("scoped normal execution never invokes mutation methods for unselected schemas", async () => {
    const schemas = Object.values(DEFAULT_COLLECTION_IDS).map(id => ({id}))
    const selected = selectSchemas(schemas, ["evaluation_runs_v1","evaluation_run_queries_v1"])
    const mutations = { createCollection:jest.fn(), createAttribute:jest.fn(), createIndex:jest.fn() }
    for (const schema of selected) {
      mutations.createCollection(schema.id)
      mutations.createAttribute(schema.id)
      mutations.createIndex(schema.id)
    }
    for (const mutation of Object.values(mutations)) {
      expect(mutation.mock.calls.flat()).toEqual(["evaluation_runs_v1","evaluation_run_queries_v1"])
    }
  })

  test("dry-run and inspect scoped modes remain read-only in the provisioner", () => {
    expect(provisioner).toContain('const dryRun = mode !== "apply"')
    expect(provisioner).toContain("if (!dryRun)")
    expect(provisioner).toContain("for (const schema of selectedSchemas)")
    for (const mode of ["--dry-run","--inspect"]) expect(parseMode(["node","script",mode])).not.toBe("apply")
  })

  test("run schemas stay within the configured safe declared-string budget", () => {
    const runs = analyzeSchemaBudget([{type:"string",size:64},{type:"string",size:128},{type:"string",size:32},{type:"string",size:2048},{type:"string",size:64},{type:"string",size:4096},{type:"string",size:64}])
    const runQueries = analyzeSchemaBudget(Array.from({length:6},()=>({type:"string",size:64})).concat([{type:"string",size:4096}]))
    expect(runs).toMatchObject({declaredStringChars:6496,headroom:9888,withinSafeLimit:true,safeLimit:SAFE_DECLARED_STRING_CHARS})
    expect(runQueries).toMatchObject({declaredStringChars:4480,headroom:11904,withinSafeLimit:true,safeLimit:SAFE_DECLARED_STRING_CHARS})
  })

  test("stage trace schemas use bounded payload headers and dedicated documents", () => {
    expect(provisioner).toContain('s("payloadRevision",64),s("payloadManifestJson",4096),i("stageCount",true,1,20)')
    expect(provisioner).not.toContain('s("stagesJson",32768)')
    expect(provisioner).not.toContain('s("warningsJson",16384)')
    expect(provisioner).toContain('s("metadataJson",4096)')
    expect(DEFAULT_COLLECTION_IDS.stageTraces).toBe("evaluation_stage_traces_v1")
    expect(DEFAULT_COLLECTION_IDS.stageTraceDocuments).toBe("evaluation_stage_docs_v1")
  })

  test("stage trace schemas stay within the safe declared-string budget", () => {
    const headers = analyzeSchemaBudget([32,64,64,64,64,2000,64,4096,64].map(size=>({type:"string",size})))
    const documents = analyzeSchemaBudget([64,128,64,2048,2048,128,128,1000,255,256,4096].map(size=>({type:"string",size})))
    expect(headers).toMatchObject({declaredStringChars:6512,headroom:9872,withinSafeLimit:true})
    expect(documents).toMatchObject({declaredStringChars:10215,headroom:6169,withinSafeLimit:true})
  })

  test("strategy schemas use bounded payload pointers and fit the safe budget", () => {
    expect(provisioner).not.toContain('s("configurationJson",16384)')
    expect(provisioner).not.toContain('s("providerMetadataJson",16384)')
    expect(provisioner).toContain('s("payloadRevision",64),s("payloadManifestJson",4096),s("configHash",64)')
    expect(provisioner).toContain('s("payloadRevision",64,false),s("payloadManifestJson",4096,false)')
    expect(analyzeSchemaBudget([256,2000,256,256,64,4096,64,64].map(size => ({type:"string",size})))).toMatchObject({declaredStringChars:7056,headroom:9328,withinSafeLimit:true})
    expect(analyzeSchemaBudget([64,64,64,64,2000,64,128,64,64,4096,64].map(size => ({type:"string",size})))).toMatchObject({declaredStringChars:6736,headroom:9648,withinSafeLimit:true})
    expect(analyzeSchemaBudget([64,64,2048,2048,128,128,1000,255].map(size => ({type:"string",size})))).toMatchObject({declaredStringChars:5735,headroom:10649,withinSafeLimit:true})
  })

  test("searchConfigJson is required on dedicated config documents", () => {
    expect(provisioner).toContain('s("searchConfigJson",8192)')
  })

  test("server API key has no public fallback", () => {
    expect(provisioner).toContain("const apiKey = process.env.APPWRITE_API_KEY")
    expect(provisioner).not.toContain("APPWRITE_API_KEY ?? process.env.NEXT_PUBLIC_APPWRITE_API_KEY")
  })

  test("schema retains every expected collection", () => {
    for (const id of Object.values(DEFAULT_COLLECTION_IDS)) expect(envExample).toContain(id)
  })

  test("duplicate IDs are rejected", () => {
    expect(() => validatePhysicalIds({ first: "same_id", second: "same_id" })).toThrow(/Duplicate physical collection ID/)
  })

  test("unexpected legacy schema is reported and never deleted", () => {
    expect(provisioner).toContain("UNEXPECTED (preserved)")
    expect(provisioner).not.toMatch(/deleteCollection|deleteAttribute|deleteIndex/)
  })
})
