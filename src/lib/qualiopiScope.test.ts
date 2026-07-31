import { describe, expect, it } from "vitest";
import { applicableIndicators, countApprenticeshipIndicators } from "./qualiopiScope";

// Ce filtre décide d'un score de conformité affiché à l'écran et imprimé
// dans le dossier remis à l'auditeur. Se tromper de sens fait disparaître
// des indicateurs qu'un CFA doit couvrir.

const RNQ = [
  { number: 12, scope: "all" },
  { number: 13, scope: "apprentissage" },
  { number: 14, scope: "apprentissage" },
  { number: 15, scope: "apprentissage" },
  { number: 16, scope: "apprentissage" },
  { number: 17, scope: "all" },
  { number: 20, scope: "apprentissage" },
];

describe("applicableIndicators", () => {
  it("retire les indicateurs apprentissage quand l'organisme n'en fait pas", () => {
    const result = applicableIndicators(RNQ, false);
    expect(result.map((i) => i.number)).toEqual([12, 17]);
  });

  it("garde tout pour un organisme qui fait de l'apprentissage", () => {
    expect(applicableIndicators(RNQ, true)).toHaveLength(RNQ.length);
  });

  it("garde tout tant que la question n'a pas été posée — ne jamais masquer par défaut", () => {
    expect(applicableIndicators(RNQ, null)).toHaveLength(RNQ.length);
  });

  it("ne modifie pas le tableau d'origine", () => {
    applicableIndicators(RNQ, false);
    expect(RNQ).toHaveLength(7);
  });

  it("porte le score de 2/7 à 2/2 pour un organisme sans apprentissage", () => {
    // Le bug d'origine : les 5 indicateurs apprentissage restaient au
    // dénominateur, donc un OF qui couvrait tout ce qui le concerne
    // plafonnait à 29 % au lieu de 100 %.
    const covered = new Set([12, 17]);
    const all = RNQ.length;
    const applicable = applicableIndicators(RNQ, false).length;
    expect(Math.round((covered.size / all) * 100)).toBe(29);
    expect(Math.round((covered.size / applicable) * 100)).toBe(100);
  });
});

describe("countApprenticeshipIndicators", () => {
  it("compte les indicateurs réservés à l'apprentissage", () => {
    expect(countApprenticeshipIndicators(RNQ)).toBe(5);
  });

  it("renvoie zéro quand aucun n'est concerné", () => {
    expect(countApprenticeshipIndicators([{ scope: "all" }, { scope: "all" }])).toBe(0);
  });
});
