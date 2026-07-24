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

  const quote = await prisma.quote.findFirst({ where: { id: params.id, organizationId: session.organizationId } });
  if (!quote) return NextResponse.json({ error: "Devis introuvable." }, { status: 404 });

  const updated = await prisma.quote.update({ where: { id: quote.id }, data: { status: parsed.data.status } });

  // Sending or signing a quote are real pipeline milestones — advance the
  // matching CRM opportunity automatically so it reflects it without
  // someone having to remember to also click the stage dropdown over there
  // (client feedback: signing a quote had no effect on the CRM at all).
  if (parsed.data.status === "SENT") {
    await advanceOpportunityStage(session.organizationId, quote.contactId, PipelineStage.PROSPECT, PipelineStage.QUOTE_SENT);
  } else if (parsed.data.status === "SIGNED") {
    await advanceOpportunityStage(session.organizationId, quote.contactId, PipelineStage.QUOTE_SENT, PipelineStage.CONTRACT_SIGNED);
  }

  return NextResponse.json(updated);
}
