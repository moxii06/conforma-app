import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  responseText: z.string().min(1).max(10000),
  adaptationNeeded: z.boolean().optional(),
  adaptationDetails: z.string().max(2000).optional(),
});

// Deliberately unauthenticated — the token itself is the capability
// (random 40-hex-char, unguessable). No organizationId check is possible
// or needed here since the prospect has no Jalon account at all.
export async function POST(request: Request, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
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

  // Indicator 4 (the pilot's real 2022 NC majeure): a declared handicap /
  // adaptation need at entry becomes a CONFIDENTIAL AccommodationRequest —
  // details never land in responseText, which any dossier-level staff can
  // read; AccommodationRequest is restricted to canAccessAccommodations()
  // (admins + référent handicap). Attached to the contact's most recent
  // dossier — the recueil is sent per-dossier in practice. In the marginal
  // no-dossier-yet case the details would have nowhere confidential to
  // live, so only a neutral flag line is appended for staff to follow up.
  if (parsed.data.adaptationNeeded) {
    const latestDossier = await prisma.dossier.findFirst({
      where: { contactId: req.contactId, organizationId: req.organizationId },
      orderBy: { createdAt: "desc" },
    });
    if (latestDossier) {
      await prisma.accommodationRequest.create({
        data: {
          organizationId: req.organizationId,
          dossierId: latestDossier.id,
          description: "Besoin d'adaptation signalé via le recueil des besoins.",
          requestedAccommodations: parsed.data.adaptationDetails || "À préciser avec le bénéficiaire (aucun détail fourni).",
          createdByName: "Recueil des besoins (formulaire public)",
        },
      });
    } else {
      await prisma.needsAssessmentRequest.update({
        where: { id: req.id },
        data: {
          responseText: `${parsed.data.responseText}\n\n[Le bénéficiaire a signalé un besoin d'adaptation ou une situation de handicap — le recontacter via le référent handicap.]`,
        },
      });
    }
  }

  return NextResponse.json({ ok: true });
}
