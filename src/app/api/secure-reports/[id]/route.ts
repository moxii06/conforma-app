import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, canAccessSecureReports } from "@/lib/tenant";

const schema = z.object({
  status: z.enum(["received", "under_review", "escalated", "closed"]).optional(),
  escalationNotes: z.string().optional(),
  assignedToUserId: z.string().nullable().optional(),
  assigneeComment: z.string().nullable().optional(),
  assigneeDeadline: z.string().nullable().optional(),
  archived: z.boolean().optional(),
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
  const data = parsed.data;

  let assignee: { name: string } | null = null;
  if (data.assignedToUserId) {
    assignee = await prisma.user.findFirst({ where: { id: data.assignedToUserId, organizationId: session.organizationId }, select: { name: true } });
    if (!assignee) return NextResponse.json({ error: "Membre introuvable." }, { status: 404 });
  }

  const updated = await prisma.secureReport.update({
    where: { id: report.id },
    data: {
      ...(data.status !== undefined
        ? { status: data.status, escalatedAt: data.status === "escalated" ? new Date() : report.escalatedAt }
        : {}),
      ...(data.escalationNotes !== undefined ? { escalationNotes: data.escalationNotes } : {}),
      ...(data.assignedToUserId !== undefined ? { assignedToUserId: data.assignedToUserId, assignedToName: assignee?.name ?? null } : {}),
      ...(data.assigneeComment !== undefined ? { assigneeComment: data.assigneeComment } : {}),
      ...(data.assigneeDeadline !== undefined ? { assigneeDeadline: data.assigneeDeadline ? new Date(data.assigneeDeadline) : null } : {}),
      ...(data.archived !== undefined ? { archivedAt: data.archived ? new Date() : null } : {}),
    },
  });

  return NextResponse.json(updated);
}
