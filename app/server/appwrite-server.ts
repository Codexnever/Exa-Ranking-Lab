// lib/appwrite-server.ts
import { Client, Account, Users, Databases, Query } from "node-appwrite";

const serverClient = new Client()
  .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
  .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!)
  .setKey(process.env.APPWRITE_API_KEY!); // Secure server key

export const users = new Users(serverClient);
export const serverAccount = new Account(serverClient);
export const databases = new Databases(serverClient);

export { serverClient };
