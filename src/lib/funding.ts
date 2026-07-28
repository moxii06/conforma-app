// The one place the funding arithmetic lives — same reasoning as
// buildCourseProgress in lib/lms.ts: several screens need "who owes what on
// this dossier" (the dossier's funding section, the invoice form, later the
// BPF breakdown and the expiring-agreement reminders), and three slightly
// different versions of this sum would be three different answers to the
// same question. Pure and unit-tested for that reason.

export type CommitmentStatus = "requested" | "granted" | "refused" | "invoiced" | "paid";

export const COMMITMENT_STATUS_LABELS: Record<CommitmentStatus, string> = {
  requested: "Demandé",
  granted: "Accord obtenu",
  refused: "Refusé",
  invoiced: "Facturé",
  paid: "Payé",
};

export const FUNDER_TYPE_LABELS: Record<string, string> = {
  opco: "OPCO",
  cpf: "CPF (Caisse des Dépôts)",
  france_travail: "France Travail",
  agefice: "AGEFICE",
  company: "Entreprise",
  individual: "Particulier",
  public: "Financeur public",
  other: "Autre",
};

// A commitment counts towards what's actually covered only once the funder
// has said yes. "requested" is an intention — treating it as secured is how
// an OF ends up discovering a hole after the training has already run.
const SECURED: CommitmentStatus[] = ["granted", "invoiced", "paid"];

export type FundingCommitmentInput = {
  amountCents: number;
  status: string;
  subrogation: boolean;
  validUntil?: Date | null;
};

export type FundingSummary = {
  /** Price this enrollment is actually billed at. */
  totalCents: number;
  /** Agreed by funders (granted / invoiced / paid). */
  securedCents: number;
  /** Asked for but not yet agreed — shown apart, never counted as covered. */
  pendingCents: number;
  /** What the client still owes: total − secured. Never negative. */
  remainderCents: number;
  /** Secured AND subrogated: the part invoiced to funders directly. */
  subrogatedCents: number;
  /** True when funders were granted more than the training costs. */
  overCommitted: boolean;
  /** Already-granted commitments whose agreement expires within `days`. */
  expiringSoon: FundingCommitmentInput[];
};

/**
 * A dossier's own negotiated price wins over the course's catalogue price.
 * Null on the dossier means "nothing negotiated, use the catalogue" — which
 * is the common case and what every pre-existing dossier looks like.
 */
export function resolveDossierPriceCents(
  dossier: { agreedPriceCents: number | null },
  course: { priceCents: number | null },
): number {
  return dossier.agreedPriceCents ?? course.priceCents ?? 0;
}

export function computeFundingSummary(
  totalCents: number,
  commitments: FundingCommitmentInput[],
  options?: { now?: Date; expiryWarningDays?: number },
): FundingSummary {
  const now = options?.now ?? new Date();
  const warningDays = options?.expiryWarningDays ?? 30;
  const warningCutoff = new Date(now.getTime() + warningDays * 24 * 60 * 60 * 1000);

  let securedCents = 0;
  let pendingCents = 0;
  let subrogatedCents = 0;
  const expiringSoon: FundingCommitmentInput[] = [];

  for (const c of commitments) {
    const isSecured = SECURED.includes(c.status as CommitmentStatus);
    if (isSecured) {
      securedCents += c.amountCents;
      if (c.subrogation) subrogatedCents += c.amountCents;
      // Only warn on money that is still waiting to arrive: an agreement
      // that already paid out can expire without consequence.
      if (c.status !== "paid" && c.validUntil && c.validUntil <= warningCutoff) {
        expiringSoon.push(c);
      }
    } else if (c.status === "requested") {
      pendingCents += c.amountCents;
    }
    // "refused" contributes to nothing on purpose — it's kept as a record of
    // what was tried, not as a number.
  }

  return {
    totalCents,
    securedCents,
    pendingCents,
    // Clamped: funders granting more than the price is a data-entry mistake,
    // not a credit owed to the learner. It's surfaced via overCommitted
    // instead of showing a negative "reste à charge" nobody can act on.
    remainderCents: Math.max(0, totalCents - securedCents),
    subrogatedCents,
    overCommitted: securedCents > totalCents,
    expiringSoon,
  };
}

export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}
