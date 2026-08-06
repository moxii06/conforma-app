import { describe, expect, it } from "vitest";
import {
  vendAuxParticuliers,
  rappelMediationDu,
  etapeMediationFaite,
  prochainRappel,
  messageMediation,
  REPORT_MEDIATION_JOURS,
} from "./mediationConsommation";

const AUCUN = { contratsParticulier: 0, facturesFondsPropres: 0 };
const UN_CONTRAT = { contratsParticulier: 1, facturesFondsPropres: 0 };
const AUJOURD_HUI = new Date("2026-08-06T10:00:00.000Z");

describe("vendAuxParticuliers", () => {
  it("suffit d'un seul acte", () => {
    expect(vendAuxParticuliers(UN_CONTRAT)).toBe(true);
    expect(vendAuxParticuliers({ contratsParticulier: 0, facturesFondsPropres: 1 })).toBe(true);
  });

  it("est faux pour un organisme uniquement professionnel", () => {
    expect(vendAuxParticuliers(AUCUN)).toBe(false);
  });
});

describe("rappelMediationDu", () => {
  it("ne rappelle rien à un organisme uniquement professionnel", () => {
    // Le point de tout ce fichier : une alerte mensuelle sur une obligation
    // qui ne le concerne pas décrédibilise toutes les autres.
    expect(
      rappelMediationDu({ mediateurRenseigne: false, signal: AUCUN, reporteJusquA: null }, AUJOURD_HUI),
    ).toBe(false);
  });

  it("rappelle dès qu'un particulier est en jeu et que le médiateur manque", () => {
    expect(
      rappelMediationDu({ mediateurRenseigne: false, signal: UN_CONTRAT, reporteJusquA: null }, AUJOURD_HUI),
    ).toBe(true);
  });

  it("se tait quand le médiateur est renseigné", () => {
    expect(
      rappelMediationDu({ mediateurRenseigne: true, signal: UN_CONTRAT, reporteJusquA: null }, AUJOURD_HUI),
    ).toBe(false);
  });

  it("se tait le temps du report, et revient à son expiration", () => {
    const dansUneSemaine = new Date("2026-08-13T10:00:00.000Z");
    const hier = new Date("2026-08-05T10:00:00.000Z");
    expect(
      rappelMediationDu({ mediateurRenseigne: false, signal: UN_CONTRAT, reporteJusquA: dansUneSemaine }, AUJOURD_HUI),
    ).toBe(false);
    expect(
      rappelMediationDu({ mediateurRenseigne: false, signal: UN_CONTRAT, reporteJusquA: hier }, AUJOURD_HUI),
    ).toBe(true);
  });
});

describe("etapeMediationFaite", () => {
  it("ne se coche que si le médiateur est renseigné — un report ne coche rien", () => {
    expect(etapeMediationFaite({ mediateurRenseigne: true })).toBe(true);
    expect(etapeMediationFaite({ mediateurRenseigne: false })).toBe(false);
  });
});

describe("prochainRappel", () => {
  it("repousse d'un mois", () => {
    const d = prochainRappel(AUJOURD_HUI);
    expect(Math.round((d.getTime() - AUJOURD_HUI.getTime()) / (24 * 3600 * 1000))).toBe(REPORT_MEDIATION_JOURS);
  });
});

describe("messageMediation", () => {
  it("informe l'organisme professionnel sans l'alarmer", () => {
    const m = messageMediation({ mediateurRenseigne: false, signal: AUCUN, reporteJusquA: null });
    expect(m).toContain("dès votre premier contrat avec un particulier");
    expect(m).not.toContain("Vous avez des clients particuliers");
  });

  it("nomme le manquement quand il y a des particuliers", () => {
    const m = messageMediation({ mediateurRenseigne: false, signal: UN_CONTRAT, reporteJusquA: null });
    expect(m).toContain("obligatoire");
    expect(m).toContain("L.612-1");
  });

  it("confirme quand c'est fait", () => {
    const m = messageMediation({ mediateurRenseigne: true, signal: UN_CONTRAT, reporteJusquA: null });
    expect(m).toContain("renseigné");
  });
});
