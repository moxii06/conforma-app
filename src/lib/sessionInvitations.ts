import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import type { Session, Dossier } from "@prisma/client";

// Shared by the Planning invitation composer (/api/planning/sessions/[id]/invitations)
// and the dossier record's quick "Envoyer la convocation" button
// (/api/dossiers/[id]/outreach) — one place for the meeting-link generation
// and SessionInvitation bookkeeping so the two entry points can't drift.
export function buildMeetingLink(sessionId: string) {
  const suffix = randomBytes(4).toString("hex");
  return `https://meet.jit.si/conforma-${sessionId.slice(-8)}-${suffix}`;
}

export async function createSessionInvitation({
  session,
  dossier,
  sentByUserId,
  sentByName,
  attachDocumentIds = [],
  newDocuments = [],
}: {
  session: Session;
  dossier: Dossier;
  sentByUserId: string;
  sentByName: string;
  attachDocumentIds?: string[];
  newDocuments?: { title: string; url: string }[];
}) {
  const isRemote = session.format === "REMOTE" || session.format === "HYBRID";
  const isInPerson = session.format === "IN_PERSON" || session.format === "HYBRID";

  if (!isInPerson && (attachDocumentIds.length > 0 || newDocuments.length > 0)) {
    throw new Error("Les pièces jointes ne sont disponibles que pour les sessions en présentiel ou mixtes.");
  }

  let meetingLink = session.meetingLink;
  if (isRemote && !meetingLink) {
    meetingLink = buildMeetingLink(session.id);
    await prisma.session.update({ where: { id: session.id }, data: { meetingLink } });
  }

  if (attachDocumentIds.length > 0) {
    const owned = await prisma.document.count({
      where: { id: { in: attachDocumentIds }, organizationId: session.organizationId, dossierId: dossier.id },
    });
    if (owned !== attachDocumentIds.length) {
      throw new Error("Un des documents sélectionnés n'appartient pas à ce dossier.");
    }
  }

  const createdDocuments = await Promise.all(
    newDocuments.map((doc) =>
      prisma.document.create({
        data: { organizationId: session.organizationId, dossierId: dossier.id, title: doc.title, fileUrl: doc.url },
      })
    )
  );

  const allDocumentIds = [...attachDocumentIds, ...createdDocuments.map((d) => d.id)];

  const invitation = await prisma.sessionInvitation.create({
    data: {
      organizationId: session.organizationId,
      sessionId: session.id,
      dossierId: dossier.id,
      sentByUserId,
      sentByName,
      documents: { create: allDocumentIds.map((documentId) => ({ documentId })) },
    },
    include: { documents: { include: { document: true } } },
  });

  await prisma.dossier.update({ where: { id: dossier.id }, data: { convocationSent: true } });

  return { invitation, meetingLink };
}
