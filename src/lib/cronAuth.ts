import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

/**
 * The one gate on scheduled routes.
 *
 * These endpoints sit outside the NextAuth middleware — they have to, since
 * Vercel's scheduler carries no session and was previously being bounced to
 * /login, which meant the crons had never actually run. Being outside the
 * middleware makes CRON_SECRET the only thing standing between the open
 * internet and routes that send emails and write to the database, so a
 * missing secret must FAIL rather than fall through.
 *
 * Returns a response to send back, or null when the caller may proceed.
 */
export function assertCronRequest(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    // Refusing loudly in production is the whole point: the previous version
    // let the route run unauthenticated whenever the variable was absent,
    // which is exactly the case where nobody notices.
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "CRON_SECRET n'est pas configuré côté serveur — tâche planifiée refusée." },
        { status: 503 },
      );
    }
    // Local development: callable by hand so the job can be exercised.
    return null;
  }

  const provided = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  // Length check first — timingSafeEqual throws on mismatched lengths — then
  // a constant-time compare so the secret can't be recovered byte by byte.
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  return null;
}
