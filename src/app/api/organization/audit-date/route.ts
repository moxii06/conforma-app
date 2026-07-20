import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

const schema = z.object({ nextAuditDate: z.string().min(1) });

export async function PATCH(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "qualiopi") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Date invalide." }, { status: 400 });

  const date = new Date(parsed.data.nextAuditDate);
  if (Number.isNaN(date.getTime())) return NextResponse.json({ error: "Date invalide." }, { status: 400 });

  await prisma.organization.update({
    where: { id: session.organizationId },
    data: { nextAuditDate: date },
  });

  return NextResponse.json({ ok: true });
}
