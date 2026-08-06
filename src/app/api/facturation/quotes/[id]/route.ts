import { NextResponse } from "next/server";
import { z } from "zod";
import { DocStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { marquerDevisEnvoye, marquerDevisSigne } from "@/lib/quoteStatus";

const schema = z.object({ status: z.nativeEnum(DocStatus) });

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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

  // Sending or signing a quote are real pipeline milestones — advance the
  // matching CRM opportunity automatically so it reflects it without
  // someone having to remember to also click the stage dropdown over there
  // (client feedback: signing a quote had no effect on the CRM at all).
  //
  // Ces deux jalons vivent dans lib/quoteStatus.ts parce que l'envoi d'un
  // devis se déclenche aussi depuis la fiche prospect, en pièce jointe :
  // deux écrans, une seule règle.
  if (parsed.data.status === "SENT") {
    await marquerDevisEnvoye(session.organizationId, quote);
  } else if (parsed.data.status === "SIGNED") {
    await marquerDevisSigne(session.organizationId, quote);
  } else {
    await prisma.quote.update({ where: { id: quote.id }, data: { status: parsed.data.status } });
  }

  const updated = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });
  return NextResponse.json(updated);
}
