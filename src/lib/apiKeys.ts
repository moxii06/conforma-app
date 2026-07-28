import { createHash, randomBytes, createHmac, timingSafeEqual } from "crypto";

// Everything a public API key does, in one place and unit-tested — this is
// the boundary that decides whether a stranger's HTTP call gets to read a
// tenant's data, so the rules must not be spread across route handlers.

export const API_SCOPES = [
  "read:dossiers",
  "read:contacts",
  "read:sessions",
  "read:courses",
  "read:invoices",
] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export const API_SCOPE_LABELS: Record<ApiScope, string> = {
  "read:dossiers": "Lire les inscriptions et leur avancement",
  "read:contacts": "Lire les apprenants et prospects",
  "read:sessions": "Lire les sessions programmées",
  "read:courses": "Lire le catalogue de formations",
  "read:invoices": "Lire les factures et leur statut",
};

export const WEBHOOK_EVENTS = [
  "dossier.created",
  "dossier.completed",
  "invoice.paid",
  "session.confirmed",
  "learner.inactive",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const WEBHOOK_EVENT_LABELS: Record<WebhookEvent, string> = {
  "dossier.created": "Un apprenant vient d'être inscrit",
  "dossier.completed": "Une formation est terminée à 100 %",
  "invoice.paid": "Une facture est soldée",
  "session.confirmed": "Une session passe de brouillon à validée",
  "learner.inactive": "Un apprenant décroche (14 jours sans activité)",
};

// "live" leaves room for a future "test" prefix without changing the format.
const KEY_PREFIX = "jln_live_";
const PREFIX_VISIBLE_CHARS = 8;

export type GeneratedKey = { plain: string; hash: string; prefix: string };

/**
 * 32 random bytes: enough entropy that guessing is not a threat model, which
 * is what makes the fast hash below safe.
 */
export function generateApiKey(): GeneratedKey {
  const plain = KEY_PREFIX + randomBytes(32).toString("base64url");
  return {
    plain,
    hash: hashApiKey(plain),
    // Shown in the UI so an admin can tell two keys apart. Not enough to
    // reconstruct anything.
    prefix: plain.slice(0, KEY_PREFIX.length + PREFIX_VISIBLE_CHARS),
  };
}

export function hashApiKey(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}

/**
 * Pulls the key out of an Authorization header. Returns null for anything
 * malformed rather than guessing — a caller that got the format wrong should
 * see a clear 401, not a confusing lookup failure.
 */
export function extractBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(authorizationHeader.trim());
  if (!match) return null;
  const token = match[1];
  return token.startsWith(KEY_PREFIX) ? token : null;
}

/**
 * A key must hold the scope explicitly. No implicit "read everything"
 * fallback: a key created before a scope existed must not silently gain it
 * when the scope is added later.
 */
export function hasScope(grantedScopes: string[], required: ApiScope): boolean {
  return grantedScopes.includes(required);
}

export function isKeyUsable(key: { revokedAt: Date | null }): boolean {
  return key.revokedAt === null;
}

// --- Webhooks ---------------------------------------------------------------

export function generateWebhookSecret(): string {
  return "whsec_" + randomBytes(24).toString("base64url");
}

/**
 * HMAC-SHA256 over the exact body bytes we send. The receiver recomputes it
 * with their copy of the secret; a mismatch means the call did not come from
 * us. Without this a webhook URL is an open endpoint anyone can post to.
 */
export function signWebhookPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Constant-time comparison. A plain `===` leaks, through timing, how many
 * leading characters were correct, which is enough to forge a signature one
 * character at a time.
 */
export function verifyWebhookSignature(payload: string, secret: string, signature: string): boolean {
  const expected = signWebhookPayload(payload, secret);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
