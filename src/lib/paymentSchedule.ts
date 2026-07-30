/**
 * The payment schedule attached to a training contract, and the compliance
 * check that goes with it.
 *
 * Why this is not just "a list of dates and amounts": article L.6353-6 of
 * the Code du travail caps what an organisation may collect from a natural
 * person training at their own expense — no more than 30 % of the agreed
 * price once the withdrawal period has run, the balance staged as the
 * action proceeds. A schedule that exceeds it is not merely unwise: the
 * offending stipulation is *réputée non écrite*, so the learner can reclaim
 * the excess.
 *
 * The organisation is nonetheless free to exceed it — that was an explicit
 * product decision, taken commercially. This module therefore never refuses
 * a schedule. It measures the overshoot precisely so the warning shown can
 * be about money rather than about a statute, and it can propose the
 * compliant alternative in one click.
 *
 * The cap only binds the contract with an individual (`contrat_formation`).
 * A convention with a company may be settled in full up front, and applying
 * the ceiling there would block perfectly lawful arrangements — hence
 * `appliesTo`.
 */

/** Fraction of the price collectable at the first instalment (L.6353-6). */
export const STATUTORY_FIRST_INSTALMENT_RATIO = 0.3;

/** Document categories the ceiling actually governs. */
export function capAppliesTo(category: string): boolean {
  return category === "contrat_formation";
}

export type Instalment = {
  /** ISO date (yyyy-mm-dd) the instalment falls due. */
  dueDate: string;
  amountCents: number;
  label?: string;
};

export type ScheduleReview = {
  totalCents: number;
  /** Difference between the schedule's total and the contract price. */
  balanceCents: number;
  capCents: number;
  firstInstalmentCents: number;
  /** How far the first instalment exceeds the statutory ceiling, 0 when within it. */
  overshootCents: number;
  compliant: boolean;
  /** Human-readable, ordered by how much they matter. */
  problems: string[];
};

function sortByDate(instalments: Instalment[]): Instalment[] {
  return [...instalments].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/**
 * Measures a schedule against the price and, where it applies, against the
 * statutory ceiling. Returns findings; decides nothing.
 */
export function reviewSchedule(
  instalments: Instalment[],
  priceCents: number,
  category: string,
): ScheduleReview {
  const ordered = sortByDate(instalments);
  const totalCents = ordered.reduce((sum, i) => sum + i.amountCents, 0);
  const capCents = Math.round(priceCents * STATUTORY_FIRST_INSTALMENT_RATIO);
  const firstInstalmentCents = ordered[0]?.amountCents ?? 0;
  const applies = capAppliesTo(category);
  const overshootCents = applies ? Math.max(0, firstInstalmentCents - capCents) : 0;

  const problems: string[] = [];
  if (ordered.length === 0) {
    problems.push("Aucune échéance n'est définie.");
  }
  if (totalCents !== priceCents) {
    const gap = totalCents - priceCents;
    problems.push(
      gap > 0
        ? `Le total des échéances dépasse le prix de ${formatEuros(gap)}.`
        : `Il manque ${formatEuros(-gap)} pour atteindre le prix de la formation.`,
    );
  }
  if (ordered.some((i) => i.amountCents <= 0)) {
    problems.push("Une échéance est nulle ou négative.");
  }
  if (overshootCents > 0) {
    problems.push(
      `La première échéance dépasse de ${formatEuros(overshootCents)} le plafond de ${formatEuros(capCents)} ` +
        `fixé par l'article L.6353-6 du Code du travail.`,
    );
  }
  // No separate "the balance must be staged" check: the ceiling is 30 % OF
  // the price, so any single instalment covering the whole price necessarily
  // breaches it and is already reported above. A rule keyed on the number of
  // instalments would only ever fire on a price of zero.

  return {
    totalCents,
    balanceCents: priceCents - totalCents,
    capCents,
    firstInstalmentCents,
    overshootCents,
    compliant: problems.length === 0,
    problems,
  };
}

/**
 * The schedule the organisation gets when it accepts the one-click fix: the
 * statutory maximum up front, then the balance in equal instalments spread
 * across the action. Rounding lands on the last instalment so the total is
 * exactly the price — never a cent adrift in a contract.
 */
export function compliantSchedule(
  priceCents: number,
  startsAt: Date,
  endsAt: Date,
  remainingInstalments = 3,
): Instalment[] {
  if (priceCents <= 0) return [];

  const capCents = Math.round(priceCents * STATUTORY_FIRST_INSTALMENT_RATIO);
  const first: Instalment = { dueDate: iso(startsAt), amountCents: capCents, label: "Acompte (30 %)" };
  // No "small price pays in one go" shortcut: the ceiling is 30 % OF the
  // price, so a price is never below its own cap. Such a branch would only
  // ever run on zero — it was written, and was dead.
  const balance = priceCents - capCents;
  const step = Math.floor(balance / remainingInstalments);
  const spanMs = Math.max(0, endsAt.getTime() - startsAt.getTime());

  const rest: Instalment[] = [];
  for (let n = 1; n <= remainingInstalments; n++) {
    const last = n === remainingInstalments;
    rest.push({
      dueDate: iso(new Date(startsAt.getTime() + (spanMs * n) / remainingInstalments)),
      // The last one absorbs the rounding remainder.
      amountCents: last ? balance - step * (remainingInstalments - 1) : step,
      label: last ? "Solde" : `Échéance ${n}`,
    });
  }
  return [first, ...rest];
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatEuros(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}
