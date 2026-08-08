import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { resoudreAffectation } from "@/lib/supportAssignment";
import { SUPPORT_URGENCIES } from "@/lib/supportRequests";

const schema = z.object({
  status: z.enum(["open", "investigating", "resolved"]).optional(),
  resolutionNotes: z.string().optional(),
  assignedToUserId: z.string().nullable().optional(),
  assigneeComment: z.string().nullable().optional(),
  assigneeDeadline: z.string().nullable().optional(),
  // « À quel point ça passe devant le reste », indépendant du statut et de
  // l'échéance — voir lib/supportRequests.ts.
  urgency: z.enum(SUPPORT_URGENCIES).optional(),
  // Destinataires SUPPLÉMENTAIRES. Plafonné : au-delà, ce n'est plus une
  // liste de personnes prévenues, c'est une diffusion générale.
  notifyUserIds: z.array(z.string()).max(30).optional(),
  archived: z.boolean().optional(),
});

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.roles, "dossiers") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const complaint = await prisma.complaint.findFirst({ where: { id: params.id, organizationId: session.organizationId } });
  if (!complaint) return NextResponse.json({ error: "Réclamation introuvable." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });
  const data = parsed.data;

  const affectation = await resoudreAffectation({
    organizationId: session.organizationId,
    kind: "complaints",
    assignedToUserId: data.assignedToUserId,
    // Celui qui portera la demande après cette requête : posé ici, ou déjà en
    // base quand la requête ne change que l'échéance ou l'urgence.
    responsableEffectifId: data.assignedToUserId !== undefined ? data.assignedToUserId : complaint.assignedToUserId,
    notifyUserIds: data.notifyUserIds,
  });
  if (!affectation.ok) return NextResponse.json({ error: affectation.error }, { status: 400 });

  const updated = await prisma.complaint.update({
    where: { id: complaint.id },
    data: {
      ...(data.status !== undefined ? { status: data.status, resolvedAt: data.status === "resolved" ? new Date() : null } : {}),
      ...(data.resolutionNotes !== undefined ? { resolutionNotes: data.resolutionNotes } : {}),
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
