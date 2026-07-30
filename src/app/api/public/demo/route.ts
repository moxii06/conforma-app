import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit, clientIp, tooManyRequests, RATE_LIMITS } from "@/lib/rateLimit";

// Public, non authentifié (préfixe api/public exclu par middleware.ts).
// Enregistre une demande de démonstration entrante (prospect de Jalon, pas
// d'un OF client). Stockage structuré dans DemoRequest, consultable via
// Prisma Studio en attendant une vue admin. Aucun email envoyé ici pour
// l'instant — une notification à l'équipe sera branchée quand Brevo sera
// configuré.
const schema = z.object({
  firstName: z.string().min(1, "Prénom requis."),
  lastName: z.string().min(1, "Nom requis."),
  email: z.string().email("Adresse email invalide."),
  organizationName: z.string().min(1, "Nom de l'organisme requis."),
  phone: z.string().optional(),
  orgSize: z.string().optional(),
  currentTool: z.string().optional(),
  timeline: z.string().optional(),
  message: z.string().optional(),
  source: z.string().optional(),
});

export async function POST(request: Request) {
  // Unauthenticated endpoint: keyed on IP, the only stable identifier here.
  const gate = await consumeRateLimit(`demo:${clientIp(request.headers)}`, RATE_LIMITS.publicForm);
  if (!gate.allowed) return tooManyRequests(gate.retryAfterSeconds, "Trop de demandes. Réessayez dans une heure.");

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Requête invalide.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  const d = parsed.data;

  await prisma.demoRequest.create({
    data: {
      firstName: d.firstName,
      lastName: d.lastName,
      email: d.email.toLowerCase().trim(),
      organizationName: d.organizationName,
      phone: d.phone || null,
      orgSize: d.orgSize || null,
      currentTool: d.currentTool || null,
      timeline: d.timeline || null,
      message: d.message || null,
      source: d.source || null,
    },
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
