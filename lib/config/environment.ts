export type PublicAppwriteConfig = {
  endpoint: string
  projectId: string
  databaseId: string
}

export type ServerAppwriteConfig = PublicAppwriteConfig & { apiKey: string }

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
    apiKey: required("APPWRITE_API_KEY", env.APPWRITE_API_KEY ?? env.NEXT_PUBLIC_APPWRITE_API_KEY),
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
