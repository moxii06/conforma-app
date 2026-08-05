import { NextResponse } from "next/server";
import { z } from "zod";
import { DocStatus } from "@prisma/client";
import { getSessionContext, can } from "@/lib/tenant";
import { appliquerStatutFacture } from "@/lib/invoiceStatus";

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

  // La transition vit dans lib/invoiceStatus.ts : le changement en masse
  // fait le même geste, et deux copies auraient fini par diverger.
  const ok = await appliquerStatutFacture(session.organizationId, params.id, parsed.data.status);
  if (!ok) return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });

  return NextResponse.json({ ok: true, status: parsed.data.status });
}
