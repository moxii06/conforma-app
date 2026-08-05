import { describe, it, expect } from "vitest";
import { resolveWithdrawalPolicy, moduleAccessibleUnderGate, WITHDRAWAL_DAYS, type WithdrawalGate } from "./withdrawalGate";

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
