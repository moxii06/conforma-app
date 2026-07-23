import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail } from "@/lib/brevo";
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
  subject,
  body,
}: {
  session: Session;
  dossier: Dossier;
  sentByUserId: string;
  sentByName: string;
  attachDocumentIds?: string[];
  newDocuments?: { title: string; url: string }[];
  // Custom subject/body from the Planning composer's manual or AI-drafted
  // text — falls back to the fixed template below when omitted (the
  // dossier record's one-click "Envoyer la convocation" button doesn't go
  // through the composer, so it always hits this default).
  subject?: string;
  body?: string;
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

  // Best-effort real email — fetched fresh here (rather than requiring
  // every caller to include contact/course in their own query) since this
  // is the one place both entry points (Planning composer, dossier's
  // "Envoyer la convocation") funnel through.
  const [contact, course, organization] = await Promise.all([
    prisma.contact.findUnique({ where: { id: dossier.contactId } }),
    prisma.course.findUnique({ where: { id: session.courseId } }),
    prisma.organization.findUniqueOrThrow({ where: { id: session.organizationId } }),
  ]);
  if (contact) {
    const dateLabel = session.startsAt.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
    const timeLabel = session.startsAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    const details = isRemote
      ? `Lien de connexion : ${meetingLink}`
      : `Lieu : ${session.location ?? "communiqué séparément"}`;
    try {
      await sendTransactionalEmail({
        to: contact.email,
        toName: `${contact.firstName} ${contact.lastName}`,
        subject: subject ?? `Convocation — ${course?.title ?? "votre formation"} du ${dateLabel}`,
        text: body ?? `Bonjour ${contact.firstName},\n\nVous êtes convoqué(e) à la session "${course?.title ?? ""}" le ${dateLabel} à ${timeLabel}.\n\n${details}\n\nÀ bientôt,\nL'équipe ${organization.name}`,
        senderName: organization.name,
      });
    } catch {
      // Non-fatal — the invitation record and meeting link still exist;
      // staff can relay manually from the dossier's Emails/Documents tabs.
    }
  }

  return { invitation, meetingLink };
}
