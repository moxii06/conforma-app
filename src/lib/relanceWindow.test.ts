import { describe, expect, it } from "vitest";
import { addDays } from "date-fns";
import {
  RELANCE_ANCIENNETE_MAX_JOURS,
  DUREE_ACCES_MAX_JOURS,
  fenetreRelance,
  plancherAnciennete,
  plancherPremierAcces,
} from "./relanceWindow";

// Ce que ces tests protègent : un organisme reprend trois ans d'historique
// dans Jalon, aucune case n'y a jamais été cochée, et le cron du lendemain
// prend tout ce passé pour du retard à relancer. Le dégât n'est pas une
// page lente, ce sont des milliers d'emails partis chez d'anciens
// apprenants — irrattrapables. D'où une date figée plutôt que `new Date()`
// implicite : le comportement doit être vérifiable, pas dépendre du jour
// où la suite tourne.
const MAINTENANT = new Date("2026-08-05T09:00:00.000Z");

// addDays et non une soustraction de millisecondes : ce sont des jours
// CALENDAIRES. Une première version de ces tests retranchait n × 86 400 000
// et échouait d'exactement une heure — 180 jours avant le 5 août tombe
// avant le changement d'heure, et un jour civil ne fait alors pas 24 h. Le
// code avait raison, le test avait tort ; la nuance est consignée ici pour
// qu'elle ne soit pas « corrigée » dans le mauvais sens la prochaine fois.
function joursAvant(n: number): Date {
  return addDays(MAINTENANT, -n);
}

describe("fenetreRelance", () => {
  it("exclut ce qui est trop ancien pour être relancé", () => {
    const { gte } = fenetreRelance(7, MAINTENANT);
    const vieuxDossier = joursAvant(400);
    expect(vieuxDossier.getTime()).toBeLessThan(gte.getTime());
  });

  it("inclut un dossier récent qui a dépassé le délai de la règle", () => {
    const { lte, gte } = fenetreRelance(7, MAINTENANT);
    const dossier = joursAvant(30);
    expect(dossier.getTime()).toBeLessThanOrEqual(lte.getTime());
    expect(dossier.getTime()).toBeGreaterThanOrEqual(gte.getTime());
  });

  it("exclut un dossier trop récent pour le délai de la règle", () => {
    const { lte } = fenetreRelance(7, MAINTENANT);
    const dossier = joursAvant(2);
    expect(dossier.getTime()).toBeGreaterThan(lte.getTime());
  });

  it("garde une fenêtre non vide même pour un délai de règle très long", () => {
    // Un délai de règle supérieur au plancher rendrait la fenêtre vide et
    // désactiverait la règle en silence. À 180 jours de plancher, une règle
    // à 90 jours doit encore pouvoir sélectionner quelque chose.
    const { lte, gte } = fenetreRelance(90, MAINTENANT);
    expect(gte.getTime()).toBeLessThan(lte.getTime());
  });

  it("borne exactement à RELANCE_ANCIENNETE_MAX_JOURS, quel que soit le délai de la règle", () => {
    for (const delai of [0, 7, 30, 90]) {
      expect(fenetreRelance(delai, MAINTENANT).gte.getTime()).toBe(
        joursAvant(RELANCE_ANCIENNETE_MAX_JOURS).getTime()
      );
    }
  });
});

describe("plancherAnciennete", () => {
  it("remonte de six mois", () => {
    expect(plancherAnciennete(MAINTENANT).getTime()).toBe(joursAvant(RELANCE_ANCIENNETE_MAX_JOURS).getTime());
  });
});

describe("plancherPremierAcces", () => {
  it("laisse passer un accès entamé il y a un an sur une formation en continu", () => {
    // Une durée d'accès de 12 mois est courante : un dossier ouvert il y a
    // 365 jours peut légitimement recevoir une relance de fin d'accès.
    // C'est précisément ce que le plancher des six mois aurait coupé, d'où
    // une borne distincte.
    expect(joursAvant(365).getTime()).toBeGreaterThan(plancherPremierAcces(7, MAINTENANT).getTime());
  });

  it("coupe au-delà de la plus longue durée d'accès plausible", () => {
    expect(joursAvant(DUREE_ACCES_MAX_JOURS + 60).getTime()).toBeLessThan(
      plancherPremierAcces(7, MAINTENANT).getTime()
    );
  });

  it("est plus permissif que le plancher générique", () => {
    expect(plancherPremierAcces(7, MAINTENANT).getTime()).toBeLessThan(plancherAnciennete(MAINTENANT).getTime());
  });
});
