import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

// Auth for the platform-owner back-office (/plateforme) — deliberately its
// own thing, not a NextAuth session: the platform owner isn't a User row
// inside any Organization (every other role in this app is), so the normal
// tenant-scoped session model doesn't fit. A single shared secret is enough
// for a single operator — same "one env var, checked server-side" shape as
// CRON_SECRET (src/lib/cronAuth.ts) for the same reason: one trusted party,
// not a multi-user system needing real account management.

const COOKIE_NAME = "jalon-platform-admin";

function expectedToken(): string | null {
  const secret = process.env.PLATFORM_ADMIN_SECRET;
  if (!secret) return null;
  // The cookie never holds the raw secret — only a fixed HMAC of it, so a
  // leaked cookie doesn't hand over the credential itself, just a bearer
  // token for this one purpose (rotate PLATFORM_ADMIN_SECRET to invalidate
  // every issued cookie at once).
  return createHmac("sha256", secret).update("platform-admin-session").digest("hex");
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export function checkPlatformAdminPassword(password: string): boolean {
  const secret = process.env.PLATFORM_ADMIN_SECRET;
  if (!secret) return false;
  return timingSafeStringEqual(password, secret);
}

export async function isPlatformAdmin(): Promise<boolean> {
  const expected = expectedToken();
  if (!expected) return false;
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return false;
  return timingSafeStringEqual(token, expected);
}

export async function setPlatformAdminCookie(): Promise<void> {
  const token = expectedToken();
  if (!token) throw new Error("PLATFORM_ADMIN_SECRET non configuré.");
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
}

export async function clearPlatformAdminCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
