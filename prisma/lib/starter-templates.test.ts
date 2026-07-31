import { describe, expect, it } from "vitest";
import { STARTER_TEMPLATES } from "./starter-templates";
import { QUESTION_BY_KEY, type QuestionKey } from "../../src/lib/documentQuestionnaire";
import { AVAILABLE_MERGE_FIELDS } from "../../src/lib/mergeTemplate";
import { CATEGORY_LABELS } from "../../src/lib/documentCategories";

// This catalogue is plain data, which is exactly why it needs a test: nothing
// in the type system stops a block from branching on a question key that
// doesn't exist, or on an option value the question never offers. Either
// mistake makes `blockMatches` return false forever, so the clause silently
// never appears in a generated contract — no error, no warning, just a
// missing article in a legal document. A merge field typo fails more
// visibly (the raw {{token}} is left in place, see mergeTemplate) but still
// only at generation time, in front of a customer. Both have happened here
// before.

const conditionalTemplates = STARTER_TEMPLATES.filter((t) => t.blocks && t.blocks.length > 0);

function mergeFieldsIn(text: string): string[] {
  return [...text.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]);
}

describe("catalogue de modèles de démarrage", () => {
  it("expose les quatre modèles conditionnels attendus", () => {
    expect(conditionalTemplates.map((t) => t.category).sort()).toEqual([
      "contrat_formation",
      "convention",
      "trainer_contract",
      "video_shoot_contract",
    ]);
  });

  it("n'a pas deux modèles au même titre — le seed déduplique par titre", () => {
    const titles = STARTER_TEMPLATES.map((t) => `${t.category}::${t.title}`);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("n'utilise que des catégories connues de la bibliothèque", () => {
    for (const template of STARTER_TEMPLATES) {
      expect(CATEGORY_LABELS[template.category], `catégorie inconnue: ${template.category}`).toBeDefined();
    }
  });

  it("ne branche que sur des questions du catalogue, avec des options déclarées", () => {
    for (const template of conditionalTemplates) {
      for (const [i, block] of template.blocks!.entries()) {
        for (const condition of block.conditions ?? []) {
          const question = QUESTION_BY_KEY[condition.questionKey as QuestionKey];
          expect(question, `${template.title} — bloc ${i}: question inconnue "${condition.questionKey}"`).toBeDefined();
          const declared = question.options.map((o) => o.value);
          for (const value of condition.in) {
            expect(declared, `${template.title} — bloc ${i}: "${value}" n'est pas une option de ${condition.questionKey}`).toContain(value);
          }
        }
      }
    }
  });

  it("n'utilise que des champs de fusion réels", () => {
    for (const template of STARTER_TEMPLATES) {
      const texts = [template.bodyText, ...(template.blocks ?? []).map((b) => b.bodyText)];
      for (const field of texts.flatMap(mergeFieldsIn)) {
        expect(AVAILABLE_MERGE_FIELDS, `${template.title}: champ de fusion inconnu "{{${field}}}"`).toContain(field);
      }
    }
  });

  it("garde au moins un paragraphe inconditionnel par modèle conditionnel", () => {
    // Otherwise a dossier answering "no" everywhere assembles an empty
    // document rather than a minimal one — worse than a wrong clause,
    // because there is nothing on screen to notice.
    for (const template of conditionalTemplates) {
      const unconditional = template.blocks!.filter((b) => !b.conditions || b.conditions.length === 0);
      expect(unconditional.length, `${template.title} n'a aucun paragraphe systématique`).toBeGreaterThan(0);
    }
  });

  it("ne fait fuiter aucun avertissement interne dans le corps des modèles", () => {
    // L'inverse de l'assertion précédente, et pour une bonne raison : le corps
    // du modèle devient le document envoyé au prospect. L'avertissement
    // « à faire relire par un juriste » s'adresse à l'organisme, pas à son
    // client, et il se lisait en première ligne du recueil des besoins reçu.
    // Il vit maintenant dans l'interface (STARTER_TEMPLATE_NOTICE).
    for (const template of STARTER_TEMPLATES) {
      expect(template.bodyText, `${template.title}`).not.toContain("à faire relire");
      expect(template.bodyText, `${template.title}`).not.toContain("Modèle de démarrage —");
      for (const block of template.blocks ?? []) {
        expect(block.bodyText, `${template.title} — bloc`).not.toContain("à faire relire");
      }
    }
  });
});
