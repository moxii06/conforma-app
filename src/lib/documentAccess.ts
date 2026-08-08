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

export type LecteurDocument = {
  /**
   * Le rôle PRINCIPAL. C'est lui qui répond à « est-ce un apprenant ? », la
   * seule question à laquelle une casquette secondaire ne peut rien changer :
   * LEARNER ne se cumule pas (NON_CUMULABLE_ROLES).
   *
   * L'autre règle de propriété — « ses sessions à lui », pour un formateur —
   * ne se lit PAS ici : elle est attachée à la casquette formateur, où qu'elle
   * se trouve dans la liste. Voir le pavé de `peutLireDocument`.
   */
  role: Role;
  /**
   * Les rôles EFFECTIFS (`SessionContext.roles`), cumul compris — ce qui ouvre
   * la porte, par opposition à `role` qui la referme sur ce qui appartient à
   * la personne.
   *
   * Facultatif : à défaut on retombe sur `[role]`, c'est-à-dire exactement le
   * comportement d'avant le cumul. Les appelants qui ne le passent pas encore
   * continuent donc de fonctionner à l'identique.
   */
  roles?: Role[];
  userId: string;
};

export function peutLireDocument(document: DocumentPourAcces, lecteur: LecteurDocument): boolean {
  const rolesEffectifs = lecteur.roles ?? [lecteur.role];

  // Le rôle principal, et non les rôles effectifs : LEARNER ne se cumule
  // jamais (NON_CUMULABLE_ROLES), les deux sont donc équivalents, et lire le
  // principal dit mieux ce qu'on demande — « est-ce un apprenant ? ».
  if (lecteur.role === Role.LEARNER) {
    // Ses propres dossiers, rien d'autre — la règle de mon-espace.
    return Boolean(document.dossier && document.dossier.learnerUserId === lecteur.userId);
  }

  if (document.dossierId) {
    /* --------------------------------------------------------------- *
     * Deux natures dans la même question, à ne surtout pas mélanger.
     *
     *   L'OUVERTURE — « ce rôle a-t-il accès aux dossiers ? » — se lit dans
     *   la matrice, donc par `can()`, et le cumul y joue à plein.
     *
     *   LA PROPRIÉTÉ — « ses propres sessions » pour un formateur — ne s'y
     *   lit pas : la matrice plate ne sait pas l'exprimer, c'est trainerId
     *   qui le dit.
     *
     * D'où le `some` CASQUETTE PAR CASQUETTE, exactement comme
     * `canManageSessionInvitations` dans lib/tenant.ts et
     * `peutSuivreFilApprenant` dans lib/messagerieApprenant.ts : chaque rôle
     * est jugé avec la condition qui lui appartient. Calculer la propriété
     * sur le NIVEAU CUMULÉ serait le piège — la condition « CETTE session-là »
     * se détacherait de la casquette formateur et n'aurait plus de sens.
     *
     * Les deux erreurs symétriques que cette forme évite :
     *
     *   — un formateur seul qui verrait les dossiers de tout l'organisme,
     *     parce que la propriété aurait été calculée sur autre chose que sa
     *     casquette formateur ;
     *   — un DPO externe à qui on ajoute la casquette formateur et qui, lui,
     *     lirait TOUT — plus qu'un vrai formateur. C'est ce qui arrive si la
     *     propriété est testée sur le rôle PRINCIPAL : le principal n'est pas
     *     TRAINER, donc la serrure du formateur ne se referme sur rien, alors
     *     que la porte a bel et bien été ouverte par cette casquette-là. Le
     *     cumul additionne des droits existants ; il n'en fabrique jamais un
     *     nouveau que personne ne possède.
     *
     * Avec un rôle unique, `rolesEffectifs` vaut `[role]` et cette expression
     * rend exactement l'ancien comportement, rôle par rôle.
     * --------------------------------------------------------------- */
    return rolesEffectifs.some((r) => {
      if (can(r, "dossiers") === "none") return false;
      if (r === Role.TRAINER) return document.dossier?.session.trainerId === lecteur.userId;
      return true;
    });
  }

  // Fiche d'un membre d'équipe ou d'un prestataire (CV, diplôme, contrat).
  // Aucune notion de propriété ici : le niveau cumulé suffit.
  return can(rolesEffectifs, "team") !== "none";
}

/** Ce qu'une requête Prisma doit inclure pour que la règle soit calculable. */
export const INCLUDE_ACCES_DOCUMENT = {
  dossier: { select: { learnerUserId: true, session: { select: { trainerId: true } } } },
} as const;
