import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, canAccessSecureReports } from "@/lib/tenant";
import { resoudreAffectation } from "@/lib/supportAssignment";
import { SUPPORT_URGENCIES } from "@/lib/supportRequests";

const schema = z.object({
  status: z.enum(["received", "under_review", "escalated", "closed"]).optional(),
  escalationNotes: z.string().optional(),
  assignedToUserId: z.string().nullable().optional(),
  assigneeComment: z.string().nullable().optional(),
  assigneeDeadline: z.string().nullable().optional(),
  urgency: z.enum(SUPPORT_URGENCIES).optional(),
  // Sur un signalement, resoudreAffectation refuse tout destinataire non
  // habilité à le lire : prévenir quelqu'un d'un dossier qu'il ne peut pas
  // ouvrir revient à lui apprendre qu'il existe.
  notifyUserIds: z.array(z.string()).max(30).optional(),
  archived: z.boolean().optional(),
});

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (!canAccessSecureReports(session.roles)) {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const report = await prisma.secureReport.findFirst({ where: { id: params.id, organizationId: session.organizationId } });
  if (!report) return NextResponse.json({ error: "Signalement introuvable." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });
  const data = parsed.data;

  const affectation = await resoudreAffectation({
    organizationId: session.organizationId,
    kind: "secure-reports",
    assignedToUserId: data.assignedToUserId,
    responsableEffectifId: data.assignedToUserId !== undefined ? data.assignedToUserId : report.assignedToUserId,
    notifyUserIds: data.notifyUserIds,
  });
  if (!affectation.ok) return NextResponse.json({ error: affectation.error }, { status: 400 });

  const updated = await prisma.secureReport.update({
    where: { id: report.id },
    data: {
      ...(data.status !== undefined
        ? { status: data.status, escalatedAt: data.status === "escalated" ? new Date() : report.escalatedAt }
        : {}),
      ...(data.escalationNotes !== undefined ? { escalationNotes: data.escalationNotes } : {}),
      ...(data.assignedToUserId !== undefined
        ? { assignedToUserId: data.assignedToUserId, assignedToName: affectation.assignedToName }
        : {}),
      ...(data.assigneeComment !== undefined ? { assigneeComment: data.assigneeComment } : {}),
      ...(data.assigneeDeadline !== undefined ? { assigneeDeadline: data.assigneeDeadline ? new Date(data.assigneeDeadline) : null } : {}),
      ...(data.urgency !== undefined ? { urgency: data.urgency } : {}),
      ...(data.notifyUserIds !== undefined ? { notifyUserIds: affectation.notifyUserIds } : {}),
      ...(data.archived !== undefined ? { archivedAt: data.archived ? new Date() : null } : {}),
    },
  });

  return NextResponse.json(updated);
}
