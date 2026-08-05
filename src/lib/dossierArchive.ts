import type { Prisma } from "@prisma/client";

/**
 * Clôture d'un dossier apprenant — audit S7, P1 n°8.
 *
 * Le contact, la formation et la session avaient tous leur archivage ; le
 * dossier non. Conséquence : la promotion 2022 restait dans toutes les
 * listes de travail pour toujours.
 *
 * Ce fichier existe pour que la règle soit écrite UNE fois. Vingt-deux
 * endroits interrogent les dossiers, et la question « celui-ci doit-il se
 * taire ? » n'a pas la même réponse partout — la recopier à la main, c'est
 * garantir qu'elle divergera.
 *
 * La règle : un dossier clos sort des listes de TRAVAIL et ne déclenche
 * plus rien. Il ne disparaît de rien d'autre.
 *
 *   Se taisent (`DOSSIERS_ACTIFS`)
 *     · la liste /dossiers, par défaut
 *     · les tâches du tableau de bord
 *     · les relances automatiques du cron
 *     · les sélecteurs d'une action NOUVELLE (assigner un module, choisir
 *       un destinataire) — on n'agit pas sur un dossier qu'on a fermé
 *
 *   Ne se taisent JAMAIS
 *     · le BPF — une inscription de 2022 reste déclarée sur 2022 ;
 *       l'archivage est un rangement d'écran, jamais une réécriture de
 *       déclaration légale
 *     · les indicateurs de résultats Qualiopi, pour la même raison
 *     · l'espace de l'apprenant et ses attestations — clôturer, c'est
 *       classer côté organisme, pas retirer à quelqu'un ce qui lui
 *       appartient
 *     · la facturation — une facture impayée sur un dossier clos reste due
 *     · la recherche globale (Ctrl+K) — on cherche justement pour
 *       retrouver ce qui n'est plus sous les yeux
 */
export const DOSSIERS_ACTIFS = { archivedAt: null } satisfies Prisma.DossierWhereInput;

/** Pour une relation `session: { ... }` ou `dossier: { ... }`. */
export const DOSSIER_ACTIF_RELATION = { archivedAt: null } satisfies Prisma.DossierWhereInput;

/**
 * Filtre de la liste /dossiers selon l'onglet choisi. « Clôturés » est un
 * endroit explicite où regarder, pas une disparition : c'est la leçon déjà
 * tirée pour les sessions archivées.
 */
export function filtreCloture(vue: string | undefined): Prisma.DossierWhereInput {
  if (vue === "clotures") return { archivedAt: { not: null } };
  if (vue === "tous") return {};
  return DOSSIERS_ACTIFS;
}
