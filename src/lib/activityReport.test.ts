import { describe, it, expect } from "vitest";
import { buildActivityRow } from "./activityReport";

const LECON = { id: "m1", type: "video", quiz: null };
const LECON2 = { id: "m2", type: "video", quiz: null };
const QUIZ = { id: "m3", type: "quiz", quiz: { id: "q1" } };

function ligne(over: Partial<Parameters<typeof buildActivityRow>[0]> = {}) {
  return buildActivityRow({
    contactName: "Marie Dupont",
    modules: [LECON],
    progress: [],
    quizAttempts: [],
    firstAccessedAt: null,
    certificateIssuedAt: null,
    ...over,
  });
}

describe("buildActivityRow", () => {
  it("un apprenant qui n'a jamais ouvert son espace est « jamais commencé »", () => {
    const r = ligne();
    expect(r.status).toBe("not_started");
    expect(r.lastActivityAt).toBeNull();
    expect(r.percent).toBe(0);
  });

  it("un module assigné mais pas entamé reste « en cours » dès qu'il y a eu un accès", () => {
    const r = ligne({
      progress: [{ moduleId: "m1", percentComplete: 0, lastEventAt: null }],
      firstAccessedAt: new Date("2026-03-01T09:00:00Z"),
    });
    expect(r.status).toBe("in_progress");
    expect(r.firstActivityAt).toEqual(new Date("2026-03-01T09:00:00Z"));
  });

  it("tous les modules terminés donnent « terminé » et 100 %", () => {
    const r = ligne({
      modules: [LECON, LECON2],
      progress: [
        { moduleId: "m1", percentComplete: 100, lastEventAt: new Date("2026-03-02T10:00:00Z") },
        { moduleId: "m2", percentComplete: 100, lastEventAt: new Date("2026-03-05T10:00:00Z") },
      ],
      firstAccessedAt: new Date("2026-03-01T09:00:00Z"),
    });
    expect(r.status).toBe("completed");
    expect(r.percent).toBe(100);
    expect(r.modulesCompleted).toBe(2);
  });

  it("la dernière activité est le plus récent de TOUS les horodatages, évaluations comprises", () => {
    const r = ligne({
      modules: [LECON, QUIZ],
      progress: [{ moduleId: "m1", percentComplete: 100, lastEventAt: new Date("2026-03-02T10:00:00Z") }],
      quizAttempts: [{ quizId: "q1", passed: true, scorePercent: 80, submittedAt: new Date("2026-03-09T14:00:00Z") }],
    });
    // Le quiz est postérieur : c'est lui qui date la dernière activité.
    expect(r.lastActivityAt).toEqual(new Date("2026-03-09T14:00:00Z"));
  });

  it("compte les ÉVALUATIONS, pas les tentatives", () => {
    const r = ligne({
      modules: [QUIZ],
      quizAttempts: [
        { quizId: "q1", passed: false, scorePercent: 40, submittedAt: new Date("2026-03-03T10:00:00Z") },
        { quizId: "q1", passed: false, scorePercent: 55, submittedAt: new Date("2026-03-04T10:00:00Z") },
        { quizId: "q1", passed: true, scorePercent: 75, submittedAt: new Date("2026-03-05T10:00:00Z") },
      ],
    });
    // Trois tentatives sur UNE évaluation : le relevé dit 1/1, pas 3.
    expect(r.quizTaken).toBe(1);
    expect(r.quizPassed).toBe(1);
    expect(r.bestScorePercent).toBe(75);
  });

  it("une évaluation échouée compte comme passée mais pas comme réussie", () => {
    const r = ligne({
      modules: [QUIZ],
      quizAttempts: [{ quizId: "q1", passed: false, scorePercent: 30, submittedAt: new Date("2026-03-03T10:00:00Z") }],
    });
    expect(r.quizTaken).toBe(1);
    expect(r.quizPassed).toBe(0);
    expect(r.status).toBe("in_progress");
  });

  it("sans aucune évaluation, le meilleur score est absent — jamais zéro", () => {
    // Zéro se lirait comme « a échoué », alors que la personne n'a rien
    // passé. Même exigence que le BPF : pas de chiffre inventé.
    expect(ligne().bestScorePercent).toBeNull();
  });

  it("une formation sans module ne peut pas être « terminée »", () => {
    // buildCourseProgress renvoie allCompleted=false quand total vaut 0 ;
    // on vérifie que le relevé n'affiche pas « terminé » pour un parcours
    // vide, ce qui délivrerait une preuve de rien.
    const r = ligne({ modules: [], firstAccessedAt: new Date("2026-03-01T09:00:00Z") });
    expect(r.modulesTotal).toBe(0);
    expect(r.status).toBe("in_progress");
  });

  it("reporte la date d'attestation quand elle existe", () => {
    const r = ligne({ certificateIssuedAt: new Date("2026-04-01T08:00:00Z") });
    expect(r.certificateIssuedAt).toEqual(new Date("2026-04-01T08:00:00Z"));
  });
});
