import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decodeHtmlEntities } from "@/lib/mailboxMatching";

// TEMPORARY — one-shot endpoint to decode leftover HTML entities
// (&nbsp;, &#39;, &eacute;...) in EmailMessage.body/snippet for messages
// synced before the text/plain-vs-text/html precedence fix (see
// gmailSync.ts/imapSync.ts's extractBody). Safe/lossless — unlike the
// CSS-junk cleanup, decoding an entity never destroys information. Guarded
// by a secret header, same pattern as cleanup-email-css before it — remove
// this route (and the DECODE_EMAIL_ENTITIES_SECRET env var) once confirmed
// applied.
export async function POST(request: Request) {
  const expected = process.env.DECODE_EMAIL_ENTITIES_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "DECODE_EMAIL_ENTITIES_SECRET non configuré." }, { status: 503 });
  }
  const provided = request.headers.get("x-cleanup-secret");
  if (provided !== expected) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const candidates = await prisma.emailMessage.findMany({
    where: { body: { contains: "&" } },
    select: { id: true, body: true },
  });

  let changed = 0;
  const sample: { id: string; before: string; after: string }[] = [];
  for (const row of candidates) {
    const original = row.body ?? "";
    const decoded = decodeHtmlEntities(original).replace(/\s+/g, " ").trim();
    if (decoded === original) continue;
    await prisma.emailMessage.update({
      where: { id: row.id },
      data: { body: decoded, snippet: decoded.slice(0, 140) },
    });
    changed++;
    if (sample.length < 5) {
      sample.push({ id: row.id, before: original.slice(0, 200), after: decoded.slice(0, 200) });
    }
  }

  return NextResponse.json({ ok: true, scanned: candidates.length, changed, sample });
}
