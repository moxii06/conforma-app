import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, canAccessSecureReports } from "@/lib/tenant";

const schema = z.object({
  status: z.enum(["received", "under_review", "escalated", "closed"]),
  escalationNotes: z.string().optional(),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (!canAccessSecureReports(session.role)) {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const report = await prisma.secureReport.findFirst({ where: { id: params.id, organizationId: session.organizationId } });
  if (!report) return NextResponse.json({ error: "Signalement introuvable." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const updated = await prisma.secureReport.update({
    where: { id: report.id },
    data: {
      status: parsed.data.status,
      escalationNotes: parsed.data.escalationNotes,
      escalatedAt: parsed.data.status === "escalated" ? new Date() : report.escalatedAt,
    },
  });

  return NextResponse.json(updated);
}
