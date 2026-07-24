import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

const schema = z.object({ kind: z.string().min(1), id: z.string().min(1) });

export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "dashboard") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  await prisma.dashboardTaskDismissal.upsert({
    where: {
      organizationId_kind_entityId: {
        organizationId: session.organizationId,
        kind: parsed.data.kind,
        entityId: parsed.data.id,
      },
    },
    update: {},
    create: {
      organizationId: session.organizationId,
      kind: parsed.data.kind,
      entityId: parsed.data.id,
      dismissedByUserId: session.userId,
    },
  });

  return NextResponse.json({ ok: true });
}
