import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

const schema = z.object({ versionId: z.string().min(1) });

export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "qualiopi") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const version = await prisma.qualiopiReferentielVersion.findUnique({ where: { id: parsed.data.versionId } });
  if (!version) return NextResponse.json({ error: "Version introuvable." }, { status: 404 });

  await prisma.organization.update({
    where: { id: session.organizationId },
    data: { activeReferentielVersionId: version.id },
  });

  return NextResponse.json({ ok: true });
}
