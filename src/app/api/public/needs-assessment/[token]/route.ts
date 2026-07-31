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

  // Coche l'étape « Recueil des besoins » du Parcours.
  //
  // Quand la demande vise un dossier précis (envoi depuis la fiche dossier
  // ou depuis le tableau de bord), on ne coche que celui-là. Sinon — le
  // recueil parti avant toute inscription — on garde l'ancien comportement,
  // qui coche tous les dossiers du contact : le prospect n'a répondu qu'une
  // fois, et lui redemander la même chose à chaque inscription serait pire
  // qu'une case cochée un peu large.
  await prisma.dossier.updateMany({
    where: req.dossierId
      ? { id: req.dossierId, needsAssessmentDone: false }
      : { contactId: req.contactId, needsAssessmentDone: false },
    data: { needsAssessmentDone: true },
  });

  // Indicator 4 (the pilot's real 2022 NC majeure): a declared handicap /
  // adaptation need at entry becomes a CONFIDENTIAL AccommodationRequest —
  // details never land in responseText, which any dossier-level staff can
  // read; AccommodationRequest is restricted to canAccessAccommodations()
  // (admins + référent handicap).
  //
  // Rattaché au dossier visé par la demande quand il y en a un. À défaut
  // seulement, au plus récent du contact — c'est une approximation, et pour
  // un apprenant inscrit à deux formations elle pouvait déposer une donnée
  // de santé sur le mauvais dossier, donc devant la mauvaise équipe.
  // Dans le cas marginal où le contact n'a encore aucun dossier, les
  // détails n'ont nulle part de confidentiel où vivre : seule une ligne
  // neutre est ajoutée pour que quelqu'un rappelle la personne.
  if (parsed.data.adaptationNeeded) {
    const latestDossier = req.dossierId
      ? await prisma.dossier.findUnique({ where: { id: req.dossierId } })
      : await prisma.dossier.findFirst({
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
