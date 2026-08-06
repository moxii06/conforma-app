import { Role } from "@prisma/client";
import { can } from "@/lib/tenant";

/**
 * Qui a le droit de lire UN document.
 *
 * Extrait ici parce que deux routes servent le même document par deux
 * chemins — /api/documents/[id]/file pour un fichier téléversé,
 * /api/documents/generated/[id] pour un document rédigé dans l'application —
 * et que la seconde ne vérifiait que l'organisation. Un apprenant pouvait
 * donc lire le contrat d'un autre apprenant du même organisme.
 *
 * Deux règles de lecture, servies par le même document, ne peuvent pas
 * exister : la plus permissive gagne toujours, et c'est celle-là qu'on
 * découvre le jour où quelqu'un s'en aperçoit.
 *
 * Les trois formes de rattachement ci-dessous reprennent exactement les
 * requêtes qui listent déjà ces documents (mon-espace pour un apprenant,
 * /dossiers pour l'équipe, /team pour un membre ou un prestataire) — aucune
 * règle inventée pour l'occasion.
 */
export type DocumentPourAcces = {
  dossierId: string | null;
  dossier: { learnerUserId: string | null; session: { trainerId: string | null } } | null;
};

export type LecteurDocument = { role: Role; userId: string };

export function peutLireDocument(document: DocumentPourAcces, lecteur: LecteurDocument): boolean {
  if (lecteur.role === Role.LEARNER) {
    // Ses propres dossiers, rien d'autre — la règle de mon-espace.
    return Boolean(document.dossier && document.dossier.learnerUserId === lecteur.userId);
  }

  if (document.dossierId) {
    if (can(lecteur.role, "dossiers") === "none") return false;
    // Un formateur ne voit que ses sessions, le même second filtre que
    // /dossiers applique.
    if (lecteur.role === Role.TRAINER) return document.dossier?.session.trainerId === lecteur.userId;
    return true;
  }

  // Fiche d'un membre d'équipe ou d'un prestataire (CV, diplôme, contrat).
  return can(lecteur.role, "team") !== "none";
}

/** Ce qu'une requête Prisma doit inclure pour que la règle soit calculable. */
export const INCLUDE_ACCES_DOCUMENT = {
  dossier: { select: { learnerUserId: true, session: { select: { trainerId: true } } } },
} as const;
