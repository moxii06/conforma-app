// L'adhésion à un médiateur de la consommation : quand elle s'impose, et
// quand Jalon a le droit de le rappeler.
//
// L'obligation n'est PAS générale. L'article L.612-1 du Code de la
// consommation vise le professionnel qui contracte avec un CONSOMMATEUR : un
// organisme qui ne vend qu'à des entreprises — conventions, OPCO — n'y est
// pas tenu. Rappeler tous les mois une obligation qui ne le concerne pas est
// la meilleure façon de perdre la confiance de quelqu'un sur tout le reste
// des alertes de conformité. Le déclencheur est donc un signal RÉEL de vente
// au particulier, pas une case déclarative.
//
// Le signal se lit sur ce que l'organisme a fait, jamais sur ce qu'il a
// annoncé : un contrat de formation « particulier » émis (c'est la catégorie
// de l'article L.6353-3, celle qui lie l'organisme à la personne physique à
// ses frais), ou une facture dont le financement est l'apprenant lui-même.
// Les deux sont écrits par l'application au moment où l'acte a lieu.

/** Le nombre de jours dont « À faire plus tard » repousse le rappel. */
export const REPORT_MEDIATION_JOURS = 30;

export type SignalParticulier = {
  /** Contrats de formation « particulier » émis, quel que soit leur état. */
  contratsParticulier: number;
  /** Factures dont le financement est l'apprenant lui-même. */
  facturesFondsPropres: number;
};

/**
 * L'organisme vend-il à des particuliers ?
 *
 * Un seul acte suffit : l'obligation naît du premier contrat de
 * consommation, pas d'un volume. Un organisme qui a émis un unique contrat
 * particulier il y a deux ans reste tenu tant qu'il peut en émettre un autre.
 */
export function vendAuxParticuliers(signal: SignalParticulier): boolean {
  return signal.contratsParticulier > 0 || signal.facturesFondsPropres > 0;
}

export type EtatMediation = {
  /** Le nom du médiateur renseigné sur la fiche de l'organisme. */
  mediateurRenseigne: boolean;
  signal: SignalParticulier;
  /** La date jusqu'à laquelle « À faire plus tard » repousse le rappel. */
  reporteJusquA: Date | null;
};

/**
 * Faut-il rappeler l'adhésion aujourd'hui ?
 *
 * Trois conditions, dans cet ordre de coût : le médiateur manque, l'organisme
 * vend à des particuliers, et le report éventuel est expiré. Un report dans
 * le futur fait taire le rappel — c'est tout ce que « À faire plus tard »
 * promet, et il ne doit rien promettre de plus : l'obligation, elle, ne se
 * reporte pas.
 */
export function rappelMediationDu(etat: EtatMediation, maintenant: Date): boolean {
  if (etat.mediateurRenseigne) return false;
  if (!vendAuxParticuliers(etat.signal)) return false;
  return etat.reporteJusquA === null || etat.reporteJusquA <= maintenant;
}

/**
 * L'étape de démarrage est-elle franchie ?
 *
 * Volontairement plus simple que le rappel : une étape se coche quand elle
 * est faite, pas quand elle cesse d'être rappelée. Un report ne coche rien —
 * sinon la check-list annoncerait terminé ce qui ne l'est pas.
 */
export function etapeMediationFaite(etat: Pick<EtatMediation, "mediateurRenseigne">): boolean {
  return etat.mediateurRenseigne;
}

/** La date jusqu'à laquelle reporter, à partir d'aujourd'hui. */
export function prochainRappel(maintenant: Date): Date {
  return new Date(maintenant.getTime() + REPORT_MEDIATION_JOURS * 24 * 60 * 60 * 1000);
}

/**
 * Ce que l'organisme doit lire, en une phrase, selon sa situation.
 *
 * Le ton change avec le fait : tant qu'aucun particulier n'est en jeu, c'est
 * une information ; dès qu'il y en a un, c'est un manquement. Écrire la même
 * chose dans les deux cas rendrait le second invisible.
 */
export function messageMediation(etat: EtatMediation): string {
  if (etat.mediateurRenseigne) return "Médiateur renseigné : la mention part automatiquement dans vos contrats.";
  if (!vendAuxParticuliers(etat.signal)) {
    return (
      "Obligatoire dès votre premier contrat avec un particulier (art. L.612-1 du Code de la consommation). " +
      "Vos ventes actuelles sont toutes professionnelles — à prévoir avant d'ouvrir aux particuliers."
    );
  }
  return (
    "Vous avez des clients particuliers : l'adhésion à un médiateur de la consommation est obligatoire " +
    "(art. L.612-1 du Code de la consommation), et ses coordonnées doivent figurer sur vos contrats et votre site."
  );
}
