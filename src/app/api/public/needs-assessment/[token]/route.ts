import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const schema = z.object({ responseText: z.string().min(1).max(10000) });

// Deliberately unauthenticated — the token itself is the capability
// (random 40-hex-char, unguessable). No organizationId check is possible
// or needed here since the prospect has no Jalon account at all.
export async function POST(request: Request, { params }: { params: { token: string } }) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Réponse invalide." }, { status: 400 });

  const req = await prisma.needsAssessmentRequest.findUnique({ where: { token: params.token } });
  if (!req) return NextResponse.json({ error: "Lien invalide." }, { status: 404 });
  if (req.status === "completed") {
    return NextResponse.json({ error: "Ce formulaire a déjà été complété." }, { status: 409 });
  }

  await prisma.needsAssessmentRequest.update({
    where: { id: req.id },
    data: { responseText: parsed.data.responseText, status: "completed", completedAt: new Date() },
  });

  // The request is tied to the Contact, not a specific Dossier (it's
  // typically sent before enrollment) — so completion flips the "Recueil
  // des besoins" Parcours step on every one of that contact's dossiers
  // that hasn't already been marked done, rather than requiring staff to
  // notice and toggle it by hand.
  await prisma.dossier.updateMany({
    where: { contactId: req.contactId, needsAssessmentDone: false },
    data: { needsAssessmentDone: true },
  });

  return NextResponse.json({ ok: true });
}
