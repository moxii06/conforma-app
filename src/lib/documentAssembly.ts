import type { QuestionKey } from "@/lib/documentQuestionnaire";

// A block's stored `conditions` is a flat AND of equality checks — see the
// DocumentTemplateBlock schema comment for why this shape (not a general
// expression language) is enough. Read from Prisma as JsonValue, so this
// module is also where the untyped DB value gets validated back into a
// concrete shape.
export type BlockCondition = { questionKey: QuestionKey; in: string[] };

export type TemplateBlock = {
  order: number;
  bodyText: string;
  conditions: unknown;
};

/** Defensive parse of a block's stored `conditions` JSON — malformed or
 * empty data is treated as "always included" rather than thrown away, so a
 * corrupt row can never silently drop a clause from a generated contract. */
export function parseConditions(raw: unknown): BlockCondition[] {
  if (!Array.isArray(raw)) return [];
  const parsed: BlockCondition[] = [];
  for (const entry of raw) {
    if (
      entry &&
      typeof entry === "object" &&
      typeof (entry as Record<string, unknown>).questionKey === "string" &&
      Array.isArray((entry as Record<string, unknown>).in)
    ) {
      const inValues = (entry as { in: unknown[] }).in.filter((v): v is string => typeof v === "string");
      if (inValues.length > 0) {
        parsed.push({ questionKey: (entry as { questionKey: QuestionKey }).questionKey, in: inValues });
      }
    }
  }
  return parsed;
}

/** True when every condition on the block is satisfied by `answers` — an
 * empty condition list (no conditions at all, or a question whose answer
 * isn't known) never silently excludes; only a condition that's actively
 * unmet does. */
export function blockMatches(conditions: unknown, answers: Partial<Record<QuestionKey, string>>): boolean {
  const parsed = parseConditions(conditions);
  return parsed.every((c) => {
    const answer = answers[c.questionKey];
    return answer !== undefined && c.in.includes(answer);
  });
}

/** Every question key referenced by any block's conditions — what the
 * caller needs an answer for before it can assemble this template with
 * confidence. */
export function collectQuestionKeys(blocks: TemplateBlock[]): QuestionKey[] {
  const keys = new Set<QuestionKey>();
  for (const block of blocks) {
    for (const c of parseConditions(block.conditions)) keys.add(c.questionKey);
  }
  return Array.from(keys);
}

/**
 * Filters blocks by `answers`, sorts by order, and joins into a single
 * plain-text body — the exact same shape as a flat DocumentTemplate.bodyText,
 * so every downstream consumer (mergeTemplate, plainTextToHtml, PDF
 * generation) needs no changes to handle an assembled document.
 */
export function assembleBlocks(blocks: TemplateBlock[], answers: Partial<Record<QuestionKey, string>>): string {
  return blocks
    .filter((b) => blockMatches(b.conditions, answers))
    .sort((a, b) => a.order - b.order)
    .map((b) => b.bodyText)
    .join("\n\n");
}
