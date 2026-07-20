import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, canManageSessionInvitations } from "@/lib/tenant";

const schema = z.object({
  dossierId: z.string().min(1),
  attachDocumentIds: z.array(z.string()).default([]),
  newDocuments: z.array(z.object({ title: z.string().min(1), url: z.string().url() })).default([]),
});

function buildMeetingLink(sessionId: string) {
  // Public Jitsi Meet room — no account or API key needed, works today.
  // A real deployment would swap this for whichever conferencing API the
  // client picks (spec doesn't mandate one); the room name just needs to
  // be hard to guess, which the random suffix takes care of.
  const suffix = randomBytes(4).toString("hex");
  return `https://meet.jit.si/conforma-${sessionId.slice(-8)}-${suffix}`;
}

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

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });
  const { dossierId, attachDocumentIds, newDocuments } = parsed.data;

  const dossier = await prisma.dossier.findFirst({
    where: { id: dossierId, organizationId: auth.organizationId, sessionId: session.id },
  });
  if (!dossier) return NextResponse.json({ error: "Dossier introuvable pour cette session." }, { status: 404 });

  const isRemote = session.format === "REMOTE" || session.format === "HYBRID";
  const isInPerson = session.format === "IN_PERSON" || session.format === "HYBRID";

  // Documents are only attachable to in-person (or hybrid) invitations —
  // matches the product decision that free/library attachments are a
  // venue-visit concern (maps, programme, badge...), not something a pure
  // remote invite needs. Enforced here too, not just hidden in the UI.
  if (!isInPerson && (attachDocumentIds.length > 0 || newDocuments.length > 0)) {
    return NextResponse.json(
      { error: "Les pièces jointes ne sont disponibles que pour les sessions en présentiel ou mixtes." },
      { status: 400 }
    );
  }

  let meetingLink = session.meetingLink;
  if (isRemote && !meetingLink) {
    meetingLink = buildMeetingLink(session.id);
    await prisma.session.update({ where: { id: session.id }, data: { meetingLink } });
  }

  if (attachDocumentIds.length > 0) {
    const owned = await prisma.document.count({
      where: { id: { in: attachDocumentIds }, organizationId: auth.organizationId, dossierId: dossier.id },
    });
    if (owned !== attachDocumentIds.length) {
      return NextResponse.json({ error: "Un des documents sélectionnés n'appartient pas à ce dossier." }, { status: 400 });
    }
  }

  const createdDocuments = await Promise.all(
    newDocuments.map((doc) =>
      prisma.document.create({
        data: {
          organizationId: auth.organizationId,
          dossierId: dossier.id,
          title: doc.title,
          fileUrl: doc.url,
        },
      })
    )
  );

  const allDocumentIds = [...attachDocumentIds, ...createdDocuments.map((d) => d.id)];

  const invitation = await prisma.sessionInvitation.create({
    data: {
      organizationId: auth.organizationId,
      sessionId: session.id,
      dossierId: dossier.id,
      sentByUserId: auth.userId,
      sentByName: auth.name || auth.email,
      documents: { create: allDocumentIds.map((documentId) => ({ documentId })) },
    },
    include: { documents: { include: { document: true } } },
  });

  await prisma.dossier.update({ where: { id: dossier.id }, data: { convocationSent: true } });

  return NextResponse.json({ invitation, meetingLink }, { status: 201 });
}
