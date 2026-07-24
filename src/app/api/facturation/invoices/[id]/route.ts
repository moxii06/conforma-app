import { NextResponse } from "next/server";
import { z } from "zod";
import { DocStatus, PipelineStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { advanceOpportunityStage } from "@/lib/pipeline";

const schema = z.object({ status: z.nativeEnum(DocStatus) });

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "invoicing") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Statut invalide." }, { status: 400 });

  const invoice = await prisma.invoice.findFirst({ where: { id: params.id, organizationId: session.organizationId } });
  if (!invoice) return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });

  const updated = await prisma.invoice.update({ where: { id: invoice.id }, data: { status: parsed.data.status } });

  // Same reasoning as the quotes route: sending or settling an invoice are
  // pipeline milestones the CRM should reflect automatically.
  if (parsed.data.status === "SENT") {
    await advanceOpportunityStage(session.organizationId, invoice.contactId, PipelineStage.TO_INVOICE, PipelineStage.INVOICED);
  } else if (parsed.data.status === "PAID") {
    await advanceOpportunityStage(session.organizationId, invoice.contactId, PipelineStage.INVOICED, PipelineStage.PAID);
  }

  return NextResponse.json(updated);
}
