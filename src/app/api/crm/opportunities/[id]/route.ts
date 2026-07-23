import { NextResponse } from "next/server";
import { z } from "zod";
import { PipelineStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can, canManageOpportunity } from "@/lib/tenant";

const schema = z.object({ stage: z.nativeEnum(PipelineStage) });

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "crm") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Étape invalide." }, { status: 400 });

  const opportunity = await prisma.opportunity.findFirst({
    where: { id: params.id, organizationId: session.organizationId },
  });
  if (!opportunity) return NextResponse.json({ error: "Opportunité introuvable." }, { status: 404 });
  if (!canManageOpportunity(session.role, session.userId, opportunity)) {
    return NextResponse.json({ error: "Cette opportunité appartient à un autre commercial." }, { status: 403 });
  }

  const updated = await prisma.opportunity.update({
    where: { id: opportunity.id },
    data: { stage: parsed.data.stage },
  });

  // Client feedback: reaching PAID means the deal is closed out — archive
  // the contact so they drop out of the default CRM view instead of
  // lingering as an apparently-still-active prospect.
  if (parsed.data.stage === PipelineStage.PAID) {
    await prisma.contact.updateMany({
      where: { id: opportunity.contactId, archivedAt: null },
      data: { archivedAt: new Date() },
    });
  }

  return NextResponse.json(updated);
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "crm") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const opportunity = await prisma.opportunity.findFirst({
    where: { id: params.id, organizationId: session.organizationId },
  });
  if (!opportunity) return NextResponse.json({ error: "Opportunité introuvable." }, { status: 404 });
  if (!canManageOpportunity(session.role, session.userId, opportunity)) {
    return NextResponse.json({ error: "Cette opportunité appartient à un autre commercial." }, { status: 403 });
  }

  await prisma.$transaction([
    prisma.needsAssessmentRequest.deleteMany({ where: { opportunityId: opportunity.id } }),
    prisma.opportunity.delete({ where: { id: opportunity.id } }),
  ]);

  return NextResponse.json({ ok: true });
}
