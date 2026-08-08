/**
 * Le catalogue des formules Jalon — libellé, prix public, limites, contenu.
 *
 * POURQUOI CE FICHIER EXISTE : ces valeurs étaient recopiées dans cinq
 * endroits (la page marketing, /essai, SignupForm, lib/billing.ts et le
 * commentaire de lib/signatureQuota.ts), chacun avec sa propre liste de
 * fonctionnalités et son propre « 39 €/mois » en dur. Un changement de prix
 * demandait cinq modifications, et il en manquait toujours une. Tout ce qui
 * décrit une formule vit désormais ici.
 *
 * Aucune dépendance à Prisma ni à Stripe : ce module est importé par des
 * composants client (la grille comparative de /abonnement) autant que par des
 * routes serveur, et le charger ne doit jamais ouvrir de connexion.
 *
 * ---------------------------------------------------------------------------
 * SUR LE PRIX, ET LA RÈGLE QUI NE DOIT PAS ÊTRE CASSÉE
 *
 * `prixMensuelHtCents` est le tarif PUBLIC affiché au catalogue. Ce n'est PAS
 * l'autorité sur ce qui est réellement débité : quand la facturation Stripe
 * est configurée, l'autorité est le Price Stripe désigné par
 * `variablePrixStripe`, lu à l'exécution par `fetchPlanPrices()`
 * (lib/billing.ts). Le commentaire de cette fonction dit pourquoi et reste
 * vrai : deux sources de vérité sur un montant finissent par afficher 49 €
 * pendant qu'on prélève 59 €.
 *
 * La valeur ci-dessous sert donc uniquement de repli d'AFFICHAGE tant que
 * Stripe n'est pas branché — sans quoi l'écran des formules n'annonce que
 * « Sur devis » sur les trois colonnes, ce qui n'aide personne à choisir.
 * `resoudrePrixMensuelCents()` applique cette priorité en un seul endroit :
 * s'en servir plutôt que de relire les deux champs à la main.
 * ---------------------------------------------------------------------------
 */

export type CleFormule = "solo" | "team" | "growth";

/** Les clés dans l'ordre d'affichage, réutilisable tel quel par `z.enum`. */
export const CLES_FORMULES = ["solo", "team", "growth"] as const;

/**
 * Signatures électroniques passant par le compte Yousign de Jalon et incluses
 * dans la formule Solo ; au-delà, chacune est refacturée.
 *
 * Ici et pas dans signatureQuota.ts (qui les recompte) parce que c'est une
 * caractéristique commerciale de l'offre avant d'être une règle de comptage :
 * la grille comparative doit pouvoir l'annoncer sans importer Prisma.
 */
export const SIGNATURES_INCLUSES_SOLO = 10;
export const PRIX_SIGNATURE_SUPP_CENTS = 100;

export type LimitesFormule = {
  /** null = illimité. */
  utilisateurs: number | null;
  /** null = illimité. */
  apprenantsActifsParMois: number | null;
  /** null = illimité (Team et Growth n'ont pas de compteur de signatures). */
  signaturesIncluses: number | null;
};

export type Formule = {
  cle: CleFormule;
  libelle: string;
  accroche: string;
  /** Tarif public HT, en centimes. Voir l'avertissement en tête de fichier. */
  prixMensuelHtCents: number;
  /**
   * Les trois mêmes axes pour les trois formules, afin que la grille se lise
   * en colonnes comparables. Une liste de fonctionnalités seule ne se compare
   * pas : « 5 utilisateurs » en face de « illimité » se compare.
   */
  limites: LimitesFormule;
  /** Ce que la formule ajoute, en repartant de la précédente. */
  inclus: string[];
  /** Variable d'environnement portant l'id du Price Stripe correspondant. */
  variablePrixStripe: string;
};

export const FORMULES: Formule[] = [
  {
    cle: "solo",
    libelle: "Solo",
    accroche: "Pour un formateur indépendant ou un organisme d'une personne.",
    prixMensuelHtCents: 3900,
    limites: { utilisateurs: 1, apprenantsActifsParMois: 15, signaturesIncluses: SIGNATURES_INCLUSES_SOLO },
    inclus: [
      "Catalogue, sessions et dossiers de formation",
      "LMS intégré : vidéos, quiz, attestations",
      "Facturation, devis et suivi des paiements",
      "Conformité Qualiopi et registre RGPD",
      "Bibliothèque de documents et modèles conditionnels",
    ],
    variablePrixStripe: "STRIPE_PRICE_SOLO",
  },
  {
    cle: "team",
    libelle: "Team",
    accroche: "Pour un organisme avec plusieurs formateurs et un commercial.",
    prixMensuelHtCents: 8900,
    limites: { utilisateurs: 5, apprenantsActifsParMois: null, signaturesIncluses: null },
    inclus: [
      "Tout ce que contient Solo",
      "Comptes d'équipe et rôles",
      "Boîte mail intégrée et triage",
      "Automatisations de relance par formation",
      "Portails apprenant et formateur",
    ],
    variablePrixStripe: "STRIPE_PRICE_TEAM",
  },
  {
    cle: "growth",
    libelle: "Growth",
    accroche: "Pour un organisme structuré, avec son propre système d'information.",
    prixMensuelHtCents: 18900,
    limites: { utilisateurs: null, apprenantsActifsParMois: null, signaturesIncluses: null },
    inclus: [
      "Tout ce que contient Team",
      "API publique et webhooks",
      "Rapprochement bancaire",
      "Marque blanche complète",
      "Accompagnement à la migration des données",
    ],
    variablePrixStripe: "STRIPE_PRICE_GROWTH",
  },
];

export function trouverFormule(cle: string | null | undefined): Formule | null {
  if (!cle) return null;
  return FORMULES.find((f) => f.cle === cle) ?? null;
}

/**
 * Le libellé d'affichage d'une formule.
 *
 * Retombe sur la clé brute plutôt que sur « — » : si Stripe renvoyait un jour
 * un plan que le code ne connaît pas, mieux vaut lire « enterprise » à l'écran
 * que rien du tout, parce que c'est ce qui permet de comprendre le décalage.
 */
export function libelleFormule(cle: string | null | undefined): string {
  if (!cle) return "—";
  return trouverFormule(cle)?.libelle ?? cle;
}

/**
 * `devise` par défaut à l'euro — mais paramétrable, parce qu'un Price Stripe
 * porte sa propre devise et que la formater en euros afficherait « 89,00 € »
 * pour un prix libellé en francs suisses.
 */
export function formaterMontant(cents: number, devise = "EUR"): string {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: devise.toUpperCase() });
}

/**
 * Le montant à afficher pour une formule, et d'où il vient.
 *
 * `depuisStripe: false` doit être dit à l'écran (« tarif public indicatif ») :
 * tant que Stripe n'est pas branché, personne n'a encore engagé ce montant, et
 * l'afficher comme un prix ferme serait promettre à la place du système qui
 * facturera vraiment.
 */
export function resoudrePrixMensuelCents(
  formule: Formule,
  prixStripe: { amountCents: number; currency: string } | null | undefined,
): { cents: number; devise: string; depuisStripe: boolean } {
  if (prixStripe) return { cents: prixStripe.amountCents, devise: prixStripe.currency, depuisStripe: true };
  return { cents: formule.prixMensuelHtCents, devise: "EUR", depuisStripe: false };
}
