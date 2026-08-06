import { describe, expect, it } from "vitest";
import { TASK_THEMES, themeOf, themeDemande, libelleTheme, KINDS_CLASSES } from "./dashboardTaskThemes";

// L'exhaustivité n'est plus un test : DashboardTask["kind"] se DÉDUIT de
// cette table, donc un type de tâche non rangé ne compile pas. Ce qui reste
// à vérifier, c'est ce que le compilateur ne dit pas — l'unicité, l'ordre,
// et le fait que les bonnes tâches sont dans la bonne pile.

describe("TASK_THEMES", () => {
  it("ne range jamais un type dans deux piles", () => {
    expect(new Set(KINDS_CLASSES).size).toBe(KINDS_CLASSES.length);
  });

  it("met l'argent en tête", () => {
    // L'ordre est le message : c'est la pile dont l'échéance est tenue par
    // quelqu'un d'autre.
    expect(TASK_THEMES[0].key).toBe("argent");
  });

  it("range les tâches financières ensemble", () => {
    expect(themeOf("invoice_overdue")).toBe("argent");
    expect(themeOf("session_uninvoiced")).toBe("argent");
    expect(themeOf("bank_transaction_pending")).toBe("argent");
    expect(themeOf("funding_agreement_expiring")).toBe("argent");
  });

  it("ne confond pas une échéance Qualiopi avec de l'argent", () => {
    expect(themeOf("qualiopi_audit_upcoming")).toBe("conformite");
    expect(themeOf("convocation")).toBe("pedagogie");
  });
});

describe("themeDemande", () => {
  it("accepte une pile connue", () => {
    expect(themeDemande("argent")).toBe("argent");
  });

  it("rend null pour tout le reste — un paramètre d'URL n'est pas une erreur", () => {
    expect(themeDemande(null)).toBeNull();
    expect(themeDemande(undefined)).toBeNull();
    expect(themeDemande("")).toBeNull();
    expect(themeDemande("finances")).toBeNull();
  });
});

describe("libelleTheme", () => {
  it("rend le libellé affiché", () => {
    expect(libelleTheme("argent")).toBe("Argent");
    expect(libelleTheme("conformite")).toBe("Conformité");
  });
});
