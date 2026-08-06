import { AlignmentType, Document, LevelFormat, Packer, Paragraph, TextRun } from "docx";
import { splitIntoBlocks, parseInlineRuns, type Run, type FontKey } from "@/lib/htmlToPdf";

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

// 1 pouce = 1440 twips. Chaque niveau décale d'un demi-pouce, le marqueur
// posé en retrait négatif (hanging) pour rester dans la gouttière.
function niveauxListe(format: (typeof LevelFormat)[keyof typeof LevelFormat], gabarit: (n: number) => string) {
  return [0, 1, 2].map((level) => ({
    level,
    format,
    text: gabarit(level + 1),
    alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
  }));
}

function runToTextRuns(run: Run): TextRun[] {
  // A run's text can carry literal "\n" (a <br> converted upstream). Word
  // has no such character inside a run — each segment after the first gets
  // `break: 1`, docx's explicit line-break-before marker.
  return run.text.split("\n").map(
    (segment, i) =>
      new TextRun({
        text: segment,
        bold: run.bold || undefined,
        italics: run.italic || undefined,
        underline: run.underline ? {} : undefined,
        highlight: run.highlight ? "yellow" : undefined,
        font: DOCX_FONTS[run.fontKey],
        size: 22, // half-points → 11pt, same as the PDF's FONT_SIZE
        break: i > 0 ? 1 : undefined,
      }),
  );
}

export async function generateDocxFromRichText(title: string, bodyHtml: string): Promise<Buffer> {
  const paragraphs: Paragraph[] = [
    new Paragraph({
      children: [new TextRun({ text: title, bold: true, size: 30, font: DOCX_FONTS.sans })],
      spacing: { after: 280 },
    }),
  ];

  for (const block of splitIntoBlocks(bodyHtml)) {
    const runs = parseInlineRuns(block.html);
    paragraphs.push(
      new Paragraph({
        children: runs.flatMap(runToTextRuns),
        // Trois niveaux sont déclarés ; au-delà, l'élément reste dans la
        // liste au dernier niveau défini plutôt que de sortir silencieusement
        // de la numérotation.
        numbering: block.list
          ? { reference: block.list.kind === "ordered" ? NUMEROS : PUCES, level: Math.min(block.depth - 1, 2) }
          : undefined,
        // Entre deux puces, l'espace de paragraphe casserait la liste en
        // blocs isolés — même raison que dans le PDF.
        spacing: { after: block.list ? 40 : 120 },
      }),
    );
  }

  const doc = new Document({
    numbering: {
      config: [
        { reference: PUCES, levels: niveauxListe(LevelFormat.BULLET, () => "•") },
        // « %1. » puis « %2. » : le gabarit désigne le compteur du niveau
        // courant, donc l'index suit la profondeur.
        { reference: NUMEROS, levels: niveauxListe(LevelFormat.DECIMAL, (n) => `%${n}.`) },
      ],
    },
    sections: [{ children: paragraphs }],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}
