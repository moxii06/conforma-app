import { describe, expect, it } from "vitest";
import { checkLines, lineTotalCents, linesTotalCents, lineDetailLabel } from "./invoiceLines";

// Ce calcul décide si une facture part avec un détail cohérent. Un écart
// entre le détail et le total est exactement ce qu'un OPCO ou un comptable
// relève — et il se corrige alors facture par facture, à la main.

const LIGNE = { designation: "Formation", quantity: 2, unitPriceCents: 35000 };

describe("totaux", () => {
  it("multiplie quantité et prix unitaire", () => {
    expect(lineTotalCents(LIGNE)).toBe(70000);
  });

  it("arrondit au centime plutôt que de traîner des décimales", () => {
    // 1,5 × 333 = 499,5 centimes : un demi-centime n'existe pas.
    expect(lineTotalCents({ quantity: 1.5, unitPriceCents: 333 })).toBe(500);
  });

  it("additionne les lignes", () => {
    expect(linesTotalCents([LIGNE, { designation: "Support", quantity: 1, unitPriceCents: 5000 }])).toBe(75000);
  });
});

describe("checkLines", () => {
  it("accepte l'absence de détail — une facture à ligne unique reste valable", () => {
    expect(checkLines([], 210000)).toEqual({ ok: true });
  });

  it("accepte un détail qui tombe juste", () => {
    expect(checkLines([LIGNE], 70000)).toEqual({ ok: true });
  });

  it("refuse un écart, même d'un centime", () => {
    const r = checkLines([LIGNE], 70001);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("700,00");
      expect(r.error).toContain("700,01");
    }
  });

  it("refuse une désignation vide", () => {
    const r = checkLines([{ ...LIGNE, designation: "   " }], 70000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("désignation");
  });

  it("refuse une quantité nulle ou négative", () => {
    expect(checkLines([{ ...LIGNE, quantity: 0 }], 0).ok).toBe(false);
    expect(checkLines([{ ...LIGNE, quantity: -1 }], -35000).ok).toBe(false);
  });

  it("refuse un prix unitaire non entier — les centimes sont des entiers", () => {
    expect(checkLines([{ ...LIGNE, unitPriceCents: 350.5 }], 701).ok).toBe(false);
  });

  it("nomme la ligne fautive", () => {
    const r = checkLines([LIGNE, { ...LIGNE, designation: "" }], 140000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Ligne 2");
  });
});

describe("lineDetailLabel", () => {
  it("écrit le détail tel qu'il se lit sur le document", () => {
    expect(lineDetailLabel({ designation: "x", quantity: 3, unitPriceCents: 35000, unit: "jours" })).toBe(
      "3 jours × 350,00 €",
    );
  });

  it("n'écrit pas « 1 × » quand il n'y a ni quantité ni unité qui parlent", () => {
    //   : l'espace insécable fine des milliers en typographie française,
    // ce que produit toLocaleString("fr-FR"). Une espace ordinaire ici ferait
    // passer le test pour un bug de formatage alors qu'il n'y en a pas.
    expect(lineDetailLabel({ designation: "x", quantity: 1, unitPriceCents: 210000 })).toBe("2 100,00 €");
  });

  it("garde l'unité même à un seul exemplaire", () => {
    expect(lineDetailLabel({ designation: "x", quantity: 1, unitPriceCents: 35000, unit: "stagiaire" })).toBe(
      "1 stagiaire × 350,00 €",
    );
  });
});
