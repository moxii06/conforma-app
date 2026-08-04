import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// TEMPORARY — one-shot endpoint to strip leftover CSS text baked into
// EmailMessage.body/snippet for messages synced before the
// htmlToPlainText fix (mailboxMatching.ts). The original HTML was never
// persisted, so this pattern-matches the already-mangled plain text: a
// { ... } span whose content is declaration-shaped (or wraps nested rules,
// i.e. a media query) gets removed, along with a real CSS selector list
// immediately before it — never a blind character scan, which can't tell
// "Daily Bites" from a selector. Verified against local dev data first
// (scripts/cleanup-email-css.ts, same logic, kept in sync by hand for this
// one-shot use). Guarded by a secret header — remove this route (and the
// CLEANUP_EMAIL_CSS_SECRET env var) once confirmed applied.
const TAGS =
  "a|abbr|address|area|article|aside|audio|b|base|bdi|bdo|blockquote|body|br|button|canvas|caption|cite|code|col|colgroup|data|datalist|dd|del|details|dfn|dialog|div|dl|dt|em|embed|fieldset|figcaption|figure|footer|form|h[1-6]|head|header|hr|html|i|iframe|img|input|ins|kbd|label|legend|li|link|main|map|mark|meta|meter|nav|noscript|object|ol|optgroup|option|output|p|param|picture|pre|progress|q|rp|rt|ruby|s|samp|script|section|select|small|source|span|strong|style|sub|summary|sup|table|tbody|td|template|textarea|tfoot|th|thead|time|title|tr|track|u|ul|var|video|wbr|center|font|strike|tt";
const COMPOUND = `(?:\\.[a-zA-Z][\\w-]*|#[a-zA-Z][\\w-]*|\\*|\\[[^\\]{}]{1,60}\\]|\\b(?:${TAGS})\\b)`;
const COMPLEX = `${COMPOUND}(?:\\s*[>+~]?\\s*${COMPOUND})*`;
const SELECTOR_TAIL_RE = new RegExp(`(?:${COMPLEX})(?:\\s*,\\s*(?:${COMPLEX}))*\\s*$`, "i");
const MEDIA_TAIL_RE = /@media[^{}@]{0,300}$/;

function contentLooksLikeCssDeclarations(inner: string): boolean {
  const trimmed = inner.trim();
  if (trimmed.length === 0) return false;
  if (/\{/.test(trimmed)) return true;
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

export async function POST(request: Request) {
  const expected = process.env.CLEANUP_EMAIL_CSS_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "CLEANUP_EMAIL_CSS_SECRET non configuré." }, { status: 503 });
  }
  const provided = request.headers.get("x-cleanup-secret");
  if (provided !== expected) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const candidates = await prisma.emailMessage.findMany({
    where: { OR: [{ body: { contains: "{" } }, { snippet: { contains: "{" } }] },
    select: { id: true, body: true },
  });

  let changed = 0;
  const sample: { id: string; before: string; after: string }[] = [];
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
    if (sample.length < 5) {
      sample.push({ id: row.id, before: original.slice(0, 200), after: cleanedBody.slice(0, 200) });
    }
  }

  return NextResponse.json({ ok: true, scanned: candidates.length, changed, sample });
}
