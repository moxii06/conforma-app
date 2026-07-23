import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, canWriteRgpd } from "@/lib/tenant";

const schema = z.object({
  status: z.enum(["open", "in_progress", "closed"]).optional(),
  // null clears the assignment back to "Non assigné".
  assignedToUserId: z.string().nullable().optional(),
});

// Client feedback: a rights request just sat there with no owner and no way
// to track progress beyond open/closed — this adds an assignee and a
// three-step status, same shape as EmailMessage's assignment field.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (!canWriteRgpd(session.role)) {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const existing = await prisma.rightsRequest.findFirst({ where: { id: params.id, organizationId: session.organizationId } });
  if (!existing) return NextResponse.json({ error: "Demande introuvable." }, { status: 404 });

  let assignedToName: string | null | undefined = undefined;
  if (parsed.data.assignedToUserId !== undefined) {
    if (parsed.data.assignedToUserId === null) {
      assignedToName = null;
    } else {
      const user = await prisma.user.findFirst({ where: { id: parsed.data.assignedToUserId, organizationId: session.organizationId } });
      if (!user) return NextResponse.json({ error: "Membre introuvable." }, { status: 404 });
      assignedToName = user.name || user.email;
    }
  }

  const updated = await prisma.rightsRequest.update({
    where: { id: existing.id },
    data: {
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      ...(parsed.data.assignedToUserId !== undefined ? { assignedToUserId: parsed.data.assignedToUserId, assignedToName } : {}),
    },
  });

  return NextResponse.json(updated);
}
