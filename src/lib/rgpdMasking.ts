import { Role, SessionMode } from "@prisma/client";
import { addDays, addMonths } from "date-fns";

/**
 * Minimisation des données sur la fiche dossier — art. 5(1)(c) du RGPD.
 *
 * Une habilitation n'est pas éternelle : un formateur a besoin de joindre
 * SES apprenants PENDANT qu'il les forme, pas trois ans après. Le rôle
 * TRAINER, lui, ne change jamais — sans règle de temps, l'accès accordé
 * pour une session de deux jours en 2022 court encore aujourd'hui, sur
 * quatre mille dossiers. C'est exactement ce qu'un contrôle CNIL appelle
 * un défaut d'habilitation.
 *
 * Cette règle vit ici, seule et testée, et non dispersée dans le JSX. Trois
 * raisons, dans l'ordre d'importance :
 *
 *   — c'est une règle JURIDIQUE. Elle s'écrit une fois, se relit, et se
 *     défend devant un auditeur. Recopiée dans huit conditions de rendu,
 *     elle diverge au premier écran ajouté et plus personne ne sait ce que
 *     le logiciel applique réellement ;
 *   — elle est testable sans base de données ni navigateur, donc elle l'est
 *     vraiment (voir rgpdMasking.test.ts) ;
 *   — elle ne fait que RETIRER. Elle ne donne accès à rien : les portes
 *     restent celles de lib/tenant.ts, que ce fichier ne remplace pas et
 *     n'élargit jamais. Un écran combine les deux (`aDéjàLeDroit && !masqué`).
 *
 * Ce qui n'est JAMAIS masqué, quel que soit le rôle et l'ancienneté : le
 * nom de l'apprenant, la formation suivie, ses dates, sa réussite. Ce sont
 * les faits pédagogiques que le formateur a produits et dont l'organisme
 * doit pouvoir prouver la réalité (art. L.6353-1, indicateurs Qualiopi).
 * Les masquer transformerait une mesure de minimisation en perte de preuve.
 */

/**
 * Le mois de grâce après la fin de session.
 *
 * Il n'est pas cosmétique : l'évaluation à chaud, l'attestation, la réponse
 * à une question de dernière minute arrivent APRÈS le dernier jour. Couper
 * les coordonnées le soir même rendrait le travail impossible et se ferait
 * contourner par un carnet d'adresses parallèle — le pire résultat possible
 * pour la protection des données.
 */
export const DELAI_GRACE_COORDONNEES_MOIS = 1;

// Les rôles pour qui les coordonnées d'un apprenant restent une donnée de
// travail sans limite de durée.
//
// SALES y figure volontairement : sa finalité est la relation client, pas
// l'animation d'une session. Un commercial rappelle un ancien stagiaire
// pour lui proposer la suite de son parcours — c'est le traitement
// « prospection » du registre, avec sa propre durée de conservation, et il
// n'a pas à s'éteindre parce qu'une session est terminée. DPO_EXTERNAL y
// figure parce qu'un DPO qui ne voit pas les données ne peut rien contrôler.
const ROLES_VOYANT_COORDONNEES: Role[] = [Role.ADMIN_OF, Role.ADMIN_MANAGER, Role.SALES, Role.DPO_EXTERNAL];

// Données de santé / handicap : cercle strictement plus étroit. Aligné sur
// canAccessAccommodations (lib/tenant.ts), qui reste la porte d'entrée —
// ce fichier ne fait que la refermer plus tôt pour le formateur.
const ROLES_VOYANT_SANTE: Role[] = [Role.ADMIN_OF, Role.ADMIN_MANAGER];

export type ContexteMasquage = {
  /**
   * TOUS les rôles de la personne : `User.role` plus `User.additionalRoles`.
   * Un responsable pédagogique qui anime aussi une session cumule les deux
   * casquettes ; ne regarder que la principale le priverait de ce que
   * l'autre lui accorde.
   */
  roles: Role[];
  /** Fin réelle de la formation suivie, ou `null` si elle n'est pas connue. */
  finFormation: Date | null;
  maintenant: Date;
};

/** Cette personne n'a-t-elle que la casquette formateur, pour cette question ? */
function seulementFormateur(roles: Role[], rolesPrivilegies: Role[]): boolean {
  if (!roles.includes(Role.TRAINER)) return false;
  return !roles.some((r) => rolesPrivilegies.includes(r));
}

/**
 * Quand la formation suivie s'est réellement terminée — ou `null`.
 *
 * `null` n'est pas un cas d'erreur : c'est « on ne peut pas affirmer que
 * c'est fini », et rien n'est alors masqué. Masquer sur une date qu'on ne
 * connaît pas serait aussi faux que ne jamais masquer.
 *
 * Une session à date fixe se termine à sa date de fin, point. Une session
 * en continu (ROLLING) n'en a PAS : son `endsAt` est un remplissage
 * technique, jamais une date de fin réelle (voir CLAUDE.md, « Proving a
 * session happened »). Pour elle, la fin est la date à laquelle l'accès
 * expire — premier accès + durée allouée — ou, à défaut, la clôture du
 * dossier, qui est la façon dont l'organisme déclare lui-même l'affaire
 * terminée.
 */
export function finDeFormation(source: {
  mode: SessionMode;
  sessionEndsAt: Date;
  firstAccessedAt: Date | null;
  accessDurationDays: number | null;
  dossierArchiveLe: Date | null;
}): Date | null {
  if (source.mode === SessionMode.FIXED_DATE) return source.sessionEndsAt;
  if (source.firstAccessedAt && source.accessDurationDays != null) {
    return addDays(source.firstAccessedAt, source.accessDurationDays);
  }
  return source.dossierArchiveLe;
}

/**
 * Faut-il masquer email, téléphone et adresse de l'apprenant ?
 *
 * Vrai pour le seul formateur, un mois après la fin de la formation suivie.
 */
export function coordonneesMasquees(ctx: ContexteMasquage): boolean {
  if (!seulementFormateur(ctx.roles, ROLES_VOYANT_COORDONNEES)) return false;
  if (!ctx.finFormation) return false;
  return ctx.maintenant >= addMonths(ctx.finFormation, DELAI_GRACE_COORDONNEES_MOIS);
}

/**
 * Faut-il masquer les données de handicap et de santé (AccommodationRequest
 * et champs liés) ?
 *
 * Vrai pour le seul formateur dès la fin de la formation, SANS délai de
 * grâce — contrairement aux coordonnées. Ce n'est pas une sévérité
 * gratuite : l'article 9 interdit par principe le traitement de ces
 * données, et ne le tolère que le temps strictement nécessaire à la
 * finalité. Cette finalité, c'est l'aménagement de la formation ; la
 * formation finie, elle n'existe plus, et le mois de grâce des coordonnées
 * — justifié par l'évaluation à chaud et l'attestation — n'a ici aucun
 * équivalent à invoquer.
 */
export function donneesSanteMasquees(ctx: ContexteMasquage): boolean {
  if (!seulementFormateur(ctx.roles, ROLES_VOYANT_SANTE)) return false;
  if (!ctx.finFormation) return false;
  return ctx.maintenant >= ctx.finFormation;
}

/**
 * Le `requestType` de la porte de sortie : « j'ai une raison légitime de
 * revoir ces coordonnées, tranchez ».
 *
 * Volontairement distinct des quatre droits de la personne concernée
 * (access / erasure / portability / rectification) : ceux-là sont exercés
 * PAR l'apprenant et courent sous le délai d'un mois de l'article 12(3).
 * Celui-ci est une demande INTERNE d'un intervenant. Les confondre
 * gonflerait le registre des droits de lignes qui n'en sont pas, et un
 * auditeur lisant « 40 demandes d'accès » y verrait un signal d'alerte là
 * où il n'y a que des formateurs cherchant un numéro de téléphone.
 *
 * `RightsRequest` reste le support parce qu'il porte déjà ce dont la
 * demande a besoin — une échéance, une assignation, un statut, une trace —
 * et qu'un modèle de plus pour dix lignes par an serait du poids sans gain.
 */
export const TYPE_DEMANDE_ACCES_INTERNE = "internal_access";
