import { NextResponse } from "next/server";
import { z } from "zod";
import { DocStatus, PipelineStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { advanceOpportunityStage } from "@/lib/pipeline";
import { STAGES_BEFORE_COMPLETION } from "@/lib/pipelineStages";

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

  const invoice = await prisma.invoice.findFirst({ where: { id: params.id, organizationId: session.organizationId } });
  if (!invoice) return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });

  const updated = await prisma.invoice.update({ where: { id: invoice.id }, data: { status: parsed.data.status } });

  // Audit P1 : l'émission d'une facture ne déplace plus rien dans le CRM —
  // « Facturé » n'est plus une étape commerciale, l'état de la facture se
  // lit en Facturation. Seul l'encaissement complet clôt l'affaire.
  if (parsed.data.status === "PAID") {
    await advanceOpportunityStage(
      session.organizationId,
      invoice.contactId,
      STAGES_BEFORE_COMPLETION,
      PipelineStage.COMPLETED,
    );
  }

  return NextResponse.json(updated);
}
