import { describe, expect, it } from "vitest";
import {
  reviewSchedule,
  compliantSchedule,
  capAppliesTo,
  STATUTORY_FIRST_INSTALMENT_RATIO,
  type Instalment,
} from "./paymentSchedule";

// These figures end up in a signed contract and, when the ceiling is
// exceeded, in a warning the organisation acknowledges in writing. Both
// have to be right: an overstated overshoot cries wolf, an understated one
// lets a stipulation through that is réputée non écrite.

const PRICE = 240000; // 2 400,00 €
const CAP = 72000; // 30 %

function inst(dueDate: string, amountCents: number): Instalment {
  return { dueDate, amountCents };
}

describe("champ d'application du plafond", () => {
  it("ne vise que le contrat conclu avec un particulier", () => {
    expect(capAppliesTo("contrat_formation")).toBe(true);
    // A company may settle a convention in full up front — applying the
    // ceiling there would block a perfectly lawful arrangement.
    expect(capAppliesTo("convention")).toBe(false);
    expect(capAppliesTo("cgv")).toBe(false);
  });
});

describe("revue d'un échéancier", () => {
  it("valide un échéancier conforme", () => {
    const r = reviewSchedule(
      [inst("2026-09-15", CAP), inst("2026-09-30", 56000), inst("2026-10-10", 56000), inst("2026-10-17", 56000)],
      PRICE,
      "contrat_formation",
    );
    expect(r.compliant).toBe(true);
    expect(r.problems).toEqual([]);
    expect(r.overshootCents).toBe(0);
  });

  it("chiffre le dépassement du plafond au centime", () => {
    const r = reviewSchedule([inst("2026-09-15", PRICE)], PRICE, "contrat_formation");
    expect(r.capCents).toBe(CAP);
    expect(r.overshootCents).toBe(PRICE - CAP); // 1 680,00 €
    expect(r.compliant).toBe(false);
    expect(r.problems.join(" ")).toContain("L.6353-6");
  });

  it("ne signale aucun dépassement sur une convention entreprise", () => {
    const r = reviewSchedule([inst("2026-09-15", PRICE)], PRICE, "convention");
    expect(r.overshootCents).toBe(0);
    expect(r.compliant).toBe(true);
  });

  it("détecte un total qui ne tombe pas sur le prix", () => {
    const r = reviewSchedule([inst("2026-09-15", CAP), inst("2026-10-01", 100000)], PRICE, "contrat_formation");
    expect(r.balanceCents).toBe(PRICE - CAP - 100000);
    expect(r.problems.join(" ")).toContain("Il manque");
  });

  it("prend la première échéance dans l'ordre des dates, pas de saisie", () => {
    // Someone types the balance first and the deposit second. The ceiling
    // bears on what is collected FIRST in time, not on the first row.
    const r = reviewSchedule([inst("2026-10-17", 168000), inst("2026-09-15", CAP)], PRICE, "contrat_formation");
    expect(r.firstInstalmentCents).toBe(CAP);
    expect(r.overshootCents).toBe(0);
  });

  it("refuse une échéance nulle ou négative", () => {
    const r = reviewSchedule([inst("2026-09-15", CAP), inst("2026-10-01", 0)], PRICE, "contrat_formation");
    expect(r.problems.join(" ")).toContain("nulle ou négative");
  });

  it("traite le paiement comptant par le dépassement, sans message redondant", () => {
    // A single instalment covering the whole price necessarily breaches a
    // ceiling set at 30 % OF that price. One clear message about the
    // overshoot, not two saying the same thing differently.
    const r = reviewSchedule([inst("2026-09-15", 5000)], 5000, "contrat_formation");
    expect(r.problems).toHaveLength(1);
    expect(r.problems[0]).toContain("L.6353-6");
  });

  it("signale un échéancier vide", () => {
    const r = reviewSchedule([], PRICE, "contrat_formation");
    expect(r.problems.join(" ")).toContain("Aucune échéance");
  });
});

describe("échéancier conforme proposé", () => {
  const start = new Date("2026-09-15T00:00:00Z");
  const end = new Date("2026-10-17T00:00:00Z");

  it("tombe exactement sur le prix, au centime", () => {
    const s = compliantSchedule(PRICE, start, end);
    expect(s.reduce((n, i) => n + i.amountCents, 0)).toBe(PRICE);
  });

  it("respecte le plafond sur la première échéance", () => {
    const s = compliantSchedule(PRICE, start, end);
    expect(s[0].amountCents).toBe(Math.round(PRICE * STATUTORY_FIRST_INSTALMENT_RATIO));
  });

  it("produit un échéancier que la revue valide", () => {
    // The one-click fix must not itself be flagged — otherwise the warning
    // reappears the moment the user accepts the remedy.
    const r = reviewSchedule(compliantSchedule(PRICE, start, end), PRICE, "contrat_formation");
    expect(r.problems).toEqual([]);
    expect(r.compliant).toBe(true);
  });

  it("absorbe l'arrondi sur la dernière échéance", () => {
    // 1 000,01 € : 30 % = 300,00 €, solde 700,01 € sur 3 — indivisible.
    const price = 100001;
    const s = compliantSchedule(price, start, end);
    expect(s.reduce((n, i) => n + i.amountCents, 0)).toBe(price);
    expect(s[s.length - 1].amountCents).toBeGreaterThanOrEqual(s[1].amountCents);
  });

  it("échelonne quel que soit le montant, le plafond étant relatif au prix", () => {
    const s = compliantSchedule(5000, start, end);
    expect(s.reduce((n, i) => n + i.amountCents, 0)).toBe(5000);
    expect(s[0].amountCents).toBe(1500);
    expect(s.length).toBeGreaterThan(1);
  });

  it("ne produit rien pour un prix nul", () => {
    expect(compliantSchedule(0, start, end)).toEqual([]);
  });
});
