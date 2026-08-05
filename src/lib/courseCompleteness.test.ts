import { describe, it, expect } from "vitest";
import { coursMisses, compterManques, type CourseCompletenessInput } from "./courseCompleteness";

const COMPLETE: CourseCompletenessInput = {
  durationHours: 14,
  priceCents: 140000,
  prerequisites: "Niveau A2",
  accessModalities: "Inscription en ligne",
  accessDelay: "15 jours",
  teachingMethods: "Ateliers et mises en situation",
  evaluationModalities: "Quiz final",
};

const ou = (over: Partial<CourseCompletenessInput>) => ({ ...COMPLETE, ...over });

describe("coursMisses", () => {
  it("ne signale rien quand tout est rempli", () => {
    expect(coursMisses(COMPLETE)).toEqual([]);
    expect(compterManques(coursMisses(COMPLETE))).toBe(0);
  });

  it("groupe par conséquence, pas par champ", () => {
    const g = coursMisses(ou({ prerequisites: null, accessModalities: null, priceCents: null }));
    expect(g.map((x) => x.blocage)).toEqual(["publication", "contrat"]);
    expect(g[0].champs.map((c) => c.libelle)).toEqual(["prérequis", "modalités d'accès"]);
    expect(g[1].champs.map((c) => c.libelle)).toEqual(["prix de la formation"]);
  });

  it("n'affiche pas un groupe sans manque", () => {
    const g = coursMisses(ou({ durationHours: null }));
    expect(g).toHaveLength(1);
    expect(g[0].blocage).toBe("bpf");
  });

  it("compte les manques et non les groupes", () => {
    const g = coursMisses(ou({ prerequisites: null, accessDelay: null, durationHours: null }));
    expect(g).toHaveLength(2);
    expect(compterManques(g)).toBe(3);
  });

  it("traite une chaîne d'espaces comme vide — un champ effacé n'est pas rempli", () => {
    expect(coursMisses(ou({ prerequisites: "   " }))[0].champs[0].libelle).toBe("prérequis");
  });

  it("un prix de zéro est une décision, pas un oubli : une formation gratuite ne manque de rien", () => {
    expect(coursMisses(ou({ priceCents: 0 }))).toEqual([]);
  });

  it("les cinq items de l'indicateur 1 remontent ensemble sous « publication »", () => {
    const g = coursMisses({
      durationHours: 7,
      priceCents: 50000,
      prerequisites: null,
      accessModalities: null,
      accessDelay: null,
      teachingMethods: null,
      evaluationModalities: null,
    });
    expect(g).toHaveLength(1);
    expect(g[0].blocage).toBe("publication");
    expect(g[0].champs).toHaveLength(5);
  });

  it("l'ordre des groupes suit l'urgence : publication, puis contrat, puis BPF", () => {
    const g = coursMisses({
      durationHours: null,
      priceCents: null,
      prerequisites: null,
      accessModalities: "ok",
      accessDelay: "ok",
      teachingMethods: "ok",
      evaluationModalities: "ok",
    });
    expect(g.map((x) => x.blocage)).toEqual(["publication", "contrat", "bpf"]);
  });

  it("chaque manque porte une ancre pour ouvrir le bon champ", () => {
    for (const groupe of coursMisses({
      durationHours: null,
      priceCents: null,
      prerequisites: null,
      accessModalities: null,
      accessDelay: null,
      teachingMethods: null,
      evaluationModalities: null,
    })) {
      for (const champ of groupe.champs) {
        expect(champ.ancre).toMatch(/^\?tab=resume#\w+$/);
      }
    }
  });
});
