import type { Document } from "@prisma/client";
import { prisma } from "./prisma";
import { buildCertificate, isAccessExpired } from "./certificate";

/**
 * Délivrer l'attestation d'un dossier — la partie base de données.
 *
 * Pendant de lib/certificate.ts, qui décide de la FORME du document sans
 * toucher à la base. Ici on lit, on écrit, et rien d'autre : deux appelants
 * (la route LMS et l'envoi depuis « À faire ») doivent produire exactement
 * le même document, et surtout ne jamais en produire deux pour un même
 * dossier.
 *
 * `created` distingue « je viens de la délivrer » de « elle existait déjà »,
 * ce dont l'appelant a besoin pour ne pas annoncer une délivrance qui n'a
 * pas eu lieu.
 */
export type IssueResult =
  | { ok: true; document: Document; created: boolean }
  | { ok: false; reason: string; status: number };

export async function issueCertificate(dossierId: string, organizationId: string): Promise<IssueResult> {
  const dossier = await prisma.dossier.findFirst({
    where: { id: dossierId, organizationId },
    include: {
      contact: true,
      session: {
        include: {
          course: { include: { elearningModules: { include: { quiz: true } } } },
          days: { orderBy: { order: "asc" } },
        },
      },
      elearningProgress: true,
      quizAttempts: true,
      attendanceEntries: true,
    },
  });
  if (!dossier) return { ok: false, reason: "Dossier introuvable.", status: 404 };

  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
  const result = buildCertificate({
    organizationName: organization.name,
    learnerName: `${dossier.contact.firstName} ${dossier.contact.lastName}`,
    course: dossier.session.course,
    modules: dossier.session.course.elearningModules,
    progress: dossier.elearningProgress,
    quizAttempts: dossier.quizAttempts,
    days: dossier.session.days,
    attendanceEntries: dossier.attendanceEntries,
    accessExpired: isAccessExpired(dossier),
    now: new Date(),
  });
  if (!result.ok) return { ok: false, reason: result.reason, status: 400 };

  const existing = await prisma.document.findFirst({
    where: { dossierId: dossier.id, templateOrigin: "lms_certificate" },
  });
  if (existing) {
    // Un seul cas justifie de réécrire une attestation déjà délivrée : elle
    // disait « fin de formation, parcours non mené à son terme » et
    // l'apprenant a depuis tout validé (durée d'accès prolongée). La laisser
    // telle quelle ferait mentir la pièce dans le mauvais sens. Sinon on
    // renvoie l'existante — jamais deux attestations pour un même dossier.
    if (existing.title === result.title || result.kind !== "success") {
      return { ok: true, document: existing, created: false };
    }
    const corrected = await prisma.document.update({
      where: { id: existing.id },
      data: { title: result.title, bodyText: result.bodyText, expiresAt: result.expiresAt },
    });
    return { ok: true, document: corrected, created: false };
  }

  const document = await prisma.document.create({
    data: {
      organizationId,
      dossierId: dossier.id,
      title: result.title,
      bodyText: result.bodyText,
      // Même marqueur d'origine pour les trois formes : c'est lui qui rend
      // la délivrance idempotente ci-dessus.
      templateOrigin: "lms_certificate",
      category: "results_summary",
      expiresAt: result.expiresAt,
    },
  });
  return { ok: true, document, created: true };
}
