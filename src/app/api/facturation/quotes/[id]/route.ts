import { NextResponse } from "next/server";
import { z } from "zod";
import { DocStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

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

  // Sending a quote is a real pipeline milestone — advance the contact's
  // still-PROSPECT opportunity to QUOTE_SENT so the CRM reflects it without
  // someone having to remember to also click the stage dropdown over there.
  // Only touches an opportunity still at PROSPECT (the stage right before
  // this one) — never regresses or overwrites one that's already further
  // along or belongs to an unrelated deal for the same contact.
  if (parsed.data.status === "SENT") {
    const opportunity = await prisma.opportunity.findFirst({
      where: { organizationId: session.organizationId, contactId: quote.contactId, stage: "PROSPECT" },
      orderBy: { createdAt: "desc" },
    });
    if (opportunity) {
      await prisma.opportunity.update({ where: { id: opportunity.id }, data: { stage: "QUOTE_SENT" } });
    }
  }

  return NextResponse.json(updated);
}
