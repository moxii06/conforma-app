import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { encrypt } from "@/lib/crypto";

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
};

// Completes the OAuth flow started at /api/integrations/google/connect —
// exchanges the authorization code for tokens, resolves the connected
// account's email, and stores the (encrypted) result as a MailboxConnection.
// Named to match the redirect URI already registered on the Google Cloud
// OAuth client, not because this is a NextAuth route.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  const cookieState = request.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("google_oauth_state="))
    ?.split("=")[1];

  const clearStateCookie = (response: NextResponse) => {
    response.cookies.set("google_oauth_state", "", { maxAge: 0, path: "/" });
    return response;
  };

  if (errorParam) {
    return clearStateCookie(NextResponse.redirect(new URL("/integrations?google_error=denied", url.origin)));
  }
  if (!code || !state || !cookieState || state !== cookieState) {
    return clearStateCookie(NextResponse.redirect(new URL("/integrations?google_error=invalid_state", url.origin)));
  }

  const session = await getSessionContext();
  if (!session || can(session.role, "integrations") === "none") {
    return clearStateCookie(NextResponse.redirect(new URL("/login", url.origin)));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return clearStateCookie(NextResponse.redirect(new URL("/integrations?google_error=not_configured", url.origin)));
  }

  const redirectUri = `${url.origin}/api/auth/callback/google`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  if (!tokenRes.ok) {
    return clearStateCookie(NextResponse.redirect(new URL("/integrations?google_error=token_exchange", url.origin)));
  }
  const tokens = (await tokenRes.json()) as TokenResponse;
  if (!tokens.refresh_token) {
    // Shouldn't happen with prompt=consent, but without a refresh_token the
    // connection is useless past the first hour — fail loudly rather than
    // silently storing something that'll stop working.
    return clearStateCookie(NextResponse.redirect(new URL("/integrations?google_error=no_refresh_token", url.origin)));
  }

  const userinfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!userinfoRes.ok) {
    return clearStateCookie(NextResponse.redirect(new URL("/integrations?google_error=userinfo", url.origin)));
  }
  const userinfo = (await userinfoRes.json()) as { email: string };

  // Upsert by (org, provider, accountEmail) rather than just (org,
  // provider) — an org can connect several distinct Gmail accounts;
  // reconnecting the SAME account refreshes its tokens instead of
  // creating a duplicate row.
  await prisma.mailboxConnection.upsert({
    where: {
      organizationId_provider_accountEmail: { organizationId: session.organizationId, provider: "gmail", accountEmail: userinfo.email },
    },
    update: {
      accessTokenEncrypted: encrypt(tokens.access_token),
      refreshTokenEncrypted: encrypt(tokens.refresh_token),
    },
    create: {
      organizationId: session.organizationId,
      provider: "gmail",
      accountEmail: userinfo.email,
      accessTokenEncrypted: encrypt(tokens.access_token),
      refreshTokenEncrypted: encrypt(tokens.refresh_token),
    },
  });

  return clearStateCookie(NextResponse.redirect(new URL("/integrations?google_connected=1", url.origin)));
}
