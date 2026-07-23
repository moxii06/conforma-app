import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

const schema = z.object({
  status: z.enum(["identified", "decided", "exploited"]),
  decision: z.string().optional(),
  actionTaken: z.string().optional(),
  evidenceNote: z.string().optional(),
});

// Only "exploited" gets an exploitedAt timestamp — that field is what
// distinguishes a real "we acted on this" trail from a status label that
// could just be typed in without anything actually changing.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "qualiopi") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const item = await prisma.regulatoryWatch.findFirst({ where: { id: params.id, organizationId: session.organizationId } });
  if (!item) return NextResponse.json({ error: "Élément introuvable." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const updated = await prisma.regulatoryWatch.update({
    where: { id: item.id },
    data: {
      status: parsed.data.status,
      decision: parsed.data.decision,
      actionTaken: parsed.data.actionTaken,
      evidenceNote: parsed.data.evidenceNote,
      exploitedAt: parsed.data.status === "exploited" ? item.exploitedAt ?? new Date() : item.exploitedAt,
    },
  });

  return NextResponse.json(updated);
}
