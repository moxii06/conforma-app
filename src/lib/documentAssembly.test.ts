import { describe, expect, it } from "vitest";
import {
  blockMatches,
  collectQuestionKeys,
  assembleBlocks,
  parseConditions,
  CLAUSES_PALETTE,
  CLAUSE_PALETTE_BY_ID,
  clausePaletteDuBloc,
  type TemplateBlock,
} from "./documentAssembly";
import { QUESTION_BY_KEY } from "./documentQuestionnaire";

describe("parseConditions", () => {
  it("parses a well-formed conditions array", () => {
    expect(parseConditions([{ questionKey: "modalite", in: ["REMOTE", "HYBRID"] }])).toEqual([
      { questionKey: "modalite", in: ["REMOTE", "HYBRID"] },
    ]);
  });

  it("treats null, malformed, or empty-in-list entries as no conditions", () => {
    expect(parseConditions(null)).toEqual([]);
    expect(parseConditions(undefined)).toEqual([]);
    expect(parseConditions("not-an-array")).toEqual([]);
    expect(parseConditions([{ questionKey: "modalite" }])).toEqual([]);
    expect(parseConditions([{ questionKey: "modalite", in: [] }])).toEqual([]);
  });
});

describe("blockMatches", () => {
  it("always matches when there are no conditions", () => {
    expect(blockMatches(null, {})).toBe(true);
    expect(blockMatches([], { modalite: "REMOTE" })).toBe(true);
  });

  it("matches when the answer is in the accepted list", () => {
    expect(blockMatches([{ questionKey: "modalite", in: ["REMOTE", "HYBRID"] }], { modalite: "REMOTE" })).toBe(true);
  });

  it("does not match when the answer is outside the accepted list", () => {
    expect(blockMatches([{ questionKey: "modalite", in: ["REMOTE"] }], { modalite: "IN_PERSON" })).toBe(false);
  });

  it("does not match when the referenced question has no answer at all", () => {
    expect(blockMatches([{ questionKey: "modalite", in: ["REMOTE"] }], {})).toBe(false);
  });

  it("ANDs multiple conditions — every one must hold", () => {
    const conditions = [
      { questionKey: "statutApprenant", in: ["individual"] },
      { questionKey: "modalite", in: ["REMOTE"] },
    ];
    expect(blockMatches(conditions, { statutApprenant: "individual", modalite: "REMOTE" })).toBe(true);
    expect(blockMatches(conditions, { statutApprenant: "individual", modalite: "IN_PERSON" })).toBe(false);
  });
});

describe("collectQuestionKeys", () => {
  it("collects the unique set of keys referenced across all blocks", () => {
    const blocks: TemplateBlock[] = [
      { order: 0, bodyText: "intro", conditions: null },
      { order: 1, bodyText: "a", conditions: [{ questionKey: "modalite", in: ["REMOTE"] }] },
      { order: 2, bodyText: "b", conditions: [{ questionKey: "modalite", in: ["IN_PERSON"] }] },
      { order: 3, bodyText: "c", conditions: [{ questionKey: "subrogation", in: ["oui"] }] },
    ];
    expect(collectQuestionKeys(blocks).sort()).toEqual(["modalite", "subrogation"]);
  });

  it("returns an empty array for a fully unconditional template", () => {
    expect(collectQuestionKeys([{ order: 0, bodyText: "intro", conditions: null }])).toEqual([]);
  });
});

describe("assembleBlocks", () => {
  it("includes unconditional blocks and excludes non-matching conditional ones, in order", () => {
    const blocks: TemplateBlock[] = [
      { order: 2, bodyText: "Clause distance", conditions: [{ questionKey: "modalite", in: ["REMOTE"] }] },
      { order: 0, bodyText: "Préambule", conditions: null },
      { order: 1, bodyText: "Clause présentiel", conditions: [{ questionKey: "modalite", in: ["IN_PERSON"] }] },
    ];
    const result = assembleBlocks(blocks, { modalite: "REMOTE" });
    expect(result).toBe("Préambule\n\nClause distance");
  });

  it("produces an empty string when nothing matches and there is no fixed content", () => {
    const blocks: TemplateBlock[] = [{ order: 0, bodyText: "x", conditions: [{ questionKey: "modalite", in: ["HYBRID"] }] }];
    expect(assembleBlocks(blocks, { modalite: "REMOTE" })).toBe("");
  });
});

describe("palette de clauses", () => {
  it("ne branche que sur des questions et des options qui existent vraiment", () => {
    for (const clause of CLAUSES_PALETTE) {
      for (const condition of clause.conditions) {
        const question = QUESTION_BY_KEY[condition.questionKey];
        expect(question, `question inconnue pour la clause ${clause.id}`).toBeDefined();
        for (const value of condition.in) {
          expect(
            question.options.some((o) => o.value === value),
            `option « ${value} » inconnue de la question ${condition.questionKey} (clause ${clause.id})`,
          ).toBe(true);
        }
      }
    }
  });

  it("porte des identifiants et des intitulés d'article uniques", () => {
    const ids = CLAUSES_PALETTE.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    const titres = CLAUSES_PALETTE.map((c) => c.bodyText.split("\n", 1)[0]);
    expect(new Set(titres).size).toBe(titres.length);
  });

  it("reconnaît une clause de palette dans un bloc, y compris après réécriture du corps", () => {
    const clause = CLAUSE_PALETTE_BY_ID.echeancier;
    expect(clausePaletteDuBloc(clause.bodyText)).toBe("echeancier");
    const corpsReecrit = `${clause.bodyText.split("\n", 1)[0]}\n\nNotre propre rédaction.`;
    expect(clausePaletteDuBloc(corpsReecrit)).toBe("echeancier");
  });

  it("ne revendique pas un paragraphe dont l'intitulé a été changé, ni un bloc vide", () => {
    expect(clausePaletteDuBloc("Article 15 — Notre échéancier\n\nTexte.")).toBeNull();
    expect(clausePaletteDuBloc("")).toBeNull();
  });
});
