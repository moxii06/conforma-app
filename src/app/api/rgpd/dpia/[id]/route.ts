import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, canWriteRgpd } from "@/lib/tenant";

const schema = z.object({
  status: z.enum(["required", "in_progress", "validated", "not_required"]).optional(),
  riskLevel: z.enum(["low", "moderate", "high"]).optional(),
});

// Une DPIA avance par étapes (Requise → En cours → Validée, ou Non requise
// si l'analyse conclut qu'elle ne s'impose pas) — même logique de statut
// évolutif que RightsRequest/DataBreach, pas un enregistrement figé après
// création.
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (!canWriteRgpd(session.role)) {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const existing = await prisma.dPIARecord.findFirst({ where: { id: params.id, organizationId: session.organizationId } });
  if (!existing) return NextResponse.json({ error: "DPIA introuvable." }, { status: 404 });

  const updated = await prisma.dPIARecord.update({
    where: { id: existing.id },
    data: {
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      ...(parsed.data.riskLevel ? { riskLevel: parsed.data.riskLevel } : {}),
    },
  });

  return NextResponse.json(updated);
}
