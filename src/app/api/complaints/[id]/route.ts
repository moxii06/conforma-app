import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

const schema = z.object({
  status: z.enum(["open", "investigating", "resolved"]),
  resolutionNotes: z.string().optional(),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "dossiers") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const complaint = await prisma.complaint.findFirst({ where: { id: params.id, organizationId: session.organizationId } });
  if (!complaint) return NextResponse.json({ error: "Réclamation introuvable." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const updated = await prisma.complaint.update({
    where: { id: complaint.id },
    data: {
      status: parsed.data.status,
      resolutionNotes: parsed.data.resolutionNotes,
      resolvedAt: parsed.data.status === "resolved" ? new Date() : null,
    },
  });

  return NextResponse.json(updated);
}
