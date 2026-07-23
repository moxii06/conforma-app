import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

const schema = z.object({ status: z.enum(["identifie", "en_cours", "maitrise", "clos"]) });

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "qualiopi") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const risk = await prisma.qualityRisk.findFirst({ where: { id: params.id, organizationId: session.organizationId } });
  if (!risk) return NextResponse.json({ error: "Risque introuvable." }, { status: 404 });

  const updated = await prisma.qualityRisk.update({ where: { id: risk.id }, data: { status: parsed.data.status } });
  return NextResponse.json(updated);
}
