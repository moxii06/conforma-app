import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { toWinAnsi } from "./winAnsi";
import { ACTIVITY_REPORT_NOTICE, ACTIVITY_STATUS_LABELS, type ActivityRow } from "./activityReport";

// Le relevé d'activité d'une session, en PDF — le document qu'un OF joint
// à une demande de financeur ou range dans son dossier d'audit, là où une
// formation en présentiel joindrait sa feuille d'émargement.
//
// Même parti pris que planningPdf : un générateur dédié plutôt que
// htmlToPdf, parce qu'il faut des colonnes alignées et que le rendu HTML
// ne sait produire que du texte au fil de l'eau.

export type ActivityPdfData = {
  organizationName: string;
  courseTitle: string;
  /** « En continu » ou la période de la session datée. */
  periodLabel: string;
  generatedAt: Date;
  rows: ActivityRow[];
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;

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

const jour = (d: Date | null) =>
  d ? d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

export async function generateActivityPdf(data: ActivityPdfData): Promise<Buffer> {
  const doc = await PDFDocument.create();
  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const gras = await doc.embedFont(StandardFonts.HelveticaBold);

  const ink = rgb(0.11, 0.11, 0.12);
  const slate = rgb(0.42, 0.43, 0.45);
  const trait = rgb(0.85, 0.85, 0.86);
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
  texte("Relevé d'activité", MARGIN, y, { font: gras, size: 12 });
  y -= 16;
  texte(data.courseTitle, MARGIN, y, { size: 9.5 });
  y -= 13;
  texte(data.periodLabel, MARGIN, y, { size: 8.5, color: slate });
  y -= 13;
  texte(
    `Édité le ${data.generatedAt.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}`,
    MARGIN,
    y,
    { size: 8.5, color: slate },
  );
  y -= 26;

  const xNom = MARGIN;
  const xAvancement = MARGIN + 150;
  const xPremier = MARGIN + 225;
  const xDernier = MARGIN + 300;
  const xEval = MARGIN + 375;
  const xStatut = droite - 75;

  ensureSpace(46);
  page.drawLine({ start: { x: MARGIN, y }, end: { x: droite, y }, thickness: 0.8, color: trait });
  y -= 12;
  for (const [label, x] of [
    ["Apprenant", xNom],
    ["Modules", xAvancement],
    ["Premier accès", xPremier],
    ["Dern. activité", xDernier],
    ["Évaluations", xEval],
    ["Statut", xStatut],
  ] as [string, number][]) {
    texte(label, x, y, { font: gras, size: 8, color: slate });
  }
  y -= 5;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: droite, y }, thickness: 0.6, color: trait });
  y -= 14;

  if (data.rows.length === 0) {
    texte("Aucun apprenant inscrit.", MARGIN, y, { size: 9, color: slate });
    y -= 20;
  }

  for (const r of data.rows) {
    const lignesNom = wrap(r.contactName, normal, 9, xAvancement - xNom - 8);
    ensureSpace(12 * lignesNom.length + 14);

    texte(`${r.modulesCompleted}/${r.modulesTotal} · ${r.percent} %`, xAvancement, y, { size: 9 });
    texte(jour(r.firstActivityAt), xPremier, y, { size: 9 });
    texte(jour(r.lastActivityAt), xDernier, y, { size: 9 });
    // « — » et non « 0/0 » quand la formation ne comporte aucune
    // évaluation : le tiret dit « sans objet », le zéro dirait « échec ».
    texte(
      r.quizTaken > 0 ? `${r.quizPassed}/${r.quizTaken} réussie${r.quizTaken > 1 ? "s" : ""}` : "—",
      xEval,
      y,
      { size: 9 },
    );
    texte(ACTIVITY_STATUS_LABELS[r.status], xStatut, y, { size: 9, color: slate });
    for (const l of lignesNom) {
      texte(l, xNom, y, { size: 9 });
      y -= 12;
    }
    if (r.certificateIssuedAt) {
      texte(`Attestation délivrée le ${jour(r.certificateIssuedAt)}`, xNom + 8, y, { size: 8, color: slate });
      y -= 12;
    }
    y -= 2;
  }

  // La mention de portée, en pied de document. Elle vient de
  // activityReport.ts pour que l'écran et le PDF ne puissent pas dire deux
  // choses différentes sur ce que ce relevé prouve.
  y -= 10;
  ensureSpace(50);
  page.drawLine({ start: { x: MARGIN, y }, end: { x: droite, y }, thickness: 0.6, color: trait });
  y -= 14;
  for (const l of wrap(ACTIVITY_REPORT_NOTICE, normal, 7.5, droite - MARGIN)) {
    texte(l, MARGIN, y, { size: 7.5, color: slate });
    y -= 10;
  }

  return Buffer.from(await doc.save());
}
