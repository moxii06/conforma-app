import { describe, expect, it } from "vitest";
import { scoreInvoiceMatch, rankInvoiceMatches, CONFIDENT_MATCH_THRESHOLD, type InvoiceMatchCandidate } from "./bankReconciliation";

// This is the "suggest, never auto-apply" boundary the whole feature rests
// on (see schema.prisma's BankTransaction comment) — a false-positive
// confident match here means a payment silently gets attached to the wrong
// client's invoice. Wrong-direction errors (missing a real match) are
// annoying; this kind is a real trust problem, so the exact-amount and
// name-matching rules are tested individually, not just end-to-end.

function invoice(overrides: Partial<InvoiceMatchCandidate> = {}): InvoiceMatchCandidate {
  return {
    id: "inv-1",
    reference: "FAC-001",
    amountCents: 90000,
    paidCents: 0,
    createdAt: new Date("2026-06-01"),
    contact: { firstName: "Jean", lastName: "Dupont", company: null },
    ...overrides,
  };
}

describe("scoreInvoiceMatch", () => {
  it("scores highest when amount matches exactly and the contact's name is in the label", () => {
    const tx = { amountCents: 90000, bookedAt: new Date("2026-06-15"), label: "VIR SEPA JEAN DUPONT FORMATION" };
    const match = scoreInvoiceMatch(tx, invoice());
    expect(match.score).toBeGreaterThanOrEqual(CONFIDENT_MATCH_THRESHOLD);
    expect(match.reasons).toContain("Montant exact");
    expect(match.reasons).toContain("Nom du contact dans le libellé");
  });

  it("matches the name regardless of NOM-first word order or accents", () => {
    const tx = { amountCents: 90000, bookedAt: new Date("2026-06-15"), label: "VIR DUPONT JEAN" };
    const match = scoreInvoiceMatch(tx, invoice({ contact: { firstName: "Léa", lastName: "Dupont", company: null } }));
    expect(match.reasons).toContain("Nom de famille dans le libellé");
  });

  it("scores on the remaining balance, not the original amount, for a partially-paid invoice", () => {
    const tx = { amountCents: 40000, bookedAt: new Date("2026-06-15"), label: "VIR DUPONT" };
    const match = scoreInvoiceMatch(tx, invoice({ amountCents: 90000, paidCents: 50000 }));
    expect(match.reasons).toContain("Montant exact");
  });

  it("gives a real but lower score to a plausible partial payment (smaller than what's owed)", () => {
    const tx = { amountCents: 30000, bookedAt: new Date("2026-06-15"), label: "VIR DUPONT" };
    const match = scoreInvoiceMatch(tx, invoice({ amountCents: 90000, paidCents: 0 }));
    expect(match.reasons).toContain("Paiement partiel plausible");
    expect(match.score).toBeLessThan(CONFIDENT_MATCH_THRESHOLD);
  });

  it("never treats a transaction larger than the remaining balance as a partial payment", () => {
    const tx = { amountCents: 95000, bookedAt: new Date("2026-06-15"), label: "VIR DUPONT" };
    const match = scoreInvoiceMatch(tx, invoice({ amountCents: 90000, paidCents: 0 }));
    expect(match.reasons).not.toContain("Paiement partiel plausible");
    expect(match.reasons).not.toContain("Montant exact");
  });

  it("scores zero for an unrelated transaction (no amount or name signal)", () => {
    const tx = { amountCents: 12345, bookedAt: new Date("2026-06-15"), label: "PRELEVEMENT EDF" };
    const match = scoreInvoiceMatch(tx, invoice());
    expect(match.score).toBe(0);
  });

  it("credits company-funded invoices when the employer's name is in the label instead of the learner's", () => {
    const tx = { amountCents: 90000, bookedAt: new Date("2026-06-15"), label: "VIR SEPA ACME CONSEIL SARL" };
    const match = scoreInvoiceMatch(tx, invoice({ contact: { firstName: "Jean", lastName: "Dupont", company: { name: "Acme Conseil" } } }));
    expect(match.reasons).toContain("Société dans le libellé");
  });

  it("does not reward a transaction booked before the invoice existed", () => {
    const tx = { amountCents: 90000, bookedAt: new Date("2026-05-01"), label: "VIR DUPONT" };
    const match = scoreInvoiceMatch(tx, invoice({ createdAt: new Date("2026-06-01") }));
    expect(match.reasons).not.toContain("Postérieur à la facture");
  });
});

describe("rankInvoiceMatches", () => {
  it("sorts candidates best-first and drops zero-score ones", () => {
    const tx = { amountCents: 90000, bookedAt: new Date("2026-06-15"), label: "VIR SEPA JEAN DUPONT" };
    const good = invoice({ id: "inv-good" });
    const unrelated = invoice({ id: "inv-unrelated", amountCents: 50000, contact: { firstName: "Marc", lastName: "Petit", company: null } });
    const weak = invoice({ id: "inv-weak", amountCents: 12000, contact: { firstName: "Léa", lastName: "Petit", company: null } });
    const ranked = rankInvoiceMatches(tx, [unrelated, weak, good]);
    expect(ranked.map((m) => m.invoiceId)).toEqual(["inv-good"]);
  });
});
