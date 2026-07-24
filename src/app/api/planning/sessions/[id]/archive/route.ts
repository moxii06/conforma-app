import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

const schema = z.object({ archived: z.boolean() });

// Manual archive toggle — client feedback: past sessions used to just fall
// out of the "Liste" view once endsAt passed, with no dedicated place to
// browse them again. This is independent of SessionStatus (a cancelled
// session and a completed one can each be archived on their own timeline).
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "planning") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const existing = await prisma.session.findFirst({ where: { id: params.id, organizationId: session.organizationId } });
  if (!existing) return NextResponse.json({ error: "Session introuvable." }, { status: 404 });

  const updated = await prisma.session.update({
    where: { id: existing.id },
    data: { archivedAt: parsed.data.archived ? new Date() : null },
  });

  return NextResponse.json(updated);
}
