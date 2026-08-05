import { describe, it, expect } from "vitest";
import { buildCertificate, isAccessExpired, type CertificateInput } from "./certificate";

const COURS = {
  title: "Cybersécurité au quotidien",
  objectives: "Repérer un hameçonnage",
  durationHours: 14,
  evaluationModalities: "Quiz final",
  certificateValidityMonths: null,
};

const MODULE = (id: string, titre: string) => ({ id, type: "video", title: titre, quiz: null });
const QUIZ = (id: string, titre: string, quizId: string) => ({ id, type: "quiz", title: titre, quiz: { id: quizId } });

function entree(over: Partial<CertificateInput> = {}): CertificateInput {
  return {
    organizationName: "Formations Nova",
    learnerName: "Léa Fontaine",
    course: COURS,
    modules: [],
    progress: [],
    quizAttempts: [],
    days: [],
    attendanceEntries: [],
    accessExpired: false,
    now: new Date("2026-08-05T10:00:00Z"),
    ...over,
  };
}

describe("buildCertificate", () => {
  it("refuse quand il n'y a ni module ni journée : rien à attester", () => {
    const r = buildCertificate(entree());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/ni journée d'émargement/);
  });

  it("délivre une attestation de RÉUSSITE quand tous les modules e-learning sont validés", () => {
    const r = buildCertificate(
      entree({
        modules: [MODULE("m1", "Les mots de passe"), MODULE("m2", "Le hameçonnage")],
        progress: [
          { moduleId: "m1", percentComplete: 100 },
          { moduleId: "m2", percentComplete: 100 },
        ],
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.kind).toBe("success");
    expect(r.bodyText).toContain("ATTESTATION DE RÉUSSITE");
    expect(r.title).toBe("Attestation de réussite — Cybersécurité au quotidien — Léa Fontaine");
    expect(r.bodyText).toContain("1. Les mots de passe");
    expect(r.bodyText).toContain("2. Le hameçonnage");
  });

  it("refuse un parcours inachevé tant que la durée d'accès court encore", () => {
    const r = buildCertificate(
      entree({
        modules: [MODULE("m1", "A"), MODULE("m2", "B")],
        progress: [{ moduleId: "m1", percentComplete: 100 }],
        accessExpired: false,
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/pas encore terminés/);
  });

  it("délivre une attestation de FIN DE FORMATION quand la durée est écoulée sans achèvement", () => {
    const r = buildCertificate(
      entree({
        modules: [MODULE("m1", "A"), MODULE("m2", "B"), MODULE("m3", "C")],
        progress: [{ moduleId: "m1", percentComplete: 100 }],
        accessExpired: true,
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.kind).toBe("partial");
    // Le point qui compte : ce n'est jamais une « réussite ».
    expect(r.bodyText).toContain("ATTESTATION DE FIN DE FORMATION");
    expect(r.bodyText).not.toContain("RÉUSSITE");
    expect(r.title).toBe("Attestation de fin de formation — Cybersécurité au quotidien — Léa Fontaine");
  });

  it("l'attestation partielle énonce l'avancement réel et nomme les modules non validés", () => {
    const r = buildCertificate(
      entree({
        modules: [MODULE("m1", "A"), MODULE("m2", "B"), MODULE("m3", "C")],
        progress: [{ moduleId: "m1", percentComplete: 100 }],
        accessExpired: true,
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.bodyText).toContain("1 module(s) validé(s) sur 3");
    expect(r.bodyText).toContain("Le parcours n'a pas été mené à son terme");
    const nonValides = r.bodyText.split("Modules non validés :")[1];
    expect(nonValides).toContain("B");
    expect(nonValides).toContain("C");
  });

  it("écrit « Aucun. » plutôt qu'une liste vide quand rien n'a été validé", () => {
    const r = buildCertificate(
      entree({ modules: [MODULE("m1", "A")], progress: [], accessExpired: true }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.bodyText).toContain("0 module(s) validé(s) sur 1");
    expect(r.bodyText.split("Modules validés :")[1]).toContain("Aucun.");
  });

  it("un quiz réussi vaut module validé, un quiz échoué non", () => {
    const modules = [QUIZ("m1", "Évaluation finale", "q1")];
    const reussi = buildCertificate(entree({ modules, progress: [{ moduleId: "m1", percentComplete: 0 }], quizAttempts: [{ quizId: "q1", passed: true }] }));
    expect(reussi.ok).toBe(true);
    if (reussi.ok) expect(reussi.kind).toBe("success");

    const echoue = buildCertificate(
      entree({
        modules,
        progress: [{ moduleId: "m1", percentComplete: 0 }],
        quizAttempts: [{ quizId: "q1", passed: false }],
        accessExpired: true,
      }),
    );
    expect(echoue.ok).toBe(true);
    if (echoue.ok) expect(echoue.kind).toBe("partial");
  });

  it("sans e-learning, atteste la présence émargée et compte les heures réellement signées", () => {
    const r = buildCertificate(
      entree({
        days: [
          { id: "d1", date: new Date("2026-06-01T08:00:00Z"), morningHours: 3.5, afternoonHours: 3.5 },
          { id: "d2", date: new Date("2026-06-02T08:00:00Z"), morningHours: 3.5, afternoonHours: 3.5 },
        ],
        attendanceEntries: [
          { sessionDayId: "d1", halfDay: "MORNING" },
          { sessionDayId: "d1", halfDay: "AFTERNOON" },
          { sessionDayId: "d2", halfDay: "MORNING" },
        ],
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.kind).toBe("attendance");
    // 3 demi-journées signées sur 4 programmées : 10,5 h sur 14 h.
    expect(r.bodyText).toContain("10.5 heures sur 14.0 heures programmées");
  });

  it("refuse d'attester une présence que personne n'a signée", () => {
    const r = buildCertificate(
      entree({ days: [{ id: "d1", date: new Date("2026-06-01"), morningHours: 3.5, afternoonHours: 3.5 }] }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/Aucun émargement/);
  });

  it("porte la date de fin de validité quand la formation en définit une", () => {
    const r = buildCertificate(
      entree({
        course: { ...COURS, certificateValidityMonths: 24 },
        modules: [MODULE("m1", "A")],
        progress: [{ moduleId: "m1", percentComplete: 100 }],
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.expiresAt?.getFullYear()).toBe(2028);
    expect(r.bodyText).toContain("valable jusqu'au");
  });

  it("n'invente pas de durée : sans heures programmées ni durée catalogue, le bloc légal l'omet", () => {
    const r = buildCertificate(
      entree({
        course: { ...COURS, durationHours: null },
        modules: [MODULE("m1", "A")],
        progress: [{ moduleId: "m1", percentComplete: 100 }],
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.bodyText).not.toContain("Durée de l'action");
  });
});

describe("isAccessExpired", () => {
  const LE_5_AOUT = new Date("2026-08-05T12:00:00Z");

  it("une session à date fixe n'a pas de durée d'accès : jamais expirée", () => {
    expect(isAccessExpired({ accessDurationDays: null, firstAccessedAt: new Date("2020-01-01") }, LE_5_AOUT)).toBe(
      false,
    );
  });

  it("un apprenant qui n'a jamais ouvert sa formation n'a pas d'horloge qui court", () => {
    expect(isAccessExpired({ accessDurationDays: 30, firstAccessedAt: null }, LE_5_AOUT)).toBe(false);
  });

  it("le délai court à partir du premier accès, pas de l'inscription", () => {
    expect(isAccessExpired({ accessDurationDays: 30, firstAccessedAt: new Date("2026-07-20") }, LE_5_AOUT)).toBe(false);
    expect(isAccessExpired({ accessDurationDays: 30, firstAccessedAt: new Date("2026-06-20") }, LE_5_AOUT)).toBe(true);
  });

  it("le jour même de l'échéance compte comme dépassé", () => {
    expect(
      isAccessExpired({ accessDurationDays: 30, firstAccessedAt: new Date("2026-07-06T12:00:00Z") }, LE_5_AOUT),
    ).toBe(true);
  });
});
