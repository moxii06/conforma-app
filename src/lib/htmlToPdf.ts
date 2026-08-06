import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { toWinAnsi } from "./winAnsi";
import {
  aUnEnTete,
  lignesEnTete,
  mentionPiedDePage,
  numeroDePage,
  type IdentiteOrganisme,
} from "./documentLayout";

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
// La bande réservée au pied de page. Le corps s'arrête au-dessus : sans
// cette réserve, la dernière ligne d'un article viendrait se poser sur les
// mentions légales.
const FOOTER_RESERVE = 34;
const ENCRE = { r: 0.1, g: 0.1, b: 0.12 };
const GRIS = { r: 0.45, g: 0.46, b: 0.48 };
const FILET = { r: 0.84, g: 0.83, b: 0.79 };

type Token = { word: string; run: Run; break?: boolean };

/**
 * Découpe des runs en mots, en isolant les sauts de ligne.
 *
 * Les polices standard de pdf-lib lèvent une exception sur un caractère hors
 * WinAnsi — et un contrat contient toujours, tôt ou tard, un caractère collé
 * depuis un traitement de texte. On assainit donc ici, une fois, avant toute
 * mesure ou tout tracé. Voir winAnsi.ts.
 */
function tokenize(runs: Run[]): Token[] {
  const tokens: Token[] = [];
  for (const run of runs) {
    const segments = toWinAnsi(run.text).split("\n");
    segments.forEach((segment, i) => {
      if (i > 0) tokens.push({ word: "", run, break: true });
      for (const word of segment.split(/(\s+)/).filter((w) => w.length > 0)) tokens.push({ word, run });
    });
  }
  return tokens;
}

function pickFont(fonts: Record<FontKey, { normal: PDFFont; bold: PDFFont; italic: PDFFont; boldItalic: PDFFont }>, run: Run): PDFFont {
  const set = fonts[run.fontKey];
  if (run.bold && run.italic) return set.boldItalic;
  if (run.bold) return set.bold;
  if (run.italic) return set.italic;
  return set.normal;
}

/**
 * L'habillage du document : en-tête, titre encadré, pied de page.
 *
 * Passé par l'appelant plutôt que chargé ici — ce module ne connaît pas
 * Prisma, et le logo est déjà des octets au moment où il arrive : le
 * télécharger depuis le générateur ferait dépendre la production d'un
 * contrat de la disponibilité d'une URL.
 */
export type MiseEnPageDocument = {
  organisme: IdentiteOrganisme;
  /** Les octets du logo, déjà téléchargés. `null` = pas de logo. */
  logo: Uint8Array | null;
};

/** PNG ou JPEG, décidé sur les octets et non sur l'extension de l'URL. */
function formatImage(bytes: Uint8Array): "png" | "jpg" | null {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50) return "png";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8) return "jpg";
  return null;
}

export async function generatePdfFromRichText(
  title: string,
  bodyHtml: string,
  layout?: MiseEnPageDocument,
): Promise<Buffer> {
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

  // Un logo illisible ne doit JAMAIS empêcher un contrat de sortir : on
  // l'ignore et on continue. Le document sans logo reste valable ; le
  // document absent, non.
  let logo: Awaited<ReturnType<typeof doc.embedPng>> | null = null;
  if (layout?.logo) {
    try {
      const format = formatImage(layout.logo);
      if (format === "png") logo = await doc.embedPng(layout.logo);
      else if (format === "jpg") logo = await doc.embedJpg(layout.logo);
    } catch {
      logo = null;
    }
  }

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let cursorY = PAGE_HEIGHT - MARGIN;
  const usableWidth = PAGE_WIDTH - MARGIN * 2;
  const bas = MARGIN + FOOTER_RESERVE;

  function newPage() {
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    cursorY = PAGE_HEIGHT - MARGIN;
  }

  function placePour(hauteur: number) {
    if (cursorY - hauteur < bas) newPage();
  }

  // ── En-tête : logo à gauche, identité à droite ──────────────────────────
  // Sur la PREMIÈRE page seulement, comme un papier à en-tête. Le pied de
  // page, lui, se répète : c'est lui qui porte les mentions obligatoires.
  if (layout && aUnEnTete(layout.organisme)) {
    const hautEnTete = cursorY;
    let basEnTete = cursorY;

    if (logo) {
      // Hauteur bornée, largeur déduite : un logo carré et un logo panoramique
      // doivent occuper la même place verticale.
      const hauteurLogo = 34;
      const largeurLogo = (logo.width / logo.height) * hauteurLogo;
      page.drawImage(logo, { x: MARGIN, y: hautEnTete - hauteurLogo, width: largeurLogo, height: hauteurLogo });
      basEnTete = Math.min(basEnTete, hautEnTete - hauteurLogo);
    }

    const lignes = lignesEnTete(layout.organisme);
    let y = hautEnTete - 9;
    for (const [i, ligne] of lignes.entries()) {
      const texte = toWinAnsi(ligne);
      const font = i === 0 ? embedded.sans.bold : embedded.sans.normal;
      const taille = i === 0 ? 10 : 8.5;
      const largeur = font.widthOfTextAtSize(texte, taille);
      page.drawText(texte, {
        x: PAGE_WIDTH - MARGIN - largeur,
        y,
        size: taille,
        font,
        color: i === 0 ? rgb(ENCRE.r, ENCRE.g, ENCRE.b) : rgb(GRIS.r, GRIS.g, GRIS.b),
      });
      y -= taille + 3;
    }
    basEnTete = Math.min(basEnTete, y + 6);

    page.drawLine({
      start: { x: MARGIN, y: basEnTete - 10 },
      end: { x: PAGE_WIDTH - MARGIN, y: basEnTete - 10 },
      thickness: 0.8,
      color: rgb(FILET.r, FILET.g, FILET.b),
    });
    cursorY = basEnTete - 34;
  }

  // ── Titre encadré ───────────────────────────────────────────────────────
  {
    const taille = 14;
    const fontTitre = embedded.sans.bold;
    const texte = toWinAnsi(title.toUpperCase());
    // Un titre trop long pour une ligne se replie plutôt que de déborder du
    // cadre : « Contrat de prestation de services de formation — formateur
    // indépendant » ne tient pas sur 483 points.
    const lignesTitre: string[] = [];
    let courante = "";
    for (const mot of texte.split(/\s+/)) {
      const essai = courante ? `${courante} ${mot}` : mot;
      if (fontTitre.widthOfTextAtSize(essai, taille) > usableWidth - 40 && courante) {
        lignesTitre.push(courante);
        courante = mot;
      } else courante = essai;
    }
    if (courante) lignesTitre.push(courante);

    const hauteurCadre = lignesTitre.length * (taille + 6) + 18;
    placePour(hauteurCadre);
    page.drawRectangle({
      x: MARGIN,
      y: cursorY - hauteurCadre,
      width: usableWidth,
      height: hauteurCadre,
      borderColor: rgb(ENCRE.r, ENCRE.g, ENCRE.b),
      borderWidth: 1,
    });
    let yTitre = cursorY - 20;
    for (const ligne of lignesTitre) {
      const largeur = fontTitre.widthOfTextAtSize(ligne, taille);
      page.drawText(ligne, {
        x: MARGIN + (usableWidth - largeur) / 2,
        y: yTitre,
        size: taille,
        font: fontTitre,
        color: rgb(ENCRE.r, ENCRE.g, ENCRE.b),
      });
      yTitre -= taille + 6;
    }
    cursorY -= hauteurCadre + 22;
  }

  // ── Corps ───────────────────────────────────────────────────────────────

  /** Replie des tokens en lignes qui tiennent dans `largeur`. */
  function replier(tokens: Token[], largeur: number, taille: number, gras: boolean): Token[][] {
    const lignes: Token[][] = [];
    let ligne: Token[] = [];
    let l = 0;
    for (const token of tokens) {
      if (token.break) {
        lignes.push(ligne);
        ligne = [];
        l = 0;
        continue;
      }
      const font = pickFont(embedded, gras ? { ...token.run, bold: true } : token.run);
      const w = font.widthOfTextAtSize(token.word, taille);
      if (l + w > largeur && ligne.length > 0) {
        lignes.push(ligne);
        ligne = [];
        l = 0;
      }
      ligne.push(token);
      l += w;
    }
    if (ligne.length > 0) lignes.push(ligne);
    return lignes;
  }

  /** Dessine une ligne de tokens et rend sa largeur totale. */
  function dessinerLigne(ligne: Token[], x: number, y: number, taille: number, gras: boolean, souligne: boolean): number {
    let curseur = x;
    for (const token of ligne) {
      const run = gras ? { ...token.run, bold: true } : token.run;
      const font = pickFont(embedded, run);
      const w = font.widthOfTextAtSize(token.word, taille);
      if (run.highlight && token.word.trim()) {
        const { r, g, b } = hexToRgb(run.highlight.startsWith("#") ? run.highlight : "#FFF3A0");
        page.drawRectangle({ x: curseur, y: y - 3, width: w, height: LINE_HEIGHT - 2, color: rgb(r, g, b) });
      }
      page.drawText(token.word, { x: curseur, y, size: taille, font, color: rgb(ENCRE.r, ENCRE.g, ENCRE.b) });
      if ((run.underline || souligne) && token.word.trim()) {
        page.drawLine({
          start: { x: curseur, y: y - 2 },
          end: { x: curseur + w, y: y - 2 },
          thickness: 0.6,
          color: rgb(ENCRE.r, ENCRE.g, ENCRE.b),
        });
      }
      curseur += w;
    }
    return curseur - x;
  }

  function dessinerTableau(t: NonNullable<Block["table"]>) {
    const colonnes = Math.max(...t.rows.map((r) => r.length));
    const largeurColonne = usableWidth / colonnes;
    const PADDING = 5;

    for (const [indexLigne, cellules] of t.rows.entries()) {
      const enTete = t.header && indexLigne === 0;
      const taille = FONT_SIZE - 0.5;
      // Replier d'abord TOUTES les cellules : la hauteur de la ligne est
      // celle de la cellule la plus haute, on ne peut pas la connaître en
      // dessinant au fil de l'eau.
      const repliees = Array.from({ length: colonnes }, (_, i) =>
        replier(tokenize(parseInlineRuns(cellules[i] ?? "")), largeurColonne - PADDING * 2, taille, enTete),
      );
      const hauteur = Math.max(1, ...repliees.map((r) => r.length)) * (LINE_HEIGHT - 2) + PADDING * 2;
      placePour(hauteur);

      for (let c = 0; c < colonnes; c++) {
        const x = MARGIN + c * largeurColonne;
        page.drawRectangle({
          x,
          y: cursorY - hauteur,
          width: largeurColonne,
          height: hauteur,
          borderColor: rgb(FILET.r, FILET.g, FILET.b),
          borderWidth: 0.7,
          ...(enTete ? { color: rgb(0.945, 0.937, 0.906) } : {}),
        });
        let y = cursorY - PADDING - taille;
        for (const ligne of repliees[c]) {
          dessinerLigne(ligne, x + PADDING, y, taille, enTete, false);
          y -= LINE_HEIGHT - 2;
        }
      }
      cursorY -= hauteur;
    }
    cursorY -= LINE_HEIGHT * 0.5;
  }

  for (const block of splitIntoBlocks(bodyHtml)) {
    if (block.table) {
      dessinerTableau(block.table);
      continue;
    }

    const titre = block.heading;
    const taille = titre === 1 ? FONT_SIZE + 2.5 : titre === 2 ? FONT_SIZE + 1 : FONT_SIZE;
    // Un encadré vit dans une gouttière : filet à gauche, texte décalé.
    const retraitEncadre = block.callout ? 12 : 0;
    const gauche = MARGIN + block.depth * LIST_INDENT + retraitEncadre;
    const largeur = PAGE_WIDTH - MARGIN - gauche;

    const lignes = replier(tokenize(parseInlineRuns(block.html)), largeur, taille, Boolean(titre));
    if (lignes.length === 0) continue;

    // Un titre appelle de l'air AU-DESSUS de lui, pas en dessous : c'est ce
    // qui le rattache visuellement à ce qu'il annonce.
    if (titre) cursorY -= LINE_HEIGHT * (titre === 1 ? 0.9 : 0.6);

    let marqueur = block.list?.marker ?? null;
    for (const ligne of lignes) {
      placePour(LINE_HEIGHT);
      if (block.callout) {
        page.drawRectangle({
          x: MARGIN,
          y: cursorY - 4,
          width: 2.5,
          height: LINE_HEIGHT,
          color: rgb(0.55, 0.42, 0.18),
        });
      }
      if (marqueur) {
        page.drawText(toWinAnsi(marqueur), {
          x: gauche - LIST_INDENT + 4,
          y: cursorY,
          size: FONT_SIZE,
          font: embedded.sans.normal,
          color: rgb(ENCRE.r, ENCRE.g, ENCRE.b),
        });
        marqueur = null;
      }
      // Les titres sont gras ET soulignés — le soulignement porte sur le
      // texte seul, pas sur toute la largeur de la colonne.
      dessinerLigne(ligne, gauche, cursorY, taille, Boolean(titre), Boolean(titre));
      cursorY -= titre ? taille + 5 : LINE_HEIGHT;
    }
    cursorY -= LINE_HEIGHT * (block.list ? 0.15 : titre ? 0.25 : 0.4);
  }

  // ── Pied de page, sur chaque page ───────────────────────────────────────
  // Dessiné à la fin, une fois le nombre total de pages connu : « Page 2 sur
  // 7 » ne peut pas s'écrire pendant qu'on remplit la page 2.
  const pages = doc.getPages();
  const mention = layout ? toWinAnsi(mentionPiedDePage(layout.organisme)) : "";
  for (const [i, p] of pages.entries()) {
    p.drawLine({
      start: { x: MARGIN, y: MARGIN + 22 },
      end: { x: PAGE_WIDTH - MARGIN, y: MARGIN + 22 },
      thickness: 0.6,
      color: rgb(FILET.r, FILET.g, FILET.b),
    });
    if (mention) {
      // La mention légale se replie sur deux lignes si besoin plutôt que de
      // sortir de la page — elle est longue, et elle est obligatoire.
      const taille = 7;
      const font = embedded.sans.normal;
      const mots = mention.split(" ");
      const lignes: string[] = [];
      let courante = "";
      for (const mot of mots) {
        const essai = courante ? `${courante} ${mot}` : mot;
        if (font.widthOfTextAtSize(essai, taille) > usableWidth - 70 && courante) {
          lignes.push(courante);
          courante = mot;
        } else courante = essai;
      }
      if (courante) lignes.push(courante);
      let y = MARGIN + 12;
      for (const ligne of lignes.slice(0, 2)) {
        p.drawText(ligne, { x: MARGIN, y, size: taille, font, color: rgb(GRIS.r, GRIS.g, GRIS.b) });
        y -= taille + 2;
      }
    }
    const pagination = toWinAnsi(numeroDePage(i + 1, pages.length));
    const largeurPagination = embedded.sans.normal.widthOfTextAtSize(pagination, 8);
    p.drawText(pagination, {
      x: PAGE_WIDTH - MARGIN - largeurPagination,
      y: MARGIN + 12,
      size: 8,
      font: embedded.sans.normal,
      color: rgb(GRIS.r, GRIS.g, GRIS.b),
    });
  }

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
