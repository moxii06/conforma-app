import type { DocStatus } from "@prisma/client";

/**
 * Ce que « encaissé » veut dire — une seule fois, pour tous les écrans.
 *
 * Deux conventions se sont longtemps affrontées dans ce dépôt :
 * /facturation dérivait l'encaissé de la somme des `Payment`, la fiche
 * contact du seul STATUT de la facture. Chacune avait raison sur la moitié
 * des cas, et l'écart ne se voyait qu'au moment où quelqu'un comparait les
 * deux écrans — c'est-à-dire au pire moment, en comptabilité.
 *
 * La convention tranchée est : **`Payment` fait foi**. Marquer une facture
 * « Payé » CRÉE désormais le règlement du solde restant (voir
 * `appliquerStatutFacture` dans lib/invoiceStatus.ts), exactement comme le
 * fait déjà l'import d'historique et pour la même raison : les écrans
 * dérivent le reste dû de la somme des règlements, donc une facture payée
 * sans aucun règlement s'afficherait intégralement due. Les deux gestes
 * produisent la même donnée, aucun écran ne peut plus diverger.
 *
 * LE REPLI, et pourquoi il n'est pas facultatif : les factures déjà en base,
 * marquées PAID avant ce changement, ne portent AUCUN `Payment`. Sans repli,
 * l'historique de facturation de tous les clients existants afficherait
 * 0,00 € encaissé — un chiffre faux, sur l'écran même où on vient le
 * vérifier. Quand une facture est PAID et ne porte aucun règlement, son
 * montant est donc lu comme encaissé, et `deduitDuStatut` le dit à l'écran
 * plutôt que de le faire passer pour une ligne du grand livre.
 *
 * Le repli s'arrête net dès qu'il existe UN règlement : c'est alors le grand
 * livre qui parle, même s'il ne couvre pas la facture. Une facture marquée
 * payée avec 400 € encaissés sur 1 000 € affiche 400 € et un solde de 600 €
 * (`resteDuMalgrePaye`) — c'est précisément ce qu'il ne faut pas taire.
 */

/**
 * La marque que porte le règlement écrit par « marquer payé ».
 *
 * Écrite dans `Payment.method`, à côté de « virement (rapprochement
 * bancaire) » et de « reprise » : une phrase lisible, pas un code. C'est
 * elle qui permet à `appliquerStatutFacture` de défaire ce règlement quand
 * la facture repasse en « Envoyé » — sans jamais toucher à un règlement
 * saisi à la main, encaissé par Stripe ou confirmé au relevé bancaire.
 */
export const METHODE_SOLDE_AUTOMATIQUE = "solde automatique (facture marquée payée)";

export type ReglementLu = {
  amountCents: number;
  /** Optionnel : les appelants qui ne sélectionnent que les montants restent valides. */
  method?: string | null;
};

export type FacturePourEncaissement = {
  amountCents: number;
  status: DocStatus;
  payments: ReglementLu[];
};

export type Encaissement = {
  /** Ce qui est encaissé, repli compris. */
  encaisseCents: number;
  /** Ce qu'il reste à percevoir. Jamais négatif : un trop-perçu n'est pas une dette. */
  resteDuCents: number;
  /** Le montant vient du repli « PAID sans aucun règlement », pas du grand livre. */
  deduitDuStatut: boolean;
  /** La facture est marquée payée mais les règlements ne la couvrent pas. */
  resteDuMalgrePaye: boolean;
  /** Au moins un règlement a été écrit par « marquer payé », donc défaisable. */
  soldeAutomatique: boolean;
};

export function encaissementFacture(facture: FacturePourEncaissement): Encaissement {
  const sommeReglee = facture.payments.reduce((somme, p) => somme + p.amountCents, 0);
  const estPayee = facture.status === "PAID";
  // Le repli ne se déclenche que sur l'absence TOTALE de règlement — voir le
  // commentaire de tête : un règlement, même partiel, prime sur le statut.
  const deduitDuStatut = estPayee && facture.payments.length === 0;

  const encaisseCents = deduitDuStatut ? facture.amountCents : sommeReglee;
  const resteDuCents = Math.max(0, facture.amountCents - encaisseCents);

  return {
    encaisseCents,
    resteDuCents,
    deduitDuStatut,
    resteDuMalgrePaye: estPayee && resteDuCents > 0,
    soldeAutomatique: facture.payments.some((p) => p.method === METHODE_SOLDE_AUTOMATIQUE),
  };
}

/** Le raccourci des appelants qui ne veulent que le montant. */
export function montantEncaisseCents(facture: FacturePourEncaissement): number {
  return encaissementFacture(facture).encaisseCents;
}

/** Le total encaissé sur plusieurs factures — le « Total payé » d'une fiche client. */
export function totalEncaisseCents(factures: FacturePourEncaissement[]): number {
  return factures.reduce((somme, f) => somme + montantEncaisseCents(f), 0);
}
