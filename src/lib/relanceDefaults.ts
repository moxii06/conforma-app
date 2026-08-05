/**
 * Les seuils de relance appliqués tant qu'aucune règle propre à la formation
 * ne les remplace.
 *
 * Ils vivaient en constantes privées de dashboardTasks.ts, qui importe
 * Prisma — donc inatteignables depuis l'écran qui les mentionne, un
 * composant client. Résultat : la fiche formation disait « les seuils par
 * défaut de l'application s'appliquent » sans jamais pouvoir dire lesquels.
 * On ne décide pas s'il faut surcharger un seuil qu'on ne voit pas.
 *
 * Ce module est pur — aucune requête, aucun import serveur — pour que la
 * phrase affichée et le moteur qui l'applique lisent le MÊME nombre. Une
 * valeur recopiée dans un libellé finit toujours par mentir : c'est le
 * moteur qu'on change, jamais le texte qui le décrit.
 *
 * Ce ne sont pas des seuils imposés par un texte réglementaire, seulement
 * des valeurs raisonnables par défaut.
 */

/** Relance générique d'une action en attente. */
export const REMINDER_AFTER_DAYS = 5;

/** Convocation non envoyée, tant de jours avant la session. */
export const CONVOCATION_WARNING_DAYS = 7;

/** Pièce d'un sous-traitant arrivant à expiration. */
export const SUBCONTRACTOR_EXPIRY_WARNING_DAYS = 30;

/**
 * Préparation (recueil / convention) d'un dossier à date fixe : signalée
 * tant de jours AVANT le début de la session.
 *
 * Une formation en continu n'a pas de date d'où compter à rebours : elle
 * reçoit un délai de grâce à plat depuis l'inscription. Mêmes deux faits,
 * deux horloges différentes.
 */
export const FIXED_SESSION_PREP_WARNING_DAYS = 10;
export const ROLLING_PREP_DEADLINE_DAYS = 7;

/**
 * Part de la durée d'accès consommée à partir de laquelle on alerte, pour
 * une formation en continu. 0,7 = « 70 % du temps est passé et ce n'est
 * toujours pas terminé ». À 1,0 (durée entièrement écoulée) c'est un retard,
 * plus une alerte.
 */
export const ROLLING_DURATION_WARNING_RATIO = 0.7;

/**
 * Sans le moindre événement e-learning pendant ce délai, l'apprenant est
 * considéré comme potentiellement décroché — quel que soit le mode de la
 * session.
 */
export const LEARNER_INACTIVITY_DAYS = 14;

/**
 * Ce que l'écran affiche quand une formation n'a aucune règle propre.
 *
 * Formulé comme des faits datés plutôt que comme une liste de réglages :
 * l'organisme veut savoir « quand est-ce que ça se déclenche », pas « quelles
 * constantes existent ». Les quatre retenus sont ceux qu'un OF rencontre
 * réellement chaque semaine ; les seuils plus rares (sous-traitant, ratio de
 * durée d'accès) resteraient du bruit ici.
 */
export const SEUILS_PAR_DEFAUT_RESUME = [
  `recueil et convention signalés ${FIXED_SESSION_PREP_WARNING_DAYS} j avant la session (${ROLLING_PREP_DEADLINE_DAYS} j après l'inscription en formation continue)`,
  `convocation ${CONVOCATION_WARNING_DAYS} j avant`,
  `apprenant sans activité depuis ${LEARNER_INACTIVITY_DAYS} j`,
  `relance générale à ${REMINDER_AFTER_DAYS} j`,
].join(", ");
