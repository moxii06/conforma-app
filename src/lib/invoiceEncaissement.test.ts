import { describe, expect, it } from "vitest";
import {
  METHODE_SOLDE_AUTOMATIQUE,
  encaissementFacture,
  montantEncaisseCents,
  totalEncaisseCents,
  type FacturePourEncaissement,
} from "./invoiceEncaissement";

// Ce calcul décide de ce qu'affichent « Total payé » sur la fiche contact et
// « X / Y payés » en Facturation. Les deux écrans en donnaient des réponses
// différentes ; les cas ci-dessous sont exactement ceux sur lesquels ils se
// contredisaient.

const MILLE: FacturePourEncaissement = { amountCents: 100_000, status: "SENT", payments: [] };

describe("encaissementFacture", () => {
  it("ne compte rien sur une facture envoyée sans règlement", () => {
    const e = encaissementFacture(MILLE);
    expect(e.encaisseCents).toBe(0);
    expect(e.resteDuCents).toBe(100_000);
    expect(e.deduitDuStatut).toBe(false);
    expect(e.resteDuMalgrePaye).toBe(false);
  });

  it("additionne les règlements partiels et laisse le solde dû", () => {
    const e = encaissementFacture({ ...MILLE, payments: [{ amountCents: 30_000 }, { amountCents: 20_000 }] });
    expect(e.encaisseCents).toBe(50_000);
    expect(e.resteDuCents).toBe(50_000);
  });

  it("solde une facture payée dont les règlements couvrent le montant", () => {
    const e = encaissementFacture({ ...MILLE, status: "PAID", payments: [{ amountCents: 100_000 }] });
    expect(e.encaisseCents).toBe(100_000);
    expect(e.resteDuCents).toBe(0);
    expect(e.deduitDuStatut).toBe(false);
    expect(e.resteDuMalgrePaye).toBe(false);
  });

  it("replie sur le montant de la facture quand elle est payée sans AUCUN règlement", () => {
    // Le cas des données déjà en base, marquées payées avant que « marquer
    // payé » n'écrive un règlement. Sans ce repli, l'historique de tous les
    // clients existants afficherait 0,00 €.
    const e = encaissementFacture({ ...MILLE, status: "PAID" });
    expect(e.encaisseCents).toBe(100_000);
    expect(e.resteDuCents).toBe(0);
    expect(e.deduitDuStatut).toBe(true);
  });

  it("ne replie PAS quand un règlement partiel existe — et signale le solde", () => {
    // 400 € encaissés sur 1 000 €, statut « Payé » forcé à la main : c'est
    // l'information qu'un comptable cherche, pas celle qu'on masque.
    const e = encaissementFacture({ ...MILLE, status: "PAID", payments: [{ amountCents: 40_000 }] });
    expect(e.encaisseCents).toBe(40_000);
    expect(e.resteDuCents).toBe(60_000);
    expect(e.deduitDuStatut).toBe(false);
    expect(e.resteDuMalgrePaye).toBe(true);
  });

  it("ne transforme pas un trop-perçu en dette négative", () => {
    const e = encaissementFacture({ ...MILLE, status: "PAID", payments: [{ amountCents: 120_000 }] });
    expect(e.encaisseCents).toBe(120_000);
    expect(e.resteDuCents).toBe(0);
    expect(e.resteDuMalgrePaye).toBe(false);
  });

  it("ne replie jamais sur un statut autre que « Payé »", () => {
    for (const status of ["DRAFT", "SENT", "SIGNED", "OVERDUE"] as const) {
      expect(encaissementFacture({ ...MILLE, status }).encaisseCents).toBe(0);
      expect(encaissementFacture({ ...MILLE, status }).deduitDuStatut).toBe(false);
    }
  });

  it("reconnaît le règlement écrit par « marquer payé » et lui seul", () => {
    const auto = encaissementFacture({
      ...MILLE,
      status: "PAID",
      payments: [{ amountCents: 100_000, method: METHODE_SOLDE_AUTOMATIQUE }],
    });
    expect(auto.soldeAutomatique).toBe(true);

    const manuel = encaissementFacture({
      ...MILLE,
      status: "PAID",
      payments: [{ amountCents: 100_000, method: "virement (rapprochement bancaire)" }],
    });
    expect(manuel.soldeAutomatique).toBe(false);

    const sansMethode = encaissementFacture({ ...MILLE, status: "PAID", payments: [{ amountCents: 100_000 }] });
    expect(sansMethode.soldeAutomatique).toBe(false);
  });
});

describe("totaux d'une fiche client", () => {
  it("montantEncaisseCents rend la même chose que le détail", () => {
    expect(montantEncaisseCents({ ...MILLE, payments: [{ amountCents: 25_000 }] })).toBe(25_000);
  });

  it("additionne une facture réglée, une ancienne facture payée et une facture en attente", () => {
    const total = totalEncaisseCents([
      { amountCents: 100_000, status: "PAID", payments: [{ amountCents: 100_000 }] },
      // Ancienne donnée : payée, aucun règlement en base — le repli la compte.
      { amountCents: 50_000, status: "PAID", payments: [] },
      { amountCents: 80_000, status: "SENT", payments: [{ amountCents: 20_000 }] },
    ]);
    expect(total).toBe(170_000);
  });

  it("rend zéro sans facture", () => {
    expect(totalEncaisseCents([])).toBe(0);
  });
});
