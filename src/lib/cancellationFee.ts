// L'indemnité de résiliation anticipée : une clause NÉGOCIÉE, pas un réglage
// d'organisme.
//
// Elle vivait dans les réglages, en un pourcentage unique appliqué à tous les
// contrats. Or elle se discute client par client : un pourcentage imposé à
// tout le monde était faux dès le deuxième client. La valeur de l'organisme
// devient donc une PROPOSITION, que chaque contrat peut remplacer au moment
// où on le rédige.
//
// Rien à stocker : le pourcentage se substitue dans le texte à la génération
// (voir `contract.cancellationFeePercent` dans mergeTemplate.ts), donc une
// fois le document produit, la valeur vit dans ses clauses — comme les
// réponses du questionnaire, et pour la même raison. Un champ de plus en base
// serait une seconde vérité sur un fait déjà écrit.

/** Bornes de saisie : un pourcentage, et rien d'autre. */
export const INDEMNITE_MIN = 0;
export const INDEMNITE_MAX = 100;

/**
 * Le pourcentage qui s'applique réellement à ce contrat.
 *
 * `undefined` signifie « l'appelant n'a pas d'avis » et laisse la proposition
 * de l'organisme jouer. `null` est en revanche un CHOIX explicite — « aucune
 * indemnité sur ce contrat-là » — et doit écraser la valeur par défaut. Les
 * confondre reviendrait à réimposer le réglage d'organisme à qui vient
 * justement de s'en écarter.
 */
export function indemniteApplicable(
  override: number | null | undefined,
  defautOrganisme: number | null,
): number | null {
  return override === undefined ? defautOrganisme : override;
}

/**
 * Lit le paramètre d'URL des écrans d'aperçu.
 *
 * Trois états à distinguer dans une chaîne : absent (undefined, pas d'avis),
 * vide (null, aucune indemnité voulue), un nombre. Une valeur hors bornes ou
 * illisible est traitée comme absente — un aperçu doit s'afficher, pas
 * échouer, et la proposition de l'organisme est le repli le moins surprenant.
 */
export function lireIndemniteParam(raw: string | null): number | null | undefined {
  if (raw === null) return undefined;
  if (raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < INDEMNITE_MIN || n > INDEMNITE_MAX) return undefined;
  return Math.round(n);
}
