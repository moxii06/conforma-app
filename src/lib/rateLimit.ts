import { prisma } from "@/lib/prisma";

/**
 * Rate limiting for the unauthenticated surface.
 *
 * Backed by the database, not an in-process counter: on Vercel consecutive
 * requests land on different serverless instances, so a module-level Map
 * resets constantly and stops almost nobody. The cost is one extra query on
 * endpoints that are low-traffic by nature (login, password reset, signup,
 * public forms) — never on the authenticated app.
 *
 * Fixed window rather than a sliding one: a determined attacker can send
 * 2×limit requests across a window boundary, which is irrelevant at these
 * thresholds and keeps this to a single indexed row per caller.
 */
export type RateLimitRule = { limit: number; windowMs: number };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export const RATE_LIMITS = {
  // Password guessing against one account. Deliberately per-email, not just
  // per-IP: a botnet rotates addresses, the target account doesn't change.
  login: { limit: 10, windowMs: 15 * MINUTE },
  // Every call sends an email, so this doubles as protection against using
  // Jalon to bombard someone's inbox (and against burning the Brevo quota).
  forgotPassword: { limit: 5, windowMs: HOUR },
  signup: { limit: 5, windowMs: HOUR },
  publicForm: { limit: 10, windowMs: HOUR },
} as const satisfies Record<string, RateLimitRule>;

const GC_PROBABILITY = 0.01;
const GC_AGE_MS = 24 * HOUR;

export type RateLimitVerdict = { allowed: boolean; retryAfterSeconds: number };

const ALLOWED: RateLimitVerdict = { allowed: true, retryAfterSeconds: 0 };

/**
 * Read-only: is this key currently blocked? Does not count the call.
 *
 * Used by login, where only *failed* attempts should count — otherwise
 * someone signing in ten times in a normal working day locks themselves out.
 */
export async function checkRateLimit(key: string, rule: RateLimitRule): Promise<RateLimitVerdict> {
  try {
    const existing = await prisma.rateLimitCounter.findUnique({ where: { key } });
    if (!existing) return ALLOWED;
    const msLeft = existing.windowStart.getTime() + rule.windowMs - Date.now();
    if (msLeft <= 0 || existing.count < rule.limit) return ALLOWED;
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(msLeft / 1000)) };
  } catch (error) {
    logLimiterFailure("checkRateLimit", key, error);
    return ALLOWED; // see failure policy on consumeRateLimit
  }
}

/**
 * Counts one attempt against `key` and says whether it may proceed.
 *
 * For endpoints where every call has a cost regardless of outcome (each one
 * sends an email or creates a record), so success and failure both count.
 *
 * Fails OPEN: if the counter query itself errors, the request is allowed
 * through. A database hiccup must not lock every user out of the product —
 * the opposite trade-off from cronAuth, where failing closed only delays a
 * scheduled job.
 */
export async function consumeRateLimit(key: string, rule: RateLimitRule): Promise<RateLimitVerdict> {
  const now = new Date();

  try {
    const existing = await prisma.rateLimitCounter.findUnique({ where: { key } });

    // No counter yet, or the previous window has closed: start a new one.
    if (!existing || now.getTime() - existing.windowStart.getTime() >= rule.windowMs) {
      await prisma.rateLimitCounter.upsert({
        where: { key },
        create: { key, count: 1, windowStart: now },
        update: { count: 1, windowStart: now },
      });
      maybeCollectGarbage();
      return ALLOWED;
    }

    if (existing.count >= rule.limit) {
      const msLeft = existing.windowStart.getTime() + rule.windowMs - now.getTime();
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(msLeft / 1000)) };
    }

    await prisma.rateLimitCounter.update({ where: { key }, data: { count: { increment: 1 } } });
    return ALLOWED;
  } catch (error) {
    logLimiterFailure("consumeRateLimit", key, error);
    return ALLOWED;
  }
}

// Failing open is the right call (a database hiccup must not lock everyone
// out of signing in), but a silently broken limiter looks exactly like a
// working one — which is how a stale Prisma client let every request through
// during development. Always leave a trace.
function logLimiterFailure(fn: string, key: string, error: unknown): void {
  console.error(`[rateLimit] ${fn} a échoué pour "${key}" — requête laissée passer.`, error);
}

/** Counts a failed attempt (login). Same window mechanics as consumeRateLimit. */
export async function recordFailure(key: string, rule: RateLimitRule): Promise<void> {
  await consumeRateLimit(key, rule);
}

/** Clears the counter after a success, so normal use never accumulates. */
export async function resetRateLimit(key: string): Promise<void> {
  await prisma.rateLimitCounter.deleteMany({ where: { key } }).catch(() => {});
}

/**
 * The caller's IP, for keying limits on endpoints with no account to key on.
 *
 * `x-forwarded-for` is spoofable in general, but on Vercel the platform sets
 * it and strips any client-supplied value, so the leftmost entry is the real
 * peer. Falls back to a constant, which degrades to a single shared bucket
 * rather than to no limit at all.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return headers.get("x-real-ip")?.trim() || "unknown";
}

/** Standard 429 with Retry-After, so a client can back off correctly. */
export function tooManyRequests(retryAfterSeconds: number, message: string) {
  return Response.json(
    { error: message },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}

// Rows are reused per key, so the table only grows with *distinct* callers
// (a script cycling random emails would still add one row each). Sweeping
// long-closed windows on ~1% of calls keeps it bounded without needing its
// own cron entry. Fire-and-forget: never delay or fail the request.
function maybeCollectGarbage(): void {
  if (Math.random() >= GC_PROBABILITY) return;
  prisma.rateLimitCounter
    .deleteMany({ where: { windowStart: { lt: new Date(Date.now() - GC_AGE_MS) } } })
    .catch(() => {});
}
