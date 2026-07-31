import { describe, expect, it } from "vitest";
import { buildSessionClosing, sessionStage, type ClosingDossier } from "./sessionClosing";

// Ce calcul décide de ce qu'un organisme voit avant d'archiver une session.
// Se tromper coûte soit une alerte permanente qu'on apprend à ignorer, soit
// un dossier archivé avec deux preuves sur huit — découvert le jour de
// l'audit.

const JOUR = 24 * 60 * 60 * 1000;

function dossier(over: Partial<ClosingDossier> = {}): ClosingDossier {
  return {
    dossierId: "d1",
    contactName: "Karim Benali",
    needsAssessmentDone: false,
    contractSigned: false,
    convocationSent: false,
    evaluationHotDone: false,
    evaluationColdDone: false,
    certificateIssued: false,
    halfDaysSigned: 0,
    halfDaysExpected: 0,
    ...over,
  };
}

const MAINTENANT = new Date("2026-07-31T10:00:00Z");

describe("sessionStage", () => {
  it("distingue les trois moments d'une session", () => {
    const dans2j = new Date(MAINTENANT.getTime() + 2 * JOUR);
    const ilya2j = new Date(MAINTENANT.getTime() - 2 * JOUR);
    expect(sessionStage(dans2j, new Date(dans2j.getTime() + JOUR), MAINTENANT)).toBe("upcoming");
    expect(sessionStage(ilya2j, new Date(MAINTENANT.getTime() + JOUR), MAINTENANT)).toBe("running");
    expect(sessionStage(ilya2j, new Date(MAINTENANT.getTime() - JOUR), MAINTENANT)).toBe("past");
  });
});

describe("buildSessionClosing", () => {
  it("n'alerte sur rien avant le premier jour", () => {
    // Tout est vide, mais rien n'est encore dû : c'est un reste-à-faire
    // normal, pas un trou. C'est précisément ce que l'ancienne grille ne
    // savait pas dire — elle ne s'affichait pas du tout.
    const debut = new Date(MAINTENANT.getTime() + 5 * JOUR);
    const c = buildSessionClosing([dossier()], debut, new Date(debut.getTime() + JOUR), MAINTENANT);
    expect(c.stage).toBe("upcoming");
    expect(c.missingDue).toBe(0);
    expect(c.readyCount).toBe(1);
    expect(c.rows[0].steps.every((s) => !s.due)).toBe(true);
  });

  it("rend exigibles recueil, contrat et convocation dès le premier jour", () => {
    const debut = new Date(MAINTENANT.getTime() - JOUR);
    const c = buildSessionClosing([dossier()], debut, new Date(MAINTENANT.getTime() + JOUR), MAINTENANT);
    expect(c.stage).toBe("running");
    expect(c.missingDue).toBe(3);
    // Les preuves de sortie ne sont pas encore réclamées.
    const apres = c.rows[0].steps.filter((s) => ["hot", "cold", "certificate"].includes(s.key));
    expect(apres.every((s) => !s.due)).toBe(true);
  });

  it("réclame tout une fois la session terminée", () => {
    const debut = new Date(MAINTENANT.getTime() - 5 * JOUR);
    const c = buildSessionClosing([dossier()], debut, new Date(MAINTENANT.getTime() - JOUR), MAINTENANT);
    expect(c.stage).toBe("past");
    expect(c.missingDue).toBe(6);
    expect(c.readyCount).toBe(0);
  });

  it("compte l'émargement seulement quand des journées sont au calendrier", () => {
    const debut = new Date(MAINTENANT.getTime() - 5 * JOUR);
    const fin = new Date(MAINTENANT.getTime() - JOUR);
    const sansFeuille = buildSessionClosing([dossier()], debut, fin, MAINTENANT);
    expect(sansFeuille.rows[0].steps.some((s) => s.key === "attendance")).toBe(false);

    const avecFeuille = buildSessionClosing(
      [dossier({ halfDaysExpected: 4, halfDaysSigned: 3 })],
      debut,
      fin,
      MAINTENANT,
    );
    const emargement = avecFeuille.rows[0].steps.find((s) => s.key === "attendance");
    expect(emargement?.done).toBe(false);
    expect(emargement?.detail).toBe("3/4 demi-journées signées");
    expect(avecFeuille.missingDue).toBe(7);
  });

  it("considère l'émargement complet quand toutes les demi-journées sont signées", () => {
    const debut = new Date(MAINTENANT.getTime() - 5 * JOUR);
    const c = buildSessionClosing(
      [dossier({ halfDaysExpected: 4, halfDaysSigned: 4 })],
      debut,
      new Date(MAINTENANT.getTime() - JOUR),
      MAINTENANT,
    );
    expect(c.rows[0].steps.find((s) => s.key === "attendance")?.done).toBe(true);
  });

  it("agrège plusieurs apprenants sans les confondre", () => {
    const debut = new Date(MAINTENANT.getTime() - 5 * JOUR);
    const fin = new Date(MAINTENANT.getTime() - JOUR);
    const complet = dossier({
      dossierId: "d2",
      contactName: "Sophie Martin",
      needsAssessmentDone: true,
      contractSigned: true,
      convocationSent: true,
      evaluationHotDone: true,
      evaluationColdDone: true,
      certificateIssued: true,
    });
    const c = buildSessionClosing([dossier(), complet], debut, fin, MAINTENANT);
    expect(c.total).toBe(2);
    expect(c.readyCount).toBe(1);
    expect(c.missingDue).toBe(6);
    expect(c.rows[1].missingDue).toBe(0);
  });
});
