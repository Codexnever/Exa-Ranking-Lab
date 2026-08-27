export type PublicAppwriteConfig = {
  endpoint: string
  projectId: string
  databaseId: string
}

export type ServerAppwriteConfig = PublicAppwriteConfig & { apiKey: string }

export const EVALUATION_COLLECTION_DEFAULTS = Object.freeze({
  EVALUATION_DATASETS: "evaluation_datasets_v1",
  EVALUATION_QUERIES: "evaluation_queries_v1",
  EVALUATION_QUERY_CONFIGS: "evaluation_query_configs_v1",
  RELEVANCE_JUDGMENTS: "relevance_judgments_v2",
  EVALUATION_JUDGMENT_PAYLOADS: "relevance_judgment_payloads_v1",
  EVALUATION_PAYLOAD_CHUNKS: "evaluation_payload_chunks_v1",
  EVALUATION_RUNS: "evaluation_runs_v1",
  EVALUATION_RUN_QUERIES: "evaluation_run_queries_v1",
  EVALUATION_STAGE_TRACES: "evaluation_stage_traces_v1",
  EVALUATION_STAGE_TRACE_DOCUMENTS: "evaluation_stage_docs_v1",
  EVALUATION_STRATEGIES: "evaluation_strategies_v1",
  EVALUATION_STRATEGY_EXECUTIONS: "evaluation_strategy_execs_v1",
  EVALUATION_STRATEGY_EXECUTION_DOCUMENTS: "evaluation_strategy_docs_v1",
})

function required(name: string, value: string | undefined): string {
  if (!value?.trim()) {
    throw new Error(`[configuration] Missing required environment variable ${name}`)
  }
  return value.trim()
}

type Environment = Readonly<Record<string, string | undefined>>
const publicEnvironment: Environment = {
  NEXT_PUBLIC_APPWRITE_ENDPOINT: process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT,
  NEXT_PUBLIC_APPWRITE_PROJECT_ID: process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID,
  NEXT_PUBLIC_APPWRITE_DATABASE_ID: process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID,
}

export function getPublicAppwriteConfig(env: Environment = publicEnvironment): PublicAppwriteConfig {
  return {
    endpoint: required("NEXT_PUBLIC_APPWRITE_ENDPOINT", env.NEXT_PUBLIC_APPWRITE_ENDPOINT),
    projectId: required("NEXT_PUBLIC_APPWRITE_PROJECT_ID", env.NEXT_PUBLIC_APPWRITE_PROJECT_ID),
    databaseId: required("NEXT_PUBLIC_APPWRITE_DATABASE_ID", env.NEXT_PUBLIC_APPWRITE_DATABASE_ID),
  }
}

export function getServerAppwriteConfig(env: Environment = process.env): ServerAppwriteConfig {
  return {
    ...getPublicAppwriteConfig(env),
    apiKey: required("APPWRITE_API_KEY", env.APPWRITE_API_KEY),
  }
}

export function lazyService<T extends object>(factory: () => T): T {
  let service: T | undefined
  const get = () => (service ??= factory())
  return new Proxy({} as T, {
    get(_target, property) {
      const value = Reflect.get(get(), property)
      return typeof value === "function" ? value.bind(get()) : value
    },
  })
}
