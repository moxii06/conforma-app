import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

const schema = z.object({ archived: z.boolean() });

// Manual counterpart to the auto-archive-on-PAID in
// /api/crm/opportunities/[id]/route.ts — client feedback: staff should be
// able to archive (or bring back) a contact themselves, not only have it
// happen automatically once a deal closes.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "crm") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const contact = await prisma.contact.findFirst({ where: { id: params.id, organizationId: session.organizationId } });
  if (!contact) return NextResponse.json({ error: "Contact introuvable." }, { status: 404 });

  const updated = await prisma.contact.update({
    where: { id: contact.id },
    data: { archivedAt: parsed.data.archived ? new Date() : null },
  });

  return NextResponse.json(updated);
}
