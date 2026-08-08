import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, canWriteRgpd } from "@/lib/tenant";

// Mêmes champs qu'à la création (voir ../route.ts) : une ligne installée
// depuis le registre type est un point de départ générique "à adapter à
// votre organisme avant tout usage réel" (rgpdStarterRegister.ts), pas un
// modèle figé. Tous facultatifs ici puisque seul un sous-ensemble change à
// la fois (typiquement le statut, pour lever un "à revoir").
const schema = z.object({
  name: z.string().min(1).optional(),
  purpose: z.string().min(1).optional(),
  legalBasis: z.string().min(1).optional(),
  dataSubjects: z.string().min(1).optional(),
  dataCategories: z.string().min(1).optional(),
  recipients: z.string().optional(),
  transferOutsideEu: z.boolean().optional(),
  transferDetails: z.string().optional(),
  securityMeasures: z.string().optional(),
  retentionPeriod: z.string().min(1).optional(),
  riskFlag: z.enum(["ok", "to_review"]).optional(),
  reviewNote: z.string().nullable().optional(),
});

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (!canWriteRgpd(session.roles)) {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const existing = await prisma.processingActivity.findFirst({
    where: { id: params.id, organizationId: session.organizationId },
  });
  if (!existing) return NextResponse.json({ error: "Traitement introuvable." }, { status: 404 });

  const data = parsed.data;
  // Repasser à "à jour" lève la mise en garde qui accompagnait le "à
  // revoir" — une note qui ne s'applique plus n'a pas à rester affichée en
  // rouge, sauf si l'appelant en a explicitement fourni une nouvelle.
  const clearReviewNote = data.riskFlag === "ok" && data.reviewNote === undefined;

  const updated = await prisma.processingActivity.update({
    where: { id: existing.id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.purpose !== undefined ? { purpose: data.purpose } : {}),
      ...(data.legalBasis !== undefined ? { legalBasis: data.legalBasis } : {}),
      ...(data.dataSubjects !== undefined ? { dataSubjects: data.dataSubjects } : {}),
      ...(data.dataCategories !== undefined ? { dataCategories: data.dataCategories } : {}),
      ...(data.recipients !== undefined ? { recipients: data.recipients } : {}),
      ...(data.transferOutsideEu !== undefined ? { transferOutsideEu: data.transferOutsideEu } : {}),
      ...(data.transferDetails !== undefined ? { transferDetails: data.transferDetails } : {}),
      ...(data.securityMeasures !== undefined ? { securityMeasures: data.securityMeasures } : {}),
      ...(data.retentionPeriod !== undefined ? { retentionPeriod: data.retentionPeriod } : {}),
      ...(data.riskFlag !== undefined ? { riskFlag: data.riskFlag } : {}),
      ...(data.reviewNote !== undefined ? { reviewNote: data.reviewNote } : clearReviewNote ? { reviewNote: null } : {}),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (!canWriteRgpd(session.roles)) {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const existing = await prisma.processingActivity.findFirst({
    where: { id: params.id, organizationId: session.organizationId },
  });
  if (!existing) return NextResponse.json({ error: "Traitement introuvable." }, { status: 404 });

  // Une DPIA documente un risque pour CE traitement précis : le supprimer
  // sous elle romprait la preuve de ce qui a été analysé. Même logique que
  // les financeurs déjà utilisés (src/app/api/funders/[id]/route.ts) — on
  // bloque plutôt que de réécrire silencieusement l'historique.
  const dpiaCount = await prisma.dPIARecord.count({ where: { processingActivityId: existing.id } });
  if (dpiaCount > 0) {
    return NextResponse.json(
      {
        error: `Ce traitement est lié à ${dpiaCount} analyse${dpiaCount > 1 ? "s" : ""} d'impact (DPIA) — il ne peut pas être supprimé tant qu'elles existent.`,
      },
      { status: 409 },
    );
  }

  await prisma.processingActivity.delete({ where: { id: existing.id } });
  return NextResponse.json({ ok: true });
}
