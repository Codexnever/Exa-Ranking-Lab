import { users } from "./appwrite-server";
import { jwtDecode } from "jwt-decode";
import { cookies } from "next/headers";

interface DecodedJWT {
  userId?: string;
  user_id?: string;
  uid?: string;
  exp?: number;
}

export async function getCurrentUser() {
  try {
    const cookieStore = await cookies();
    const jwtCookie = cookieStore.get("appwrite_jwt");
    if (!jwtCookie?.value) return null;

    const jwt = jwtCookie.value;
    const decoded = jwtDecode<DecodedJWT>(jwt);
    // Check expiry
    if (!decoded.exp || Date.now() / 1000 > decoded.exp) {
      console.warn("[getCurrentUser] JWT expired or invalid.");
      return null;
    }
    // Find user ID
    const userId = decoded.userId || decoded.user_id || decoded.uid;
    if (!userId) return null;

    // Fetch user from Appwrite
    try {
      const user = await users.get(userId);
      return user;
    } catch (err) {
      console.error("[getCurrentUser] User fetch failed:", err);
      return null;
    }
  } catch (err) {
    console.error("[getCurrentUser] Failed:", err);
    return null;
  }
}
