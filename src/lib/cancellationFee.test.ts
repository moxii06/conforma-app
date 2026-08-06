import { describe, expect, it } from "vitest";
import { indemniteApplicable, lireIndemniteParam } from "./cancellationFee";

describe("indemniteApplicable", () => {
  it("laisse jouer la proposition de l'organisme quand le contrat n'a pas d'avis", () => {
    expect(indemniteApplicable(undefined, 30)).toBe(30);
    expect(indemniteApplicable(undefined, null)).toBeNull();
  });

  it("écrase la proposition avec la valeur du contrat", () => {
    expect(indemniteApplicable(15, 30)).toBe(15);
  });

  it("distingue « aucune indemnité » de « pas d'avis »", () => {
    // Le cœur du fichier. Traiter null comme undefined réimposerait le
    // réglage d'organisme à qui vient justement de s'en écarter.
    expect(indemniteApplicable(null, 30)).toBeNull();
    expect(indemniteApplicable(undefined, 30)).toBe(30);
  });
});

describe("lireIndemniteParam", () => {
  it("rend undefined quand le paramètre est absent", () => {
    expect(lireIndemniteParam(null)).toBeUndefined();
  });

  it("rend null pour une chaîne vide — c'est « aucune indemnité »", () => {
    expect(lireIndemniteParam("")).toBeNull();
  });

  it("lit un pourcentage", () => {
    expect(lireIndemniteParam("30")).toBe(30);
    expect(lireIndemniteParam("0")).toBe(0);
    expect(lireIndemniteParam("100")).toBe(100);
  });

  it("retombe sur « pas d'avis » plutôt que d'échouer sur une saisie aberrante", () => {
    // Un aperçu doit s'afficher. La proposition de l'organisme est le repli
    // le moins surprenant.
    expect(lireIndemniteParam("-5")).toBeUndefined();
    expect(lireIndemniteParam("150")).toBeUndefined();
    expect(lireIndemniteParam("abc")).toBeUndefined();
  });

  it("arrondit à l'entier — un contrat ne stipule pas 12,7 %", () => {
    expect(lireIndemniteParam("12.4")).toBe(12);
    expect(lireIndemniteParam("12.6")).toBe(13);
  });
});
