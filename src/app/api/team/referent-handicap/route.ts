import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

const schema = z.object({ userId: z.string().nullable() });

export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "team") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  if (parsed.data.userId) {
    const member = await prisma.user.findFirst({ where: { id: parsed.data.userId, organizationId: session.organizationId } });
    if (!member) return NextResponse.json({ error: "Membre introuvable." }, { status: 404 });
  }

  const updated = await prisma.organization.update({
    where: { id: session.organizationId },
    data: { referentHandicapUserId: parsed.data.userId },
  });

  return NextResponse.json(updated);
}
