import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { toWinAnsi } from "./winAnsi";

// Le relevé de planning d'un intervenant : une liste chronologique à
// exporter (RH, échanges avec l'intervenant, archivage), pas un document
// contractuel — donc un simple tableau, sans les mentions légales d'une
// facture. Générateur dédié plutôt que htmlToPdf : celui-ci ne sait rendre
// que du texte au fil de l'eau, pas des colonnes alignées.

export type PlanningPdfDatedSession = {
  startsAt: Date;
  endsAt: Date;
  courseTitle: string;
  location: string | null;
  formatLabel: string;
  statusLabel: string;
};

export type PlanningPdfRollingSession = {
  courseTitle: string;
  location: string | null;
  formatLabel: string;
  statusLabel: string;
};

export type PlanningPdfData = {
  organizationName: string;
  trainerName: string;
  generatedAt: Date;
  dated: PlanningPdfDatedSession[];
  rolling: PlanningPdfRollingSession[];
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;

/** Découpe un texte pour qu'il tienne dans une largeur donnée. */
function wrap(texte: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const mots = toWinAnsi(texte).split(/\s+/).filter(Boolean);
  const lignes: string[] = [];
  let courante = "";
  for (const mot of mots) {
    const essai = courante ? `${courante} ${mot}` : mot;
    if (font.widthOfTextAtSize(essai, size) > maxWidth && courante) {
      lignes.push(courante);
      courante = mot;
    } else {
      courante = essai;
    }
  }
  if (courante) lignes.push(courante);
  return lignes.length > 0 ? lignes : [""];
}

export async function generatePlanningPdf(data: PlanningPdfData): Promise<Buffer> {
  const doc = await PDFDocument.create();
  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const gras = await doc.embedFont(StandardFonts.HelveticaBold);

  const ink = rgb(0.11, 0.11, 0.12);
  const slate = rgb(0.42, 0.43, 0.45);
  const ligne = rgb(0.85, 0.85, 0.86);
  const droite = PAGE_WIDTH - MARGIN;

  let y = PAGE_HEIGHT - MARGIN;

  function texte(t: string, x: number, yy: number, opts: { font?: PDFFont; size?: number; color?: typeof ink } = {}) {
    page.drawText(toWinAnsi(t), { x, y: yy, font: opts.font ?? normal, size: opts.size ?? 9.5, color: opts.color ?? ink });
  }

  function ensureSpace(needed: number) {
    if (y < MARGIN + needed) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
  }

  texte(data.organizationName, MARGIN, y, { font: gras, size: 14 });
  y -= 20;
  texte(`Planning — ${data.trainerName}`, MARGIN, y, { font: gras, size: 12 });
  y -= 16;
  texte(
    `Édité le ${data.generatedAt.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}`,
    MARGIN,
    y,
    { size: 8.5, color: slate },
  );
  y -= 28;

  const xDate = MARGIN;
  const xHoraire = MARGIN + 100;
  const xFormation = MARGIN + 170;
  const xStatut = droite - 105;
  const largeurFormation = xStatut - xFormation - 10;

  function enTeteSection(titre: string, colonnes: [string, number][]) {
    ensureSpace(46);
    texte(titre, MARGIN, y, { font: gras, size: 10.5 });
    y -= 15;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: droite, y }, thickness: 0.8, color: ligne });
    y -= 12;
    for (const [label, x] of colonnes) texte(label, x, y, { font: gras, size: 8, color: slate });
    y -= 5;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: droite, y }, thickness: 0.6, color: ligne });
    y -= 14;
  }

  if (data.dated.length > 0) {
    enTeteSection("Sessions à date fixe", [
      ["Date", xDate],
      ["Horaire", xHoraire],
      ["Formation / lieu", xFormation],
      ["Statut", xStatut],
    ]);
    for (const s of data.dated) {
      const sousLigne = [s.formatLabel, s.location].filter(Boolean).join(" · ");
      const lignesFormation = wrap(s.courseTitle, normal, 9, largeurFormation);
      ensureSpace(12 * lignesFormation.length + (sousLigne ? 12 : 0) + 6);

      texte(
        s.startsAt.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }),
        xDate,
        y,
        { size: 9 },
      );
      texte(
        `${s.startsAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}–${s.endsAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`,
        xHoraire,
        y,
        { size: 9 },
      );
      texte(s.statusLabel, xStatut, y, { size: 9, color: slate });
      for (const l of lignesFormation) {
        texte(l, xFormation, y, { size: 9 });
        y -= 12;
      }
      if (sousLigne) {
        texte(sousLigne, xFormation, y, { size: 8, color: slate });
        y -= 12;
      }
      y -= 6;
    }
  } else {
    texte("Aucune session à date fixe.", MARGIN, y, { size: 9, color: slate });
    y -= 20;
  }

  if (data.rolling.length > 0) {
    y -= 8;
    enTeteSection("Formations en continu (bande passante)", [
      ["Formation / lieu", xDate],
      ["Statut", xStatut],
    ]);
    const largeurRolling = xStatut - xDate - 10;
    for (const s of data.rolling) {
      const sousLigne = [s.formatLabel, s.location].filter(Boolean).join(" · ");
      const lignesFormation = wrap(s.courseTitle, normal, 9, largeurRolling);
      ensureSpace(12 * lignesFormation.length + (sousLigne ? 12 : 0) + 6);

      texte(s.statusLabel, xStatut, y, { size: 9, color: slate });
      for (const l of lignesFormation) {
        texte(l, xDate, y, { size: 9 });
        y -= 12;
      }
      if (sousLigne) {
        texte(sousLigne, xDate, y, { size: 8, color: slate });
        y -= 12;
      }
      y -= 6;
    }
  }

  return Buffer.from(await doc.save());
}
