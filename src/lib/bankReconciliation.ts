// Ranks open invoices against one incoming bank transaction — the only
// half of "rapprochement bancaire" that's genuinely hard, and the reason
// this whole feature is "suggest, staff confirms" rather than automatic
// (see schema.prisma's BankTransaction comment): a bank statement line is
// free text with no invoice reference, unlike Stripe's Checkout Session
// metadata. Used identically regardless of where the transaction came from
// (CSV import or a live Bridge sync) — see bankStatementImport.ts and
// lib/bridge.ts for the two sources that feed BankTransaction rows.

export type InvoiceMatchCandidate = {
  id: string;
  reference: string;
  amountCents: number;
  paidCents: number; // sum of existing Payment rows — a partially-paid invoice matches on its *remaining* balance
  createdAt: Date;
  contact: { firstName: string; lastName: string; company: { name: string } | null };
  // Le financeur facturé en subrogation, quand il y en a un. C'est LUI qui
  // vire l'argent : sur une facture OPCO, le nom de l'apprenant n'apparaîtra
  // jamais dans le libellé bancaire. Sans ce champ, les virements les plus
  // fréquents d'un OF étaient exactement ceux qu'aucune suggestion ne
  // trouvait — et qu'il pointait donc à la main.
  funder?: { name: string } | null;
};

export type TransactionForMatching = {
  amountCents: number;
  bookedAt: Date;
  label: string;
  counterpartyName?: string | null;
};

export type InvoiceMatch = {
  invoiceId: string;
  score: number;
  reasons: string[];
};

// A match at or above this score is confident enough to be the UI's
// pre-selected default (still requires a click to confirm) — exact
// remaining-balance match plus the payer's name found in the statement
// line. Below this, all candidates are shown but none pre-picked.
export const CONFIDENT_MATCH_THRESHOLD = 70;

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// A name "matches" a label if every word of the name (ignoring particles
// too short to be meaningful, e.g. initials) appears somewhere in it —
// handles "DUPONT Jean" vs "VIR SEPA JEAN DUPONT FORMATION" in either word
// order, which is how French bank statements actually render virement
// labels.
function nameFoundIn(name: string, haystack: string): boolean {
  const words = normalize(name)
    .split(" ")
    .filter((w) => w.length >= 2);
  if (words.length === 0) return false;
  return words.every((w) => haystack.includes(w));
}

// Mots trop génériques pour identifier un financeur à eux seuls : tous les
// OPCO les partagent. Sans cette exclusion, « OPCO Atlas » matcherait un
// virement « OPCO EP ».
const GENERIC_FUNDER_WORDS = ["opco", "opca"];

/**
 * Un financeur apparaît dans un libellé bancaire soit sous son nom complet
 * (« VIR OPCO EP 12345 »), soit sous son seul nom distinctif (« VIR ATLAS
 * FORMATION » pour « OPCO Atlas ») — les banques tronquent, et les OPCO ne
 * libellent pas tous pareil. On accepte donc les deux, mais le repli sur le
 * nom distinctif exige des mots d'au moins 4 lettres hors mots génériques :
 * « EP » seul identifierait n'importe quoi.
 */
function funderFoundIn(name: string, haystack: string): boolean {
  if (nameFoundIn(name, haystack)) return true;
  const distinctive = normalize(name)
    .split(" ")
    .filter((w) => w.length >= 4 && !GENERIC_FUNDER_WORDS.includes(w));
  if (distinctive.length === 0) return false;
  return distinctive.every((w) => haystack.includes(w));
}

export function scoreInvoiceMatch(tx: TransactionForMatching, invoice: InvoiceMatchCandidate): InvoiceMatch {
  const reasons: string[] = [];
  let score = 0;

  // Name matching first — the partial-payment amount credit below is
  // gated on it. Without that gate, ANY incoming transaction smaller than
  // an open invoice's balance (which is most of them: rent, EDF, a
  // supplier refund...) would look like a "plausible partial payment" —
  // real bug caught by the "unrelated transaction" test.
  const haystack = normalize(`${tx.label} ${tx.counterpartyName ?? ""}`);
  const fullName = `${invoice.contact.firstName} ${invoice.contact.lastName}`;
  let hasNameSignal = false;
  if (nameFoundIn(fullName, haystack)) {
    score += 30;
    reasons.push("Nom du contact dans le libellé");
    hasNameSignal = true;
  } else if (nameFoundIn(invoice.contact.lastName, haystack)) {
    score += 20;
    reasons.push("Nom de famille dans le libellé");
    hasNameSignal = true;
  }
  if (invoice.contact.company && nameFoundIn(invoice.contact.company.name, haystack)) {
    score += 20;
    reasons.push("Société dans le libellé");
    hasNameSignal = true;
  }
  // Même poids que le nom complet du contact, et pour la même raison : sur
  // une facture subrogée, le financeur EST le payeur. C'est le seul nom qui
  // a une chance d'apparaître dans le libellé.
  if (invoice.funder && funderFoundIn(invoice.funder.name, haystack)) {
    score += 30;
    reasons.push("Financeur dans le libellé");
    hasNameSignal = true;
  }

  const remainingCents = invoice.amountCents - invoice.paidCents;
  if (remainingCents === tx.amountCents) {
    score += 60;
    reasons.push("Montant exact");
  } else if (hasNameSignal && tx.amountCents > 0 && tx.amountCents < remainingCents) {
    // Never larger: nobody pays more than an invoice asks for by transfer.
    score += 15;
    reasons.push("Paiement partiel plausible");
  }

  // Date is only ever a refinement on top of a real amount/name signal —
  // "booked after the invoice existed" is true for almost every genuine
  // transaction, so counting it on its own would give every invoice in the
  // organization a nonzero score and defeat the score > 0 filter below.
  if (score > 0 && tx.bookedAt.getTime() >= invoice.createdAt.getTime()) {
    score += 10;
    reasons.push("Postérieur à la facture");
  }

  return { invoiceId: invoice.id, score, reasons };
}

// Sorted best-first, zero-score candidates dropped — an invoice with
// neither a plausible amount nor any name signal isn't worth showing.
export function rankInvoiceMatches(tx: TransactionForMatching, invoices: InvoiceMatchCandidate[]): InvoiceMatch[] {
  return invoices
    .map((invoice) => scoreInvoiceMatch(tx, invoice))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score);
}
