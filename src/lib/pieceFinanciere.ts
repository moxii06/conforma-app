// Ce qui distingue un devis d'une facture, quand on la joint à un message.
//
// Les deux gestes se ressemblent au point qu'écrire deux fois l'écran aurait
// été le plus court chemin — et le plus sûr moyen de les voir diverger, comme
// c'est déjà arrivé ailleurs dans ce code. Le composeur n'en connaît donc
// qu'un seul, paramétré par ce tableau.
//
// Ce qui les sépare vraiment tient en trois lignes, et chacune a une raison
// juridique, pas ergonomique :
//
//  1. Une facture porte une échéance de paiement (art. L441-9 du code de
//     commerce) ; un devis n'en a pas.
//  2. Un devis brouillon se supprime, une facture jamais — voir `supprimable`.
//  3. Envoyer un devis fait avancer l'affaire commerciale ; émettre une
//     facture ne déplace rien dans le CRM (seul l'encaissement clôt), cf.
//     lib/invoiceStatus.ts.

export type PieceKind = "quote" | "invoice";

export type LignePiece = {
  designation: string;
  quantity: number;
  unitPriceCents: number;
  unit?: string | null;
};

export type PieceFinanciere = {
  id: string;
  reference: string;
  amountCents: number;
  status: string;
  createdAt: string;
  description?: string | null;
  dueDate?: string | null;
  /**
   * Non pertinent pour un devis (`undefined` toujours). Sur une facture, sert
   * au rapport BPF §5.13 — voir champOrigineFinancement plus bas pour
   * pourquoi ce composeur doit le demander lui aussi.
   */
  fundingOrigin?: string | null;
  /**
   * Le détail ligne à ligne, transporté avec la pièce.
   *
   * Il voyage jusqu'ici parce que l'éditeur le réenregistre en bloc : rouvrir
   * une pièce sans son détail, puis enregistrer, l'effacerait sans que rien ne
   * le dise. Ce qu'un formulaire réécrit, il doit d'abord l'avoir lu.
   */
  lines?: LignePiece[];
};

export type VocabulairePiece = {
  /** « Devis » / « Facture » — l'onglet, et le début du titre du document. */
  Singulier: string;
  /** « le devis » / « la facture » — pour les phrases. */
  leLa: string;
  /** « ce devis » / « cette facture ». */
  ceCette: string;
  /** La catégorie posée sur le Document envoyé. */
  categorie: string;
  /** Le mode envoyé à la route d'envoi. */
  mode: PieceKind;
  /** Une facture porte une échéance de paiement, pas un devis. */
  champEcheance: boolean;
  /**
   * Une facture porte une origine de financement (BPF §5.13), pas un devis.
   *
   * Sans ce champ ici, une facture créée depuis ce composeur restait
   * marquée « Non renseigné » au rapport BPF de façon permanente — une
   * facture créée au même instant depuis la Facturation portait
   * correctement la sienne. Même défaut de fond que champEcheance : une
   * mention obligatoire absente d'un seul des deux points d'entrée.
   */
  champOrigineFinancement: boolean;
  /**
   * Un brouillon peut-il être effacé ?
   *
   * Devis : oui. Rien ne le numérote, rien ne l'a quitté, et un devis créé
   * par erreur dans un composeur ne doit pas rester.
   *
   * Facture : non, et ce n'est pas une timidité. `nextInvoiceReference`
   * alloue le numéro par incrément atomique du compteur de l'organisme :
   * effacer la facture ne rend pas son numéro, elle laisse un trou dans une
   * séquence que l'article 242 nonies A du CGI exige continue. Le trou est
   * invisible ici et se paie à l'inspection. La facture de trop se retire
   * du message ; elle se traite ensuite en Facturation, où c'est le métier.
   */
  supprimable: boolean;
  /** Ce que l'envoi va changer, dit avant de cliquer. */
  effetEnvoi: string;
  listeUrl: (contactId: string) => string;
  apercuUrl: (id: string) => string;
  creationUrl: string;
  detailUrl: (id: string) => string;
};

export const PIECES: Record<PieceKind, VocabulairePiece> = {
  quote: {
    Singulier: "Devis",
    leLa: "le devis",
    ceCette: "ce devis",
    categorie: "quote",
    mode: "quote",
    champEcheance: false,
    champOrigineFinancement: false,
    supprimable: true,
    effetEnvoi:
      "À l'envoi, ce devis passera en « envoyé » et l'affaire avancera à « Devis envoyé » — comme depuis la Facturation.",
    listeUrl: (contactId) => `/api/crm/contacts/${contactId}/quotes`,
    apercuUrl: (id) => `/api/crm/quotes/${id}/pdf`,
    creationUrl: "/api/facturation/quotes",
    detailUrl: (id) => `/api/facturation/quotes/${id}`,
  },
  invoice: {
    Singulier: "Facture",
    leLa: "la facture",
    ceCette: "cette facture",
    categorie: "invoice",
    mode: "invoice",
    champEcheance: true,
    champOrigineFinancement: true,
    supprimable: false,
    effetEnvoi:
      "À l'envoi, cette facture passera en « envoyée ». L'affaire commerciale ne bouge pas : c'est l'encaissement qui la clôt, pas l'émission.",
    listeUrl: (contactId) => `/api/crm/contacts/${contactId}/invoices`,
    apercuUrl: (id) => `/api/crm/invoices/${id}/pdf`,
    creationUrl: "/api/facturation/invoices",
    detailUrl: (id) => `/api/facturation/invoices/${id}`,
  },
};

/** Le titre sous lequel le prospect recevra la pièce, et sous lequel on la retrouvera. */
export function titrePiece(kind: PieceKind, reference: string): string {
  return `${PIECES[kind].Singulier} ${reference}`;
}

/**
 * L'échéance par défaut d'une facture émise depuis le composeur : +30 jours.
 *
 * Même valeur que la Facturation (DEFAULT_PAYMENT_TERM_DAYS) — c'est le délai
 * supplétif de l'article L441-10 du code de commerce quand rien n'est convenu.
 * Le champ reste modifiable : l'organisme qui a négocié autre chose le dit.
 */
export const DELAI_PAIEMENT_DEFAUT_JOURS = 30;

export function echeanceParDefaut(aujourdhui: Date): string {
  const d = new Date(aujourdhui);
  d.setDate(d.getDate() + DELAI_PAIEMENT_DEFAUT_JOURS);
  return d.toISOString().slice(0, 10);
}
