import { users } from "@/lib/server/appwrite-server";
import { jwtDecode } from "jwt-decode";
import { cookies } from "next/headers";

export async function getCurrentUser() {
  try {
    const cookieStore = await cookies();

    // Find the "appwrite_jwt" cookie
  const jwtCookie = cookieStore.get('appwrite_jwt')
    if (!jwtCookie || !jwtCookie.value) return null;

    const jwt = jwtCookie.value;

    // Decode JWT
    const decoded: any = jwtDecode(jwt);

    // Optional: check expiry
    if (!decoded.exp || Date.now() / 1000 > decoded.exp) {
      console.warn("[getCurrentUser] JWT expired or invalid.");
      return null;
    }

    // Find user ID in JWT payload
    const userId = decoded.userId || decoded.user_id || decoded.uid;
    if (!userId) return null;

    // Fetch user from Appwrite server SDK
    const user = await users.get(userId);
    return user;
  } catch (err) {
    console.error("[getCurrentUser] Failed:", err);
    return null;
  }
}