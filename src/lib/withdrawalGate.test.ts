import { describe, it, expect } from "vitest";
import {
  resolveWithdrawalPolicy,
  moduleAccessibleUnderGate,
  resolveWaiverBasis,
  WAIVER_TEXTS,
  WITHDRAWAL_DAYS,
  type WithdrawalGate,
} from "./withdrawalGate";

describe("WITHDRAWAL_DAYS", () => {
  it("vaut 14 — le délai du code de la consommation, pas un réglage produit", () => {
    expect(WITHDRAWAL_DAYS).toBe(14);
  });
});

describe("resolveWithdrawalPolicy", () => {
  it("hérite de l'organisme quand la formation n'a pas tranché", () => {
    expect(resolveWithdrawalPolicy(null, "closed")).toBe("closed");
    expect(resolveWithdrawalPolicy(null, "partial")).toBe("partial");
    expect(resolveWithdrawalPolicy(undefined, "partial")).toBe("partial");
  });

  it("la formation prime quand elle a tranché", () => {
    expect(resolveWithdrawalPolicy("partial", "closed")).toBe("partial");
    expect(resolveWithdrawalPolicy("closed", "partial")).toBe("closed");
  });

  it("null n'ouvre rien : toutes les formations existantes héritent, sans changer de comportement", () => {
    // C'est le point qui compte pour la migration : le champ arrive à null
    // partout, et rien ne doit bouger pour l'existant.
    expect(resolveWithdrawalPolicy(null, "closed")).toBe("closed");
  });
});

const gate = (over: Partial<WithdrawalGate> = {}): WithdrawalGate => ({
  active: true,
  endsAt: new Date("2026-08-19"),
  policy: "closed",
  waived: false,
  ...over,
});

describe("moduleAccessibleUnderGate", () => {
  it("hors délai, tout est ouvert", () => {
    expect(moduleAccessibleUnderGate(gate({ active: false }), { availableDuringWithdrawal: false })).toBe(true);
  });

  it("en politique « closed », rien n'est ouvert — même un module marqué disponible", () => {
    expect(moduleAccessibleUnderGate(gate(), { availableDuringWithdrawal: true })).toBe(false);
  });

  it("en politique « partial », seuls les modules explicitement marqués s'ouvrent", () => {
    const g = gate({ policy: "partial" });
    expect(moduleAccessibleUnderGate(g, { availableDuringWithdrawal: true })).toBe(true);
    expect(moduleAccessibleUnderGate(g, { availableDuringWithdrawal: false })).toBe(false);
  });
});

describe("resolveWaiverBasis", () => {
  const signeLe = new Date("2026-09-01T10:00:00.000Z");

  it("retient le contenu numérique dès qu'il y a de l'e-learning", () => {
    // Le 13° s'applique à cet accès quelle que soit la durée : c'est le
    // support qui le déclenche, pas le calendrier.
    expect(resolveWaiverBasis({ aDuElearning: true, finPrevue: null, signeLe })).toBe("digital_content");
    expect(
      resolveWaiverBasis({ aDuElearning: true, finPrevue: new Date("2027-01-01"), signeLe }),
    ).toBe("digital_content");
  });

  it("retient le service exécuté pour une formation courte sans e-learning", () => {
    // Deux jours de présentiel signés la veille : invoquer le 13° serait mal
    // fondé, il n'y a aucun contenu numérique.
    expect(
      resolveWaiverBasis({ aDuElearning: false, finPrevue: new Date("2026-09-03T17:00:00.000Z"), signeLe }),
    ).toBe("service_completed");
  });

  it("ne propose rien quand la formation déborde du délai sans e-learning", () => {
    // Aucune exception ne joue : le droit de rétractation court, et faire
    // signer une renonciation sans fondement serait pire que ne rien faire.
    expect(
      resolveWaiverBasis({ aDuElearning: false, finPrevue: new Date("2026-10-15T17:00:00.000Z"), signeLe }),
    ).toBeNull();
  });

  it("ne propose rien quand la formation n'est pas datée", () => {
    expect(resolveWaiverBasis({ aDuElearning: false, finPrevue: null, signeLe })).toBeNull();
  });

  it("tient la limite exacte des quatorze jours", () => {
    const pile = new Date(signeLe.getTime() + WITHDRAWAL_DAYS * 24 * 3600 * 1000);
    expect(resolveWaiverBasis({ aDuElearning: false, finPrevue: pile, signeLe })).toBe("service_completed");
    expect(
      resolveWaiverBasis({ aDuElearning: false, finPrevue: new Date(pile.getTime() + 1000), signeLe }),
    ).toBeNull();
  });
});

describe("WAIVER_TEXTS", () => {
  it("cite le bon article dans chaque texte", () => {
    expect(WAIVER_TEXTS.digital_content).toContain("L.221-28, 13°");
    expect(WAIVER_TEXTS.service_completed).toContain("L.221-28, 1°");
  });

  it("annonce la somme proportionnelle sur le fondement du service", () => {
    // C'est la différence qui compte pour l'apprenant : sous le 1°, il peut
    // encore se rétracter avant l'achèvement, mais il doit ce qui a été
    // fourni. Un texte qui l'omet lui cache l'essentiel.
    expect(WAIVER_TEXTS.service_completed).toContain("proportionnelle");
    expect(WAIVER_TEXTS.service_completed).toContain("L.221-25");
  });

  it("préserve les dix jours du Code du travail dans les deux cas", () => {
    // Le délai de l'art. L.6353-5 porte sur l'argent, pas sur l'accès : il
    // survit à la renonciation, et les deux textes doivent le dire.
    expect(WAIVER_TEXTS.digital_content).toContain("L.6353-5");
    expect(WAIVER_TEXTS.service_completed).toContain("L.6353-5");
  });
});
