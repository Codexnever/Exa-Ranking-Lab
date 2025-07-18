// app/server/appwrite.ts
import { Client, Account, Databases, Storage, Functions } from "appwrite";

const client = new Client();

client
  .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
  .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!);
// Removed setDevKey - insecure for client; use sessions

export const account = new Account(client);
export const databases = new Databases(client);
export const storage = new Storage(client);
export const functions = new Functions(client);

export const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;

// Collection IDs (unchanged)
export const COLLECTIONS = {
  USERS: process.env.COLLECTION_USERS!,
  QUERIES: process.env.COLLECTION_QUERIES!,
  SNAPSHOTS: process.env.COLLECTION_SNAPSHOTS!,
  FEEDBACK: process.env.COLLECTION_FEEDBACK!,
  ANALYTICS: process.env.COLLECTION_ANALYTICS!,
  NOTIFICATIONS: process.env.COLLECTION_NOTIFICATIONS!,
  ACCESS_LOGS: process.env.NEXT_PUBLIC_COLLECTION_ACCESS_LOGS!,
  API_USAGE: process.env.COLLECTION_API_USAGE!,
  SETTINGS: process.env.NEXT_PUBLIC_COLLECTION_SETTINGS!,
};

// Login function (fixed: create session first, then JWT)
export async function login(email: string, password: string) {
  try {
    // Delete any existing session
    await account.deleteSession('current').catch(() => {}); // Ignore if none

    // Create session (this grants scope)
    const session = await account.createEmailPasswordSession(email, password);

    // Generate JWT from session
    const jwtRes = await account.createJWT();
    const jwt = jwtRes.jwt;
    if (!jwt) throw new Error('JWT not generated');

    // Set JWT in cookie via API route
    const res = await fetch("/api/set-cookie", {
      method: "POST",
      body: JSON.stringify({ jwt }),
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });
    if (!res.ok) throw new Error('Failed to set cookie');

    console.log("Login successful. Session:", session);
    return session;
  } catch (error) {
    console.error("Login error:", error);
    throw error;
  }
}

// Register function (fixed similarly)
export async function register(email: string, password: string, name: string) {
  try {
    await account.deleteSession('current').catch(() => {});
    await account.create("unique()", email, password, name);
    return await login(email, password); // Auto-login
  } catch (error) {
    console.error("Register error:", error);
    throw error;
  }
}


// Logout function
export async function logout() {
  try {
    await account.deleteSession('current');
    console.log("Logged out successfully");
  } catch (error) {
    console.error("Logout error:", error);
  }
}

// Get current account (client-side check)
export async function getCurrentAccount() {
  try {
    return await account.get();
  } catch (error) {
    return null;
  }
}

export { client };
