import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSessionContext, can } from "@/lib/tenant";

// Kicks off the real Google OAuth flow for "connect a mailbox" (spec §5.11)
// — this is a data-source link, not a login, so it's deliberately separate
// from NextAuth's own Credentials-based sign-in rather than added as a
// second NextAuth provider (which would conflate "authenticate as this
// Conforma user" with "grant Conforma read/send access to this Gmail
// account").
export async function GET(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.redirect(new URL("/login", request.url));
  if (can(session.role, "integrations") === "none") {
    return NextResponse.redirect(new URL("/integrations?google_error=forbidden", request.url));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(new URL("/integrations?google_error=not_configured", request.url));
  }

  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/auth/callback/google`;
  const state = randomBytes(16).toString("hex");

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set(
    "scope",
    [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/userinfo.email",
    ].join(" ")
  );
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent"); // guarantees a refresh_token even on reconnect
  authUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authUrl);
  response.cookies.set("google_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return response;
}
