import { Client, Account, Databases, Storage, Functions } from "appwrite"

const client = new Client()

client.setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!).setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!).setDevKey('e2b8d7534a8cd041b6967612e0442c80ed1724d884a6a67a76fb4606929296d1bb2640e8db47a2b268a4051881503649595fa817083b056309b2c3b9d9196121c926760e68410eeaf1707cae96be3907cc3c251b19f6dfdb85f9184fd4a26dd2ed73f3349d5e96e50e99f5582c14efc22c2a0b3bfaab2980978fcf78f1766793')

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
