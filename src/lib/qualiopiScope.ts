// Le périmètre d'un indicateur du RNQ. Certains ne concernent que les
// actions de formation par apprentissage (13 à 16 et 20 aujourd'hui, plus le
// 33 du projet 2026) : un organisme qui n'en réalise pas ne peut
// structurellement pas les couvrir.
//
// Une seule fonction, partagée par les trois endroits qui comptent des
// indicateurs — l'onglet Indicateurs, la préparation d'audit et l'export PDF
// du dossier d'audit. Trois filtres écrits séparément, ce serait trois
// scores différents pour la même organisation, dont un imprimé et remis à un
// auditeur.

export const APPRENTICESHIP_SCOPE = "apprentissage";

/**
 * Les indicateurs qui concernent réellement cet organisme.
 *
 * `null` (personne n'a répondu) laisse tout passer, comme avant :
 * masquer des indicateurs à un CFA qui en a besoin est la direction
 * dangereuse de l'erreur, alors qu'en afficher cinq de trop se voit et se
 * corrige. L'UI pose la question là où le chiffre est faux plutôt que de
 * deviner.
 */
export function applicableIndicators<T extends { scope: string }>(
  indicators: T[],
  deliversApprenticeship: boolean | null,
): T[] {
  if (deliversApprenticeship === false) {
    return indicators.filter((i) => i.scope !== APPRENTICESHIP_SCOPE);
  }
  return indicators;
}

/** Combien d'indicateurs sont réservés à l'apprentissage dans cette version. */
export function countApprenticeshipIndicators(indicators: { scope: string }[]): number {
  return indicators.filter((i) => i.scope === APPRENTICESHIP_SCOPE).length;
}
