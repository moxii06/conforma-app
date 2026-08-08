import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

const schema = z.object({
  // Chaîne vide = revenir à la numérotation automatique de Jalon.
  prefix: z.string().max(20),
  nextNumber: z.number().int().min(1).max(999_999),
});

export async function PATCH(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  // Même exigence que les autres réglages d'organisme : la numérotation
  // engage la comptabilité, ce n'est pas un réglage d'écran.
  if (can(session.roles, "invoicing") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Réglage invalide." }, { status: 400 });

  const prefix = parsed.data.prefix.trim();
  const updated = await prisma.organization.update({
    where: { id: session.organizationId },
    data: prefix
      ? { invoicePrefix: prefix, invoiceNextNumber: parsed.data.nextNumber }
      : { invoicePrefix: null, invoiceNextNumber: null },
    select: { invoicePrefix: true, invoiceNextNumber: true },
  });

  return NextResponse.json(updated);
}
