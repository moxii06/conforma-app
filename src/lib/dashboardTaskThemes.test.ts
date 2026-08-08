import { describe, expect, it } from "vitest";
import {
  TASK_THEMES,
  themeOf,
  themeDemande,
  libelleTheme,
  tacheRejetable,
  KINDS_AGREGES,
  KINDS_CLASSES,
} from "./dashboardTaskThemes";

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

describe("tacheRejetable", () => {
  it("refuse la croix aux lignes agrégées", () => {
    // Leur `id` est une constante : le rejet vaudrait pour toutes les
    // occurrences futures, à la portée de l'organisme et sans retour arrière.
    expect(tacheRejetable("bank_transaction_pending")).toBe(false);
    expect(tacheRejetable("qualiopi_certificate_expiring")).toBe(false);
    expect(tacheRejetable("qualiopi_audit_upcoming")).toBe(false);
    expect(tacheRejetable("mediator_missing")).toBe(false);
  });

  it("laisse la croix aux tâches qui désignent un enregistrement", () => {
    expect(tacheRejetable("invoice_overdue")).toBe(true);
    expect(tacheRejetable("dossier_prep_contract")).toBe(true);
    expect(tacheRejetable("email_assigned")).toBe(true);
  });

  it("ne liste que des kinds réellement rangés dans une pile", () => {
    // Une faute de frappe dans KINDS_AGREGES rendrait la croix à une ligne
    // agrégée sans que rien ne le signale à l'écran.
    for (const kind of KINDS_AGREGES) expect(KINDS_CLASSES).toContain(kind);
  });
});
