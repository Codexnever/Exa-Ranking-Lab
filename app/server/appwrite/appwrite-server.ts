// server//appwrite-server.ts
import { Client, Account, Users, Databases, Query, ID } from "node-appwrite";

const serverClient = new Client()
  .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
  .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!)
  .setKey(process.env.APPWRITE_API_KEY || process.env.NEXT_PUBLIC_APPWRITE_API_KEY!); // Secure server key

export const users = new Users(serverClient);
export const serverAccount = new Account(serverClient);
export const databases = new Databases(serverClient);

// Export server-safe query utilities
export { serverClient, Query, ID };

// Server-side safe configuration evaluation
export const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;

export const COLLECTIONS = {
  USERS:         process.env.COLLECTION_USERS!,
  QUERIES:       process.env.COLLECTION_QUERIES!,
  SNAPSHOTS:     process.env.COLLECTION_SNAPSHOTS!,
  FEEDBACK:      process.env.COLLECTION_FEEDBACK!,
  ANALYTICS:     process.env.COLLECTION_ANALYTICS!,
  NOTIFICATIONS: process.env.COLLECTION_NOTIFICATIONS!,
  ACCESS_LOGS:   process.env.NEXT_PUBLIC_COLLECTION_ACCESS_LOGS!,
  API_USAGE:     process.env.COLLECTION_API_USAGE!,
  SETTINGS:      process.env.NEXT_PUBLIC_COLLECTION_SETTINGS!,
};