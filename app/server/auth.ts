import { cookies } from "next/headers";
import { jwtDecode } from "jwt-decode";
import { account } from "./appwrite"; // <-- this must be initialized properly

export async function getCurrentUser() {
  try {
    const cookieStore = await cookies();
    const jwtCookie = cookieStore.get("appwrite_jwt");
    if (!jwtCookie?.value) return null;

    const jwt = jwtCookie.value;
    const decoded = jwtDecode<{ exp?: number }>(jwt);

    if (!decoded.exp || Date.now() / 1000 > decoded.exp) {
      console.warn("[getCurrentUser] JWT expired");
      return null;
    }

    account.client.setJWT(jwt);

    const user = await account.get();
    return user;
  } catch (err) {
    console.error("[getCurrentUser] Failed:", err);
    return null;
  }
}
