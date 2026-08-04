// TEMPORARY — one-shot cleanup for EmailMessage rows synced before the
// htmlToPlainText fix (see mailboxMatching.ts), whose body/snippet still
// carry leftover CSS text (the old regex stripped tags but not <style>
// block *contents*). The original HTML was never persisted, so this can
// only pattern-match the already-mangled plain text: a { ... } span whose
// content is declaration-shaped (or wraps nested rules, i.e. a media
// query) gets removed, along with a real CSS selector list immediately
// before it (class/id/whitelisted-tag names, comma/combinator-joined) —
// never a blind character scan, which can't tell "Daily Bites" from a
// selector. Delete this file (and /api/admin/cleanup-email-css) once
// confirmed applied against every environment that needs it.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TAGS =
  "a|abbr|address|area|article|aside|audio|b|base|bdi|bdo|blockquote|body|br|button|canvas|caption|cite|code|col|colgroup|data|datalist|dd|del|details|dfn|dialog|div|dl|dt|em|embed|fieldset|figcaption|figure|footer|form|h[1-6]|head|header|hr|html|i|iframe|img|input|ins|kbd|label|legend|li|link|main|map|mark|meta|meter|nav|noscript|object|ol|optgroup|option|output|p|param|picture|pre|progress|q|rp|rt|ruby|s|samp|script|section|select|small|source|span|strong|style|sub|summary|sup|table|tbody|td|template|textarea|tfoot|th|thead|time|title|tr|track|u|ul|var|video|wbr|center|font|strike|tt";
const COMPOUND = `(?:\\.[a-zA-Z][\\w-]*|#[a-zA-Z][\\w-]*|\\*|\\[[^\\]{}]{1,60}\\]|\\b(?:${TAGS})\\b)`;
const COMPLEX = `${COMPOUND}(?:\\s*[>+~]?\\s*${COMPOUND})*`;
const SELECTOR_TAIL_RE = new RegExp(`(?:${COMPLEX})(?:\\s*,\\s*(?:${COMPLEX}))*\\s*$`, "i");
const MEDIA_TAIL_RE = /@media[^{}@]{0,300}$/;

function contentLooksLikeCssDeclarations(inner: string): boolean {
  const trimmed = inner.trim();
  if (trimmed.length === 0) return false;
  if (/\{/.test(trimmed)) return true; // nested rule set (media query wrapper)
  return /^(?:[a-zA-Z-]+\s*:\s*[^:;{}]+;?\s*)+$/.test(trimmed);
}

function trimSelectorPreamble(result: string): string {
  const tailWindow = result.slice(-260);
  const mediaMatch = MEDIA_TAIL_RE.exec(tailWindow);
  if (mediaMatch) {
    return result.slice(0, result.length - (tailWindow.length - mediaMatch.index));
  }
  const selMatch = SELECTOR_TAIL_RE.exec(tailWindow);
  if (selMatch && selMatch[0].trim().length > 0) {
    const matchStart = tailWindow.length - selMatch[0].length;
    const boundary = tailWindow.lastIndexOf("}", matchStart - 1);
    const cut = boundary === -1 ? matchStart : Math.max(matchStart, boundary + 1);
    return result.slice(0, result.length - (tailWindow.length - cut));
  }
  return result;
}

function stripLeftoverCssJunk(text: string): string {
  if (!text) return text;
  let result = "";
  let i = 0;
  while (i < text.length) {
    if (text[i] === "{") {
      let depth = 1;
      let j = i + 1;
      for (; j < text.length && depth > 0; j++) {
        if (text[j] === "{") depth++;
        else if (text[j] === "}") depth--;
      }
      const closed = depth === 0;
      const inner = text.slice(i + 1, closed ? j - 1 : j);
      if (closed && contentLooksLikeCssDeclarations(inner)) {
        result = trimSelectorPreamble(result);
        i = j;
        continue;
      }
      result += text[i];
      i++;
      continue;
    }
    result += text[i];
    i++;
  }
  return result.replace(/\s+/g, " ").trim();
}

function looksLikeCssJunk(text: string): boolean {
  if (!text) return false;
  return /\{[^{}]*:[^{}]*;?[^{}]*\}/.test(text) || /@media[^{]{0,200}\{/.test(text);
}

async function main() {
  const candidates = await prisma.emailMessage.findMany({
    where: { OR: [{ body: { contains: "{" } }, { snippet: { contains: "{" } }] },
    select: { id: true, body: true, snippet: true },
  });

  let changed = 0;
  for (const row of candidates) {
    const original = row.body ?? "";
    if (!looksLikeCssJunk(original)) continue;
    const cleanedBody = stripLeftoverCssJunk(original);
    if (cleanedBody === original) continue;
    await prisma.emailMessage.update({
      where: { id: row.id },
      data: { body: cleanedBody, snippet: cleanedBody.slice(0, 140) },
    });
    changed++;
    console.log(`--- ${row.id} ---`);
    console.log("AVANT:", original);
    console.log("APRÈS:", cleanedBody);
    console.log();
  }

  console.log(`${candidates.length} message(s) contenant "{", ${changed} nettoyé(s).`);
}

main()
  .catch((err) => {
    console.error("FAIL:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
