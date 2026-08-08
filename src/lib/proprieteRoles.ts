import { Role } from "@prisma/client";

/**
 * LES FILTRES DE PROPRIÉTÉ — « ses propres dossiers », « ses propres
 * prospects » — face au cumul de rôles.
 *
 * La matrice de lib/tenant.ts répond à une seule question : « cet écran
 * s'ouvre-t-il pour ce rôle ? ». Elle est plate, et ne sait donc pas dire
 * « oui, mais seulement sur ce qui vous appartient ». Cette seconde couche
 * vit dans les requêtes, sous la forme d'un `where` construit selon le rôle.
 * Ce fichier est le SEUL endroit où se décide quand ce `where` s'applique.
 *
 * Pourquoi il existe. Ces filtres s'écrivaient partout de la même façon :
 *
 *     const ownerFilter = role === Role.SALES ? { ownerId: userId } : {}
 *
 * c'est-à-dire sur le rôle PRINCIPAL. Le cumul de rôles les a cassés dans
 * les deux sens, et l'un des deux est une fuite de données :
 *
 *   — ÉLARGISSEMENT NON VOULU. Le rôle qui restreint arrive en casquette
 *     SECONDAIRE : `can()` ouvre bien l'écran, mais `role === …` est faux,
 *     donc le `where` reste vide. Un formateur à qui on ajoutait la
 *     casquette commerciale voyait ainsi la TOTALITÉ du pipeline de
 *     l'organisme sur /crm — strictement plus qu'un commercial pur, qui ne
 *     voit que ses propres affaires. Le cumul avait ouvert la porte et
 *     supprimé la serrure.
 *   — RESTRICTION NON VOULUE. Le miroir : le rôle restrictif est le rôle
 *     principal, et la casquette secondaire, qui devrait lever la borne,
 *     n'est jamais regardée. Le cumul retirait alors des droits.
 *
 * LA RÈGLE, une fois pour toute l'application :
 *
 *     un filtre de propriété se déclenche dès que le rôle restrictif est
 *     présent dans les rôles EFFECTIFS, et il ne se lève que si un rôle
 *     SANS BORNE sur cet écran y est présent aussi.
 *
 * Autrement dit : une personne voit l'UNION de ce que verrait chacune de ses
 * casquettes prise seule, et rien de plus. C'est déjà la doctrine de `can()`
 * (le meilleur niveau l'emporte) et celle de `peutLireDocument()` dans
 * lib/documentAccess.ts (un `some` casquette par casquette) ; ce fichier ne
 * fait que l'appliquer aux clauses `where`. Le cumul additionne des droits
 * existants ; il n'en fabrique jamais un que personne ne possède.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX ÉCRANS, DEUX LISTES « SANS BORNE » — et ce n'est pas une contradiction
 *
 * lib/dashboardTasks.ts et lib/rgpdMasking.ts répondaient l'inverse l'un de
 * l'autre à « la casquette commerciale lève-t-elle la borne du formateur ? » :
 * non pour le tableau de bord, oui pour le masquage RGPD. Les deux ont
 * raison, et c'est la même règle — parce que la liste « sans borne » n'est
 * pas un choix de confort, mais une CONSTATATION :
 *
 *     est sans borne, sur un écran donné, exactement le rôle qui — seul, et
 *     déjà aujourd'hui — y voit tout sans filtre.
 *
 * Un commercial seul voit tous les dossiers de l'organisme sur /dossiers :
 * sa casquette lève donc la borne du formateur là-bas, et le masquage des
 * coordonnées dit la même chose (ROLES_VOYANT_COORDONNEES contient SALES).
 * Mais un commercial seul ne reçoit AUCUNE tâche de formateur sur le tableau
 * de bord, et ne voit AUCUNE donnée de santé : sa casquette n'y lève donc
 * rien, faute d'avoir quoi que ce soit à ajouter. Deux résultats opposés,
 * une seule règle appliquée honnêtement.
 *
 * La conséquence à ne pas rater : un rôle qui n'ouvre pas l'écran ne lève
 * jamais rien. Un DPO externe à qui on ajoute la casquette formateur reste
 * borné aux sessions de ce formateur — il ne devient pas un formateur qui
 * verrait tout.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * INVARIANT NON NÉGOCIABLE : pour une personne sans aucun rôle secondaire,
 * `roles` vaut `[role]` et chaque helper ci-dessous rend exactement ce que
 * rendait `role === …`. Aucun compte existant ne change de périmètre.
 *
 * Ce fichier n'importe que l'énumération Role : il reste pur et testable
 * sans base de données, ce qui permet à lib/rgpdMasking.ts (pur lui aussi,
 * et unitairement testé) de partager la règle plutôt que de la recopier.
 */

/**
 * Les rôles qui voient l'organisme en entier partout : aucun filtre de
 * propriété ne leur a jamais été appliqué, sur aucun écran.
 */
export const ROLES_VUE_ORGANISME: readonly Role[] = [Role.ADMIN_OF, Role.ADMIN_MANAGER];

/**
 * Ce qui lève la borne « ses propres sessions » du formateur sur les écrans
 * de gestion — /dossiers, /planning, /formations, /documents, la recherche
 * globale et les routes qui les servent.
 *
 * SALES y figure parce qu'un commercial seul y voit déjà tout : dossiers,
 * sessions, catalogue et documents de l'organisme entier. Ne pas l'y mettre
 * ferait d'un commercial à qui on ajoute la casquette formateur quelqu'un
 * qui voit MOINS qu'avant — un cumul qui soustrait.
 *
 * À ne pas transposer sans vérifier : sur le tableau de bord, un commercial
 * seul ne reçoit aucune tâche de formateur, donc sa casquette n'y lève rien
 * (voir dashboardTasks.ts, qui utilise ROLES_VUE_ORGANISME).
 */
export const SANS_BORNE_FORMATEUR: readonly Role[] = [...ROLES_VUE_ORGANISME, Role.SALES];

/**
 * Ce qui lève la borne « ses propres prospects » du commercial sur /crm et
 * la recherche globale.
 *
 * Le formateur n'y figure pas, et pour la même raison de fond : la matrice
 * lui ferme le CRM (`crm: none`), donc sa casquette n'a rien à y ajouter.
 */
export const SANS_BORNE_COMMERCIAL: readonly Role[] = ROLES_VUE_ORGANISME;

/**
 * Faut-il borner cette personne à ce qui lui appartient ?
 *
 * @param roles          Les rôles EFFECTIFS (`SessionContext.roles`), cumul
 *                       compris — surtout pas le seul rôle principal.
 * @param roleRestrictif Le rôle porteur de la borne sur cet écran.
 * @param rolesSansBorne Les rôles qui, seuls, y voient déjà tout.
 */
export function borneAuxSiens(
  roles: readonly Role[],
  roleRestrictif: Role,
  rolesSansBorne: readonly Role[],
): boolean {
  if (!roles.includes(roleRestrictif)) return false;
  return !roles.some((r) => rolesSansBorne.includes(r));
}

/** « Ses propres sessions », et les dossiers/documents qui en dépendent. */
export function borneAuxSiennesDuFormateur(roles: readonly Role[]): boolean {
  return borneAuxSiens(roles, Role.TRAINER, SANS_BORNE_FORMATEUR);
}

/** « Ses propres affaires », côté CRM. */
export function borneAuxSiensDuCommercial(roles: readonly Role[]): boolean {
  return borneAuxSiens(roles, Role.SALES, SANS_BORNE_COMMERCIAL);
}
