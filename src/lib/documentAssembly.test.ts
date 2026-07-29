import { describe, expect, it } from "vitest";
import { blockMatches, collectQuestionKeys, assembleBlocks, parseConditions, type TemplateBlock } from "./documentAssembly";

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
