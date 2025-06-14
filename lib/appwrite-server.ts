// lib/appwrite-server.ts
import { Client, Users } from "node-appwrite"

const serverClient = new Client()
  .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
  .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!)
  .setKey(process.env.APPWRITE_API_KEY!)

export const users = new Users(serverClient)


/**
 * Returns user info if session is valid, null otherwise
 */
export async function getUserFromSession(userId: string, sessionId: string) {
  try {
    if (!userId || !sessionId) {
      console.error("Missing userId or sessionId")
      return null
    }

    const user = await users.get(userId)
    return user
  } catch (error) {
    console.error("getUserFromSession error:", error)
    return null
  }
}

export { serverClient }
