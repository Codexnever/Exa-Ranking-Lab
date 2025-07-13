import { Client, Account, Databases, Storage, Functions } from "appwrite"

const client = new Client()

client.setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!).setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!)

export const account = new Account(client)
export const databases = new Databases(client)
export const storage = new Storage(client)
export const functions = new Functions(client)

export const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!

// Collection IDs
export const COLLECTIONS = {
  USERS:process.env.COLLECTION_USERS!,
  QUERIES:process.env.COLLECTION_QUERIES!,
  SNAPSHOTS:process.env.COLLECTION_SNAPSHOTS!,
  FEEDBACK:process.env.COLLECTION_FEEDBACK!,
  ANALYTICS:process.env.COLLECTION_ANALYTICS!,
  NOTIFICATIONS:process.env.COLLECTION_NOTIFICATIONS!,
  ACCESS_LOGS: process.env.NEXT_PUBLIC_COLLECTION_ACCESS_LOGS!,
  API_USAGE:process.env.COLLECTION_API_USAGE!,
  SETTINGS:process.env.NEXT_PUBLIC_COLLECTION_SETTINGS!,
}

export { client }
