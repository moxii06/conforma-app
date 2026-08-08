import { addDays, addMonths } from "date-fns";
import { Role, SessionMode } from "@prisma/client";

/**
 * Messagerie apprenant ↔ formateurs de sa session — ce que le schéma ne dit
 * pas.
 *
 * Trois questions vivent ici, parce que quatre endroits doivent y répondre
 * exactement pareil : l'écran « Mes échanges » de l'apprenant, l'onglet de la
 * fiche dossier côté organisme, et les deux routes qui les servent. Une seule
 * de ces réponses qui diverge et l'écran promet un fil que la route refuse —
 * ou pire, l'inverse.
 *
 * Fonctions pures, sans Prisma : elles se testent seules et ne peuvent pas
 * dériver d'un appelant à l'autre.
 */

/**
 * Le fil survit un mois à la fin de la formation.
 *
 * Pourquoi un délai plutôt qu'une fermeture sèche le dernier jour : les vraies
 * questions arrivent après. L'attestation qui n'est pas arrivée, le support de
 * cours qu'on veut retrouver, l'évaluation à froid. Couper au dernier module
 * aurait renvoyé tout ce trafic vers l'e-mail personnel du formateur, ce que
 * ce canal existe précisément pour éviter.
 *
 * Et pourquoi pas « jamais » : passé ce mois, l'organisme a retiré les accès,
 * les coordonnées de l'apprenant partent en rétention RGPD, et un fil encore
 * ouvert deviendrait un canal de contact permanent adossé à une inscription
 * terminée depuis longtemps.
 */
export const DELAI_FERMETURE_MOIS = 1;

/**
 * Quand ce fil doit se fermer — calculé à la création, et recalculé à chaque
 * envoi (les dates d'une session bougent, et un apprenant en continu peut
 * commencer des mois après son inscription).
 *
 * Trois cas, dans cet ordre :
 *
 * 1. Session à date fixe : `endsAt` est une vraie date de fin. Fin + 1 mois.
 *
 * 2. Session ROLLING (formation en continu) avec une durée d'accès :
 *    `endsAt` existe en base — la colonne n'est pas nullable — mais ne veut
 *    rien dire ici, personne ne l'a posée comme une fin réelle. Le seul
 *    horizon vrai est celui de l'apprenant : sa durée d'accès, comptée depuis
 *    son PREMIER ACCÈS réel exactement comme isAccessExpired (certificate.ts)
 *    et la tâche « durée dépassée » du tableau de bord. Tant que ce premier
 *    accès n'a pas eu lieu, on compte depuis l'inscription : c'est une borne
 *    provisoire et volontairement prudente, corrigée au premier message
 *    envoyé après que l'apprenant a réellement ouvert sa formation.
 *
 * 3. Session ROLLING sans durée d'accès : `null`, c'est-à-dire JAMAIS FERMÉ.
 *    Il n'existe alors aucune date de fin honnête dans le modèle — ni celle de
 *    la session, qui est un remplissage, ni celle de l'apprenant, qui n'a pas
 *    été fixée. Inventer une échéance aurait coupé la parole à quelqu'un au
 *    milieu d'un parcours sans terme ; ne rien fermer est le défaut sûr, et
 *    l'organisme garde la main en clôturant le dossier.
 */
export function calculerFermeture(
  session: { mode: SessionMode; endsAt: Date },
  dossier: { accessDurationDays: number | null; firstAccessedAt: Date | null; createdAt: Date },
): Date | null {
  if (session.mode !== SessionMode.ROLLING) return addMonths(session.endsAt, DELAI_FERMETURE_MOIS);
  if (dossier.accessDurationDays == null) return null;
  const depart = dossier.firstAccessedAt ?? dossier.createdAt;
  return addMonths(addDays(depart, dossier.accessDurationDays), DELAI_FERMETURE_MOIS);
}

/**
 * Le fil est-il clos ? `null` veut dire « jamais » (cas 3 ci-dessus), pas
 * « tout de suite » — d'où le test explicite plutôt qu'une comparaison qui
 * traiterait null comme une date passée.
 */
export function estFerme(closesAt: Date | string | null, maintenant: Date = new Date()): boolean {
  if (closesAt == null) return false;
  return maintenant.getTime() > new Date(closesAt).getTime();
}

/**
 * Qui, côté organisme, a le droit de suivre le fil d'un dossier.
 *
 * Les deux rôles administratifs, plus le formateur DE CETTE SESSION-LÀ. Le
 * rôle seul ne suffit pas pour un formateur : `PERMISSIONS.dossiers` lui donne
 * un accès « limited » qui veut dire « ses propres sessions », ce que la
 * matrice plate ne sait pas exprimer — c'est trainerId qui le dit.
 *
 * SALES est volontairement dehors, alors qu'il peut ouvrir une fiche dossier :
 * ce canal est pédagogique, pas commercial. Un commercial qui a besoin de
 * joindre le client a déjà la boîte mail et le CRM ; lui ouvrir le fil de
 * l'apprenant lui donnerait à lire des échanges sur le contenu de la
 * formation, parfois sur des difficultés personnelles, qui ne le regardent
 * pas. DPO_EXTERNAL est dehors pour la raison habituelle : prestataire borné
 * au registre RGPD.
 */
export function peutSuivreFilApprenant(
  role: Role,
  userId: string,
  session: { trainerId: string | null },
): boolean {
  if (role === Role.ADMIN_OF || role === Role.ADMIN_MANAGER) return true;
  if (role === Role.TRAINER) return session.trainerId === userId;
  return false;
}

/**
 * De quel camp vient un message.
 *
 * Le schéma stocke un `authorId` unique pour les deux côtés (l'apprenant a un
 * compte lui aussi), et `LearnerMessage.luAt` est explicitement « lu par le
 * camp d'en face », pas par une personne. C'est donc ici qu'on tranche : est
 * auteur « apprenant » celui — et le seul — qui est le titulaire du dossier.
 * Tout le reste est l'organisme, formateur comme gestionnaire.
 */
export function campDe(authorId: string, learnerUserId: string | null): "apprenant" | "organisme" {
  return learnerUserId !== null && authorId === learnerUserId ? "apprenant" : "organisme";
}
