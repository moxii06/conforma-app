import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

// Turns the RichTextEditor's sanitized HTML output into a real PDF —
// client feedback wants actual attachable files, not the plain-text-in-a-
// printable-page approach the toolkit used before. Deliberately not a
// general HTML-to-PDF renderer: the input vocabulary is exactly what
// RichTextEditor's toolbar produces (bold/italic/underline/highlight/font),
// already passed through sanitizeRichText — a small hand-rolled parser is
// safe here and avoids pulling in a headless-browser dependency that
// doesn't run reliably in a Vercel serverless function.

type Run = { text: string; bold: boolean; italic: boolean; underline: boolean; highlight: string | null; fontKey: FontKey };
type FontKey = "sans" | "serif" | "mono";

const FONT_MAP: Record<FontKey, { normal: StandardFonts; bold: StandardFonts; italic: StandardFonts; boldItalic: StandardFonts }> = {
  sans: { normal: StandardFonts.Helvetica, bold: StandardFonts.HelveticaBold, italic: StandardFonts.HelveticaOblique, boldItalic: StandardFonts.HelveticaBoldOblique },
  serif: { normal: StandardFonts.TimesRoman, bold: StandardFonts.TimesRomanBold, italic: StandardFonts.TimesRomanItalic, boldItalic: StandardFonts.TimesRomanBoldItalic },
  mono: { normal: StandardFonts.Courier, bold: StandardFonts.CourierBold, italic: StandardFonts.CourierOblique, boldItalic: StandardFonts.CourierBoldOblique },
};

// "police" in RichTextEditor's <font face="..."> maps to one of these three
// — a fixed, real set backed by fonts pdf-lib actually embeds, rather than
// an arbitrary web-font picker that would silently fall back at PDF time.
function resolveFontKey(face: string | null): FontKey {
  if (!face) return "sans";
  const f = face.toLowerCase();
  if (f.includes("serif") || f.includes("times") || f.includes("georgia")) return "serif";
  if (f.includes("mono") || f.includes("courier") || f.includes("consolas")) return "mono";
  return "sans";
}

function splitIntoParagraphs(html: string): string[] {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .split(/<\/(?:p|div)>/gi)
    .map((chunk) => chunk.replace(/<(?:p|div)[^>]*>/gi, "").trim())
    .filter((chunk) => chunk.length > 0);
}

// Walks one paragraph's inline markup into a flat run list, tracking a
// style stack so nested tags (<b><i>...</i></b>) combine correctly.
function parseInlineRuns(fragment: string): Run[] {
  const runs: Run[] = [];
  const stack: { bold: boolean; italic: boolean; underline: boolean; highlight: string | null; fontKey: FontKey }[] = [
    { bold: false, italic: false, underline: false, highlight: null, fontKey: "sans" },
  ];
  const tagPattern = /<(\/?)(\w+)([^>]*)>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  function pushText(text: string) {
    const decoded = text
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    if (!decoded) return;
    const top = stack[stack.length - 1];
    runs.push({ text: decoded, ...top });
  }

  while ((match = tagPattern.exec(fragment)) !== null) {
    pushText(fragment.slice(lastIndex, match.index));
    lastIndex = tagPattern.lastIndex;
    const [, closing, tagName, attrs] = match;
    const tag = tagName.toLowerCase();
    const top = { ...stack[stack.length - 1] };

    if (closing) {
      if (stack.length > 1) stack.pop();
      continue;
    }

    // Void elements (self-closing, e.g. an <img/> from a signature that got
    // pasted somewhere it shouldn't have) have no matching close tag — this
    // generator draws text only, so they're skipped entirely rather than
    // pushed onto the stack, which would otherwise never get popped and
    // would corrupt styling for the rest of the paragraph.
    if (tag === "img" || attrs.trimEnd().endsWith("/")) continue;

    if (tag === "b" || tag === "strong") top.bold = true;
    else if (tag === "i" || tag === "em") top.italic = true;
    else if (tag === "u") top.underline = true;
    else if (tag === "mark") top.highlight = "#FFF3A0";
    else if (tag === "span" || tag === "font" || tag === "p" || tag === "div") {
      const bgMatch = attrs.match(/background-color:\s*([^;"]+)/i);
      if (bgMatch) top.highlight = bgMatch[1].trim();
      const fontFamilyMatch = attrs.match(/font-family:\s*([^;"]+)/i) || attrs.match(/face="([^"]+)"/i);
      if (fontFamilyMatch) top.fontKey = resolveFontKey(fontFamilyMatch[1]);
      const weightMatch = attrs.match(/font-weight:\s*(bold|[6-9]00)/i);
      if (weightMatch) top.bold = true;
      const styleMatch = attrs.match(/font-style:\s*italic/i);
      if (styleMatch) top.italic = true;
      const decorationMatch = attrs.match(/text-decoration:\s*underline/i);
      if (decorationMatch) top.underline = true;
    }
    stack.push(top);
  }
  pushText(fragment.slice(lastIndex));
  return runs;
}

function hexToRgb(color: string): { r: number; g: number; b: number } {
  const hex = color.replace("#", "");
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex.padEnd(6, "0");
  const num = parseInt(full, 16);
  return { r: ((num >> 16) & 255) / 255, g: ((num >> 8) & 255) / 255, b: (num & 255) / 255 };
}

const PAGE_WIDTH = 595.28; // A4 at 72dpi
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;
const FONT_SIZE = 11;
const LINE_HEIGHT = 15;

function pickFont(fonts: Record<FontKey, { normal: PDFFont; bold: PDFFont; italic: PDFFont; boldItalic: PDFFont }>, run: Run): PDFFont {
  const set = fonts[run.fontKey];
  if (run.bold && run.italic) return set.boldItalic;
  if (run.bold) return set.bold;
  if (run.italic) return set.italic;
  return set.normal;
}

export async function generatePdfFromRichText(title: string, bodyHtml: string): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const embedded: Record<FontKey, { normal: PDFFont; bold: PDFFont; italic: PDFFont; boldItalic: PDFFont }> = {
    sans: {
      normal: await doc.embedFont(FONT_MAP.sans.normal),
      bold: await doc.embedFont(FONT_MAP.sans.bold),
      italic: await doc.embedFont(FONT_MAP.sans.italic),
      boldItalic: await doc.embedFont(FONT_MAP.sans.boldItalic),
    },
    serif: {
      normal: await doc.embedFont(FONT_MAP.serif.normal),
      bold: await doc.embedFont(FONT_MAP.serif.bold),
      italic: await doc.embedFont(FONT_MAP.serif.italic),
      boldItalic: await doc.embedFont(FONT_MAP.serif.boldItalic),
    },
    mono: {
      normal: await doc.embedFont(FONT_MAP.mono.normal),
      bold: await doc.embedFont(FONT_MAP.mono.bold),
      italic: await doc.embedFont(FONT_MAP.mono.italic),
      boldItalic: await doc.embedFont(FONT_MAP.mono.boldItalic),
    },
  };

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let cursorY = PAGE_HEIGHT - MARGIN;

  function newPage() {
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    cursorY = PAGE_HEIGHT - MARGIN;
  }

  function ensureSpace() {
    if (cursorY < MARGIN + LINE_HEIGHT) newPage();
  }

  // Title, always plain bold sans — the document's own formatting starts below it.
  const titleFont = embedded.sans.bold;
  const titleSize = 15;
  page.drawText(title, { x: MARGIN, y: cursorY, size: titleSize, font: titleFont, color: rgb(0.1, 0.14, 0.19) });
  cursorY -= titleSize + 14;

  const maxWidth = PAGE_WIDTH - MARGIN * 2;

  for (const paragraph of splitIntoParagraphs(bodyHtml)) {
    const runs = parseInlineRuns(paragraph);
    // Flatten into word-level tokens carrying their run's style, so a line
    // can mix runs (e.g. "normal **gras** normal") and still wrap correctly.
    // A run's text can still contain a literal "\n" here (a <br> inside this
    // paragraph, converted by splitIntoParagraphs) — pdf-lib's WinAnsi
    // encoding throws on that character, so it's pulled out into its own
    // forced-break token instead of being measured/drawn as text.
    type Token = { word: string; run: Run; break?: boolean };
    const tokens: Token[] = [];
    for (const run of runs) {
      const segments = run.text.split("\n");
      segments.forEach((segment, i) => {
        if (i > 0) tokens.push({ word: "", run, break: true });
        const words = segment.split(/(\s+)/).filter((w) => w.length > 0);
        for (const word of words) tokens.push({ word, run });
      });
    }

    let line: Token[] = [];
    let lineWidth = 0;

    function flushLine() {
      if (line.length === 0) return;
      ensureSpace();
      let x = MARGIN;
      for (const token of line) {
        const font = pickFont(embedded, token.run);
        const width = font.widthOfTextAtSize(token.word, FONT_SIZE);
        if (token.run.highlight && token.word.trim()) {
          const { r, g, b } = hexToRgb(token.run.highlight.startsWith("#") ? token.run.highlight : "#FFF3A0");
          page.drawRectangle({ x, y: cursorY - 3, width, height: LINE_HEIGHT - 2, color: rgb(r, g, b) });
        }
        page.drawText(token.word, { x, y: cursorY, size: FONT_SIZE, font, color: rgb(0.1, 0.1, 0.12) });
        if (token.run.underline && token.word.trim()) {
          page.drawLine({ start: { x, y: cursorY - 2 }, end: { x: x + width, y: cursorY - 2 }, thickness: 0.6, color: rgb(0.1, 0.1, 0.12) });
        }
        x += width;
      }
      cursorY -= LINE_HEIGHT;
      line = [];
      lineWidth = 0;
    }

    for (const token of tokens) {
      if (token.break) {
        flushLine();
        continue;
      }
      const font = pickFont(embedded, token.run);
      const width = font.widthOfTextAtSize(token.word, FONT_SIZE);
      if (lineWidth + width > maxWidth && line.length > 0) flushLine();
      line.push(token);
      lineWidth += width;
    }
    flushLine();
    cursorY -= LINE_HEIGHT * 0.4; // paragraph spacing
  }

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
