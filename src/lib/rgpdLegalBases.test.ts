import { describe, expect, it } from "vitest";
import { LEGAL_BASES, labelForLegalBasis, matchLegalBasis, isKnownLegalBasis } from "./rgpdLegalBases";
import { STARTER_REGISTER, STARTER_SUB_PROCESSORS } from "./rgpdStarterRegister";

describe("les six bases légales", () => {
  it("en compte exactement six, celles de l'article 6", () => {
    expect(LEGAL_BASES).toHaveLength(6);
    expect(LEGAL_BASES.map((b) => b.key)).toEqual([
      "contract",
      "legal_obligation",
      "consent",
      "legitimate_interest",
      "public_task",
      "vital_interests",
    ]);
  });

  it("affiche un libellé français pour une clé connue", () => {
    expect(labelForLegalBasis("contract")).toBe("Exécution du contrat");
    expect(labelForLegalBasis("legitimate_interest")).toBe("Intérêt légitime");
  });

  it("rend telle quelle une valeur libre saisie avant la liste", () => {
    // Un registre rempli à la main reste lisible plutôt que de s'afficher
    // vide, ce qui serait pire que du texte imparfait.
    expect(labelForLegalBasis("Parce qu'on en a besoin")).toBe("Parce qu'on en a besoin");
  });

  it("rattache les formulations françaises courantes, accents ou non", () => {
    expect(matchLegalBasis("Exécution du contrat")).toBe("contract");
    expect(matchLegalBasis("execution du contrat")).toBe("contract");
    expect(matchLegalBasis("  OBLIGATION LÉGALE  ")).toBe("legal_obligation");
    expect(matchLegalBasis("Intérêts vitaux")).toBe("vital_interests");
  });

  it("ne devine pas quand rien ne correspond", () => {
    // Requalifier un traitement à tort est exactement ce qu'un registre ne
    // doit pas faire : on préfère laisser la valeur d'origine.
    expect(matchLegalBasis("Historique")).toBeNull();
    expect(matchLegalBasis("")).toBeNull();
  });

  it("reconnaît une clé déjà normalisée", () => {
    expect(isKnownLegalBasis("consent")).toBe(true);
    expect(isKnownLegalBasis("Consentement")).toBe(false);
  });
});

describe("registre type", () => {
  it("n'utilise que des bases légales valides", () => {
    for (const p of STARTER_REGISTER) {
      expect(isKnownLegalBasis(p.legalBasis)).toBe(true);
    }
  });

  it("renseigne toutes les mentions de l'article 30 sur chaque traitement", () => {
    // Un registre type incomplet installerait la non-conformité qu'il est
    // censé corriger.
    for (const p of STARTER_REGISTER) {
      expect(p.purpose.length, p.name).toBeGreaterThan(10);
      expect(p.dataSubjects.length, p.name).toBeGreaterThan(3);
      expect(p.dataCategories.length, p.name).toBeGreaterThan(3);
      expect(p.recipients.length, p.name).toBeGreaterThan(3);
      expect(p.retentionPeriod.length, p.name).toBeGreaterThan(3);
    }
  });

  it("justifie chaque traitement marqué à revoir", () => {
    for (const p of STARTER_REGISTER.filter((x) => x.needsReview)) {
      expect(p.reviewNote, p.name).toBeTruthy();
    }
  });

  it("n'a pas deux traitements du même nom", () => {
    // L'installation est idempotente par le nom : un doublon dans le
    // catalogue rendrait le second inatteignable.
    const noms = STARTER_REGISTER.map((p) => p.name);
    expect(new Set(noms).size).toBe(noms.length);
    const nomsSt = STARTER_SUB_PROCESSORS.map((s) => s.name);
    expect(new Set(nomsSt).size).toBe(nomsSt.length);
  });

  it("couvre les données sensibles que Jalon collecte réellement", () => {
    // Le recueil des besoins pose une question handicap : ces données sont
    // sensibles au sens de l'article 9. Un registre qui les ignore passe à
    // côté du seul traitement à risque de l'organisme.
    const handicap = STARTER_REGISTER.find((p) => p.name.toLowerCase().includes("handicap"));
    expect(handicap).toBeDefined();
    expect(handicap!.legalBasis).toBe("consent");
    expect(handicap!.needsReview).toBe(true);
  });
});
