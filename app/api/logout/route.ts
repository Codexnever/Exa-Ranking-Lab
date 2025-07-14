import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST() {
  console.log("Logging out...");
  // Use NextResponse to delete the cookie
  const response = NextResponse.json({ success: true });
  response.cookies.delete("appwrite_jwt");
  return response;
}