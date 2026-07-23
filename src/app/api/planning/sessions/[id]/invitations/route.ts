import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, canManageSessionInvitations } from "@/lib/tenant";
import { createSessionInvitation } from "@/lib/sessionInvitations";

const schema = z.object({
  dossierId: z.string().min(1),
  attachDocumentIds: z.array(z.string()).default([]),
  newDocuments: z.array(z.object({ title: z.string().min(1), url: z.string().url() })).default([]),
  subject: z.string().min(1).optional(),
  body: z.string().min(1).optional(),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const session = await prisma.session.findFirst({
    where: { id: params.id, organizationId: auth.organizationId },
  });
  if (!session) return NextResponse.json({ error: "Session introuvable." }, { status: 404 });

  if (!canManageSessionInvitations(auth.role, auth.userId, session)) {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const requestBody = await request.json().catch(() => null);
  const parsed = schema.safeParse(requestBody);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });
  const { dossierId, attachDocumentIds, newDocuments, subject, body } = parsed.data;

  const dossier = await prisma.dossier.findFirst({
    where: { id: dossierId, organizationId: auth.organizationId, sessionId: session.id },
  });
  if (!dossier) return NextResponse.json({ error: "Dossier introuvable pour cette session." }, { status: 404 });

  try {
    const { invitation, meetingLink } = await createSessionInvitation({
      session,
      dossier,
      sentByUserId: auth.userId,
      sentByName: auth.name || auth.email,
      attachDocumentIds,
      newDocuments,
      subject,
      body,
    });
    return NextResponse.json({ invitation, meetingLink }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur inattendue." }, { status: 400 });
  }
}
