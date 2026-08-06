import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { splitIntoBlocks, parseInlineRuns, type Block, type Run, type FontKey } from "@/lib/htmlToPdf";
import { aUnEnTete, lignesEnTete, mentionPiedDePage, type IdentiteOrganisme } from "@/lib/documentLayout";

// The Word twin of htmlToPdf.ts — same input (RichTextEditor's sanitized
// HTML), same parsing (splitIntoBlocks + parseInlineRuns, imported
// rather than re-implemented), different renderer. Exists because an OFP
// adapting a contract wants a file they can keep editing in Word, which a
// PDF deliberately is not.

const DOCX_FONTS: Record<FontKey, string> = {
  sans: "Helvetica",
  serif: "Times New Roman",
  mono: "Courier New",
};

// De VRAIES listes Word, et non un « • » tapé en tête de paragraphe. La
// différence se voit dès que l'organisme rouvre le fichier : une vraie liste
// se renumérote seule quand on insère un article, se manipule avec les
// outils de Word et survit à un copier-coller. Un caractère puce ne fait
// rien de tout cela — et c'est précisément ce qu'on promet en mettant un
// bouton « liste numérotée » dans l'éditeur.
const PUCES = "jalon-puces";
const NUMEROS = "jalon-numeros";

// La largeur utile d'une page A4 avec des marges d'un pouce, en twips
// (1 pouce = 1440). Sert aux tableaux : docx exige une largeur sur le
// tableau ET sur chaque cellule, faute de quoi Google Docs les rend faux.
const LARGEUR_UTILE = 9360;

/** Le type d'un jeu de niveaux de liste, tel que docx l'attend. */
function niveauxListe(format: (typeof LevelFormat)[keyof typeof LevelFormat], gabarit: (n: number) => string) {
  return [0, 1, 2].map((level) => ({
    level,
    format,
    text: gabarit(level + 1),
    alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
  }));
}

function runToTextRuns(run: Run, forcerGras = false, forcerSouligne = false): TextRun[] {
  // A run's text can carry literal "\n" (a <br> converted upstream). Word
  // has no such character inside a run — each segment after the first gets
  // `break: 1`, docx's explicit line-break-before marker.
  return run.text.split("\n").map(
    (segment, i) =>
      new TextRun({
        text: segment,
        bold: run.bold || forcerGras || undefined,
        italics: run.italic || undefined,
        underline: run.underline || forcerSouligne ? {} : undefined,
        highlight: run.highlight ? "yellow" : undefined,
        font: DOCX_FONTS[run.fontKey],
        size: 22, // half-points → 11pt, same as the PDF's FONT_SIZE
        break: i > 0 ? 1 : undefined,
      }),
  );
}

/** Une cellule de tableau : sa largeur est obligatoire, voir LARGEUR_UTILE. */
function cellule(fragment: string, largeur: number, enTete: boolean): TableCell {
  return new TableCell({
    width: { size: largeur, type: WidthType.DXA },
    // CLEAR et non SOLID : SOLID rend un aplat noir dans Word.
    ...(enTete ? { shading: { type: ShadingType.CLEAR, fill: "F1EEE8" } } : {}),
    children: [
      new Paragraph({
        children: parseInlineRuns(fragment).flatMap((r) => runToTextRuns(r, enTete)),
        spacing: { before: 40, after: 40 },
      }),
    ],
  });
}

function tableau(t: NonNullable<Block["table"]>): Table {
  const colonnes = Math.max(...t.rows.map((r) => r.length));
  const largeur = Math.floor(LARGEUR_UTILE / colonnes);
  return new Table({
    // Les largeurs de colonnes doivent totaliser celle du tableau, sinon
    // Word répartit à sa façon et le rendu diverge du PDF.
    columnWidths: Array.from({ length: colonnes }, () => largeur),
    width: { size: largeur * colonnes, type: WidthType.DXA },
    rows: t.rows.map(
      (cellules, i) =>
        new TableRow({
          tableHeader: t.header && i === 0,
          children: Array.from({ length: colonnes }, (_, c) => cellule(cellules[c] ?? "", largeur, t.header && i === 0)),
        }),
    ),
  });
}

export async function generateDocxFromRichText(
  title: string,
  bodyHtml: string,
  layout?: { organisme: IdentiteOrganisme; logo: Uint8Array | null },
): Promise<Buffer> {
  const corps: (Paragraph | Table)[] = [];

  // ── Titre encadré ──────────────────────────────────────────────────────
  // Des bordures de paragraphe, pas un tableau d'une cellule : un tableau
  // se comporte comme un tableau dès qu'on édite autour, et l'organisme
  // rouvre ce fichier pour l'éditer.
  const cadre = { style: BorderStyle.SINGLE, size: 6, color: "1B2430", space: 8 };
  corps.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      border: { top: cadre, bottom: cadre, left: cadre, right: cadre },
      spacing: { before: 120, after: 360 },
      children: [new TextRun({ text: title.toUpperCase(), bold: true, size: 28, font: DOCX_FONTS.sans })],
    }),
  );

  for (const block of splitIntoBlocks(bodyHtml)) {
    if (block.table) {
      corps.push(tableau(block.table));
      // Word colle le paragraphe suivant au tableau sans ce séparateur.
      corps.push(new Paragraph({ text: "", spacing: { after: 120 } }));
      continue;
    }

    const runs = parseInlineRuns(block.html);
    const titre = block.heading;
    corps.push(
      new Paragraph({
        // Les vrais niveaux de titre de Word : ils alimentent le volet de
        // navigation et une table des matières, ce qu'un simple gras ne
        // fait pas.
        ...(titre ? { heading: titre === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2 } : {}),
        // Gras ET souligné pour un titre, comme demandé et comme dans le PDF.
        children: runs.flatMap((r) => runToTextRuns(r, Boolean(titre), Boolean(titre))),
        // Un encadré : filet à gauche et retrait, le pendant du trait
        // dessiné dans le PDF.
        ...(block.callout
          ? {
              border: { left: { style: BorderStyle.SINGLE, size: 12, color: "8C6B2E", space: 10 } },
              indent: { left: 240 },
            }
          : {}),
        numbering: block.list
          ? { reference: block.list.kind === "ordered" ? NUMEROS : PUCES, level: Math.min(block.depth - 1, 2) }
          : undefined,
        spacing: titre ? { before: 240, after: 80 } : { after: block.list ? 40 : 120 },
      }),
    );
  }

  const enTete =
    layout && aUnEnTete(layout.organisme)
      ? new Header({
          children: [
            ...(layout.logo
              ? [
                  new Paragraph({
                    children: [
                      new ImageRun({
                        data: layout.logo,
                        // PNG comme JPEG : docx exige le type explicitement.
                        type: layout.logo[0] === 0x89 ? "png" : "jpg",
                        transformation: { width: 90, height: 34 },
                      }),
                    ],
                  }),
                ]
              : []),
            ...lignesEnTete(layout.organisme).map(
              (ligne, i) =>
                new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  children: [new TextRun({ text: ligne, bold: i === 0, size: i === 0 ? 20 : 17, font: DOCX_FONTS.sans })],
                }),
            ),
          ],
        })
      : undefined;

  const mention = layout ? mentionPiedDePage(layout.organisme) : "";
  const pied = new Footer({
    children: [
      ...(mention
        ? [
            new Paragraph({
              children: [new TextRun({ text: mention, size: 14, color: "6A6D74", font: DOCX_FONTS.sans })],
            }),
          ]
        : []),
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          // La pagination automatique de Word : elle reste juste quand
          // l'organisme ajoute un article et que le document gagne une page.
          new TextRun({ text: "Page ", size: 16, color: "6A6D74", font: DOCX_FONTS.sans }),
          new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "6A6D74", font: DOCX_FONTS.sans }),
          new TextRun({ text: " sur ", size: 16, color: "6A6D74", font: DOCX_FONTS.sans }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: "6A6D74", font: DOCX_FONTS.sans }),
        ],
      }),
    ],
  });

  const doc = new Document({
    numbering: {
      config: [
        { reference: PUCES, levels: niveauxListe(LevelFormat.BULLET, () => "•") },
        // « %1. » puis « %2. » : le gabarit désigne le compteur du niveau
        // courant, donc l'index suit la profondeur.
        { reference: NUMEROS, levels: niveauxListe(LevelFormat.DECIMAL, (n) => `%${n}.`) },
      ],
    },
    sections: [{ ...(enTete ? { headers: { default: enTete } } : {}), footers: { default: pied }, children: corps }],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}
