import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit, clientIp, tooManyRequests, RATE_LIMITS } from "@/lib/rateLimit";

const schema = z.object({ email: z.string().email() });

// Public, unauthenticated endpoint — visitor is not a Jalon account.
// Collection only: no automated Brevo campaign is triggered from this
// route, per the scope of this task (a real send pipeline is a separate
// decision the user hasn't asked for yet).
export async function POST(request: Request) {
  // Unauthenticated endpoint: keyed on IP, the only stable identifier here.
  const gate = await consumeRateLimit(`newsletter:${clientIp(request.headers)}`, RATE_LIMITS.publicForm);
  if (!gate.allowed) return tooManyRequests(gate.retryAfterSeconds, "Trop de demandes. Réessayez dans une heure.");

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Adresse email invalide." }, { status: 400 });
  }

  await prisma.newsletterSubscriber.upsert({
    where: { email: parsed.data.email },
    update: {},
    create: { email: parsed.data.email },
  });

  return NextResponse.json({ ok: true });
}
