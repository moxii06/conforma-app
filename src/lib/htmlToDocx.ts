import { Document, Packer, Paragraph, TextRun } from "docx";
import { splitIntoParagraphs, parseInlineRuns, type Run, type FontKey } from "@/lib/htmlToPdf";

// The Word twin of htmlToPdf.ts — same input (RichTextEditor's sanitized
// HTML), same parsing (splitIntoParagraphs + parseInlineRuns, imported
// rather than re-implemented), different renderer. Exists because an OFP
// adapting a contract wants a file they can keep editing in Word, which a
// PDF deliberately is not.

const DOCX_FONTS: Record<FontKey, string> = {
  sans: "Helvetica",
  serif: "Times New Roman",
  mono: "Courier New",
};

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

  for (const fragment of splitIntoParagraphs(bodyHtml)) {
    const runs = parseInlineRuns(fragment);
    paragraphs.push(
      new Paragraph({
        children: runs.flatMap(runToTextRuns),
        spacing: { after: 120 },
      }),
    );
  }

  const doc = new Document({ sections: [{ children: paragraphs }] });
  return Buffer.from(await Packer.toBuffer(doc));
}
