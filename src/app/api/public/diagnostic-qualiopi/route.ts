import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit, clientIp, tooManyRequests, RATE_LIMITS } from "@/lib/rateLimit";

// Public, non authentifié (préfixe api/public exclu par middleware.ts).
// Capture du lead généré par l'auto-diagnostic Qualiopi. Réutilise le stockage
// NewsletterSubscriber (email unique) plutôt que d'ajouter un modèle/migration :
// la segmentation par source se fera au moment de la synchro vers Brevo. Aucun
// email n'est envoyé ici — le bilan détaillé s'affiche directement à l'écran.
const schema = z.object({
  email: z.string().email("Adresse email invalide."),
  // Score global (0-100), informatif — journalisé côté client uniquement pour
  // l'instant (pas de champ dédié en base). Accepté mais non requis.
  score: z.number().min(0).max(100).optional(),
});

export async function POST(request: Request) {
  // Unauthenticated endpoint: keyed on IP, the only stable identifier here.
  const gate = await consumeRateLimit(`diagnostic:${clientIp(request.headers)}`, RATE_LIMITS.publicForm);
  if (!gate.allowed) return tooManyRequests(gate.retryAfterSeconds, "Trop de demandes. Réessayez dans une heure.");

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Requête invalide.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  await prisma.newsletterSubscriber.upsert({
    where: { email: parsed.data.email },
    update: {},
    create: { email: parsed.data.email },
  });

  return NextResponse.json({ ok: true });
}
