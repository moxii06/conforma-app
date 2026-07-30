import { describe, expect, it } from "vitest";
import { mergeTemplate, buildMergeFields, AVAILABLE_MERGE_FIELDS, type MergeContext } from "./mergeTemplate";

// The substitution half of this engine is hard to get wrong. The calculated
// half is not: it produces the figures a training contract is enforced on —
// the 30 % ceiling of art. L.6353-6, and the cancellation indemnity. An
// arithmetic slip there is not a rendering bug, it is a wrong number in a
// signed document, and nobody re-checks a total the software printed.

// Intl's fr-FR currency format separates the amount from the € with a
// narrow no-break space (U+202F), and which space it uses has changed
// between ICU versions — asserting on the exact codepoint would make these
// tests fail on a Node upgrade for no reason. Only the digits matter here.
function euros(s: string): string {
  return s.replace(/[\s  ]/g, " ");
}

function ctx(overrides: Partial<MergeContext> = {}): MergeContext {
  return {
    contact: { firstName: "Julien", lastName: "Prat", email: "j@x.fr", phone: null },
    organization: { name: "Formations Nova" },
    ...overrides,
  };
}

describe("champs calculés", () => {
  it("plafonne à 30 % du prix de la formation", () => {
    const f = buildMergeFields(ctx({ course: { title: "B2B", durationHours: 21, priceCents: 240000 } }));
    expect(euros(f["funding.cap30"])).toBe(euros("720,00 €"));
  });

  it("préfère le prix négocié du dossier au tarif catalogue", () => {
    // funding.totalCents is what lib/funding.ts resolved for THIS dossier —
    // an agreed price overrides the course list price. A calculated field
    // that ignored it would contradict the funding summary shown elsewhere.
    const f = buildMergeFields(
      ctx({
        course: { title: "B2B", durationHours: 21, priceCents: 240000 },
        funding: { totalCents: 300000, remainderCents: 0 },
      }),
    );
    expect(euros(f["funding.cap30"])).toBe(euros("900,00 €"));
  });

  it("calcule l'indemnité d'annulation à partir du pourcentage de l'organisme", () => {
    const f = buildMergeFields(
      ctx({
        organization: { name: "Formations Nova", cancellationFeePercent: 20 },
        course: { title: "B2B", durationHours: 21, priceCents: 240000 },
      }),
    );
    expect(f["contract.cancellationFeePercent"]).toBe("20 %");
    expect(euros(f["contract.cancellationFeeAmount"])).toBe(euros("480,00 €"));
  });

  it("laisse l'indemnité vide quand l'organisme n'en prévoit pas", () => {
    // null means "no indemnity at all" — the clause carrying it is dropped
    // from the assembled document, so an empty string is never read by anyone.
    const f = buildMergeFields(ctx({ course: { title: "B2B", durationHours: 21, priceCents: 240000 } }));
    expect(f["contract.cancellationFeePercent"]).toBe("");
    expect(f["contract.cancellationFeeAmount"]).toBe("");
  });

  it("n'invente aucun montant sans prix connu", () => {
    const f = buildMergeFields(ctx({ organization: { name: "Nova", cancellationFeePercent: 20 } }));
    expect(f["funding.cap30"]).toBe("");
    expect(f["contract.cancellationFeeAmount"]).toBe("");
  });

  it("arrondit au centime plutôt que de laisser filer les décimales", () => {
    // 1 333,33 € × 30 % = 399,999 € — must not render as "399,999 €".
    const f = buildMergeFields(ctx({ course: { title: "x", durationHours: 1, priceCents: 133333 } }));
    expect(euros(f["funding.cap30"])).toBe(euros("400,00 €"));
  });
});

describe("substitution", () => {
  it("remplace les balises connues et laisse les inconnues intactes", () => {
    const out = mergeTemplate("Bonjour {{contact.firstName}}, {{inconnue}} reste.", ctx());
    expect(out).toBe("Bonjour Julien, {{inconnue}} reste.");
  });

  it("expose les champs restés dormants jusqu'ici", () => {
    const f = buildMergeFields(
      ctx({
        contact: { firstName: "J", lastName: "P", email: "j@x.fr", phone: null, address: "8 allée des Tilleuls" },
        course: {
          title: "B2B",
          durationHours: 21,
          priceCents: null,
          objectives: "Prospecter",
          evaluationModalities: "Quiz",
        },
      }),
    );
    expect(f["contact.address"]).toBe("8 allée des Tilleuls");
    expect(f["course.objectives"]).toBe("Prospecter");
    expect(f["course.evaluationModalities"]).toBe("Quiz");
  });
});

describe("catalogue des champs disponibles", () => {
  it("couvre exactement ce que le moteur sait résoudre", () => {
    // Guards the derivation: the help panel and the resolver used to be two
    // hand-maintained lists, so a field could be offered to the user and
    // then render as a raw {{token}} in a real document.
    expect(new Set(AVAILABLE_MERGE_FIELDS)).toEqual(new Set(Object.keys(buildMergeFields(ctx()))));
  });

  it("annonce les nouveaux champs du contrat", () => {
    for (const key of [
      "funding.cap30",
      "contract.cancellationFeeAmount",
      "course.certificationCode",
      "organization.mediatorName",
      "contact.birthDate",
      "today",
    ]) {
      expect(AVAILABLE_MERGE_FIELDS, key).toContain(key);
    }
  });
});
