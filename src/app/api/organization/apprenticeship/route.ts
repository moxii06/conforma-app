import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

// Le périmètre d'activité de l'organisme : réalise-t-elle des actions de
// formation par apprentissage ? Piloté depuis /qualiopi plutôt que depuis un
// écran de réglages, parce que c'est là que la réponse change quelque chose
// de visible — le score de conformité et la checklist de préparation d'audit.
const schema = z.object({ deliversApprenticeship: z.boolean() });

export async function PATCH(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "qualiopi") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  await prisma.organization.update({
    where: { id: session.organizationId },
    data: { deliversApprenticeship: parsed.data.deliversApprenticeship },
  });

  return NextResponse.json({ ok: true });
}
