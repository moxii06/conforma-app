import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { toWinAnsi } from "./winAnsi";

// Turns the RichTextEditor's sanitized HTML output into a real PDF —
// client feedback wants actual attachable files, not the plain-text-in-a-
// printable-page approach the toolkit used before. Deliberately not a
// general HTML-to-PDF renderer: the input vocabulary is exactly what
// RichTextEditor's toolbar produces (bold/italic/underline/highlight/font),
// already passed through sanitizeRichText — a small hand-rolled parser is
// safe here and avoids pulling in a headless-browser dependency that
// doesn't run reliably in a Vercel serverless function.

// Exported so htmlToDocx.ts can drive the exact same parsing without
// duplicating it — a docx paragraph and a PDF line both start from the same
// flat run list, they just draw it differently.
export type Run = { text: string; bold: boolean; italic: boolean; underline: boolean; highlight: string | null; fontKey: FontKey };
export type FontKey = "sans" | "serif" | "mono";

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

/**
 * Un bloc de document : un paragraphe, ou un élément de liste.
 *
 * Le découpage rendait auparavant une simple liste de chaînes, en coupant
 * sur `</p>` et `</div>` uniquement. Une liste à puces saisie dans
 * l'éditeur arrivait donc ici comme UN seul bloc, tous les éléments collés
 * bout à bout, sans puce ni retour à la ligne : le PDF envoyé au client ne
 * ressemblait plus à ce qui avait été écrit. Offrir un bouton « liste »
 * sans ce découpage aurait été pire que ne pas l'offrir.
 */
export type Block = {
  /** Le fragment de balisage inline (gras, italique, police…) du bloc. */
  html: string;
  /**
   * Profondeur d'imbrication. 0 pour un paragraphe ordinaire, 1 pour un
   * élément de liste de premier niveau, 2 pour une sous-liste, etc.
   */
  depth: number;
  /**
   * Absent hors liste. `marker` est déjà résolu (« • », « 2. ») pour le PDF,
   * qui dessine du texte ; `kind` sert au .docx, qui doit produire une vraie
   * liste Word plutôt qu'une puce tapée à la main.
   */
  list?: { kind: "bullet" | "ordered"; marker: string };
  /**
   * Niveau de titre (1 ou 2), absent pour un paragraphe ordinaire.
   *
   * Retenu ici parce que le PDF et le .docx doivent le rendre : un titre
   * d'article qui revient en texte courant dans le fichier envoyé au client
   * ne serait pas un titre. `splitIntoBlocks` consommait <h1>/<h2> comme
   * simples séparateurs et perdait l'information.
   */
  heading?: 1 | 2;
  /** Encadré d'avertissement (<blockquote>) — ce qui doit être vu. */
  callout?: true;
  /**
   * Un tableau. `html` est alors vide : le contenu vit dans `rows`, chaque
   * cellule gardant son balisage inline. `header` dit si la première ligne
   * est une ligne d'en-tête (<th>), qui se dessine en gras sur fond léger.
   */
  table?: { rows: string[][]; header: boolean };
};

/** Découpe un <table> en lignes de cellules, balisage inline conservé. */
function parseTable(fragment: string): { rows: string[][]; header: boolean } {
  const rows: string[][] = [];
  let header = false;
  const lignes = fragment.match(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi) ?? [];
  for (const ligne of lignes) {
    const cellules: string[] = [];
    const re = /<(th|td)\b[^>]*>([\s\S]*?)<\/\1>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(ligne)) !== null) {
      if (m[1].toLowerCase() === "th" && rows.length === 0) header = true;
      cellules.push(m[2].replace(/<\/?(?:p|div)[^>]*>/gi, " ").replace(/\s+/g, " ").trim());
    }
    if (cellules.length > 0) rows.push(cellules);
  }
  return { rows, header };
}

/**
 * Découpe le HTML de l'éditeur en blocs, listes comprises.
 *
 * Analyse par balayage plutôt que par DOM : ce module tourne aussi côté
 * serverless, où il n'y a pas de `document`. Le vocabulaire d'entrée est
 * exactement ce que produit `document.execCommand` dans l'éditeur, plus le
 * HTML de nos propres modèles — pas du HTML arbitraire.
 */
export function splitIntoBlocks(html: string): Block[] {
  const source = html.replace(/<br\s*\/?>/gi, "\n");
  const blocks: Block[] = [];
  // Une entrée par liste ouverte ; `index` porte la numérotation, qui
  // repart de 1 à chaque sous-liste — comme le fait un navigateur.
  const stack: { kind: "bullet" | "ordered"; index: number }[] = [];
  let buffer = "";
  let dansUnItem = false;
  // Le niveau du titre ouvert, s'il y en a un. Porté par le bloc qu'on vide
  // à sa fermeture — un <h2>…</h2> produit UN bloc, pas deux.
  let titreOuvert: 1 | 2 | null = null;
  let dansUnEncadre = false;

  function vider(commeItem: boolean) {
    const texte = buffer.trim();
    buffer = "";
    if (!texte) return;
    const liste = stack[stack.length - 1];
    if (commeItem && liste) {
      liste.index += 1;
      blocks.push({
        html: texte,
        depth: stack.length,
        list: { kind: liste.kind, marker: liste.kind === "ordered" ? `${liste.index}.` : "•" },
      });
    } else {
      blocks.push({
        html: texte,
        depth: stack.length,
        ...(titreOuvert ? { heading: titreOuvert } : {}),
        ...(dansUnEncadre ? { callout: true as const } : {}),
      });
    }
  }

  const structure = /<(\/?)(ul|ol|li|p|div|h[1-6]|blockquote|table)\b[^>]*>/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = structure.exec(source)) !== null) {
    buffer += source.slice(lastIndex, match.index);
    lastIndex = structure.lastIndex;
    const fermante = match[1] === "/";
    const tag = match[2].toLowerCase();

    // Un tableau se lit d'un bloc : on saute jusqu'à sa fermeture et on
    // l'analyse à part, plutôt que de tenter d'en suivre la structure avec
    // le même automate que les paragraphes.
    if (tag === "table" && !fermante) {
      vider(dansUnItem);
      dansUnItem = false;
      const fin = source.toLowerCase().indexOf("</table>", lastIndex);
      const interieur = source.slice(lastIndex, fin === -1 ? source.length : fin);
      const t = parseTable(interieur);
      if (t.rows.length > 0) blocks.push({ html: "", depth: stack.length, table: t });
      lastIndex = fin === -1 ? source.length : fin + "</table>".length;
      structure.lastIndex = lastIndex;
      continue;
    }
    if (tag === "table") continue;

    if (tag === "blockquote") {
      vider(dansUnItem);
      dansUnItem = false;
      dansUnEncadre = !fermante;
      continue;
    }

    if (tag === "ul" || tag === "ol") {
      // Vider AVANT de dépiler : le texte en attente appartient encore à la
      // liste qu'on ferme, pas à ce qui l'entoure.
      vider(dansUnItem);
      dansUnItem = false;
      if (fermante) stack.pop();
      else stack.push({ kind: tag === "ol" ? "ordered" : "bullet", index: 0 });
      continue;
    }

    if (tag === "li") {
      // Le même geste ferme l'item précédent, qu'on rencontre `</li>` ou
      // directement le `<li>` suivant — le second est du HTML valide, et
      // les navigateurs en produisent.
      vider(dansUnItem);
      dansUnItem = !fermante;
      continue;
    }

    // p / div / titre. Chrome enveloppe parfois le contenu d'un <li> dans un
    // <div> : à l'intérieur d'un item, ces balises ne coupent rien, sans quoi
    // l'élément sortirait en deux blocs dont un sans puce.
    if (dansUnItem) continue;

    const niveau = tag.startsWith("h") ? (tag === "h1" ? 1 : 2) : null;
    if (niveau && !fermante) {
      // Le texte AVANT le titre appartient au paragraphe précédent : on le
      // vide en ordinaire, puis on ouvre le titre.
      vider(false);
      titreOuvert = niveau;
      continue;
    }
    vider(false);
    if (niveau && fermante) titreOuvert = null;
  }

  buffer += source.slice(lastIndex);
  vider(dansUnItem);
  return blocks;
}

/**
 * Conservée pour les appelants qui n'ont que faire des listes (et pour les
 * tests d'origine) — définie à partir de `splitIntoBlocks` et non l'inverse,
 * pour qu'il n'existe qu'une seule règle de découpage.
 */
export function splitIntoParagraphs(html: string): string[] {
  return splitIntoBlocks(html).map((b) => b.html);
}

// Walks one paragraph's inline markup into a flat run list, tracking a
// style stack so nested tags (<b><i>...</i></b>) combine correctly.
export function parseInlineRuns(fragment: string): Run[] {
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
// Décalage d'un niveau de liste, en points. Assez large pour que « 10. »
// tienne dans la gouttière sans toucher le texte.
const LIST_INDENT = 18;

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
  page.drawText(toWinAnsi(title), { x: MARGIN, y: cursorY, size: titleSize, font: titleFont, color: rgb(0.1, 0.14, 0.19) });
  cursorY -= titleSize + 14;

  for (const block of splitIntoBlocks(bodyHtml)) {
    // Un élément de liste s'écrit dans une colonne décalée, sa puce ou son
    // numéro posé dans la gouttière à gauche. `textLeft` sert au texte,
    // `maxWidth` s'ajuste pour que le retour à la ligne reste dans la marge.
    const textLeft = MARGIN + block.depth * LIST_INDENT;
    const maxWidth = PAGE_WIDTH - MARGIN - textLeft;
    const runs = parseInlineRuns(block.html);
    // Flatten into word-level tokens carrying their run's style, so a line
    // can mix runs (e.g. "normal **gras** normal") and still wrap correctly.
    // A run's text can still contain a literal "\n" here (a <br> inside this
    // paragraph, converted by splitIntoParagraphs) — pdf-lib's WinAnsi
    // encoding throws on that character, so it's pulled out into its own
    // forced-break token instead of being measured/drawn as text.
    type Token = { word: string; run: Run; break?: boolean };
    const tokens: Token[] = [];
    for (const run of runs) {
      // Assaini ici, une fois, avant toute mesure ou tout tracé : les polices
      // standard de pdf-lib lèvent une exception sur un caractère hors
      // WinAnsi, et un contrat contient toujours, tôt ou tard, un caractère
      // collé depuis un traitement de texte. Voir winAnsi.ts.
      const segments = toWinAnsi(run.text).split("\n");
      segments.forEach((segment, i) => {
        if (i > 0) tokens.push({ word: "", run, break: true });
        const words = segment.split(/(\s+)/).filter((w) => w.length > 0);
        for (const word of words) tokens.push({ word, run });
      });
    }

    let line: Token[] = [];
    let lineWidth = 0;
    // La puce n'accompagne que la PREMIÈRE ligne de l'élément : un item qui
    // se replie sur trois lignes ne doit pas afficher trois puces.
    let markerÀPoser = block.list?.marker ?? null;

    function flushLine() {
      if (line.length === 0) return;
      ensureSpace();
      if (markerÀPoser) {
        const markerFont = embedded.sans.normal;
        page.drawText(toWinAnsi(markerÀPoser), {
          x: textLeft - LIST_INDENT + 4,
          y: cursorY,
          size: FONT_SIZE,
          font: markerFont,
          color: rgb(0.1, 0.1, 0.12),
        });
        markerÀPoser = null;
      }
      let x = textLeft;
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
    // Les éléments d'une même liste se serrent : l'espace de paragraphe
    // entre chaque puce casserait la liste en autant de blocs isolés.
    cursorY -= LINE_HEIGHT * (block.list ? 0.15 : 0.4);
  }

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
