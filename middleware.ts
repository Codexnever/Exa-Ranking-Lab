import { NextRequest, NextResponse, userAgent } from "next/server";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const jwt = request.cookies.get("appwrite_jwt")?.value;

  const isAuthPage = pathname.startsWith("/auth");

  // 🧠 1. Handle bots — early exit
  const ua = userAgent(request);
  if (ua.isBot) {
    return new NextResponse("Bots not allowed", { status: 403 });
  }

  const userAgentInfo = {
    browser: ua.browser?.name || "unknown",
    version: ua.browser?.version || "unknown",
    deviceType: ua.device?.type || "desktop",
    os: ua.os?.name || "unknown",
    isBot: ua.isBot,
  };

  const response = NextResponse.next();
  response.headers.set("x-real-ip", request.headers.get("x-forwarded-for") || "unknown");
  response.headers.set("x-user-agent", JSON.stringify(userAgentInfo));

  // 🧠 2. Allow auth pages freely
  if (isAuthPage) return response;

  // 🧠 3. No JWT → redirect to /auth
  if (!jwt) {
    const loginUrl = new URL("/auth", request.url);
    loginUrl.searchParams.set("returnTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 🧠 4. Verify session using server route
  try {
    const origin = request.nextUrl.origin;

    const verifyRes = await fetch(`${origin}/api/verify-session`, {
      headers: {
        cookie: request.headers.get("cookie") || "",
      },
    });

    if (!verifyRes.ok) {
      const loginUrl = new URL("/auth", request.url);
      loginUrl.searchParams.set("returnTo", pathname);
      return NextResponse.redirect(loginUrl);
    }
  } catch (err) {
    console.error("[middleware] JWT verify failed:", err);
    const loginUrl = new URL("/auth", request.url);
    loginUrl.searchParams.set("returnTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}
export const config = {
  matcher: [
    // Only run middleware on real pages (not API, auth, _next, etc.)
    "/((?!api|_next|auth|favicon.ico|.*\\..*).*)",
  ],
};
