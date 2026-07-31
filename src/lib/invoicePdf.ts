import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

// Le PDF d'une facture ou d'un devis.
//
// Générateur dédié plutôt que htmlToPdf : celui-ci ne sait rendre que du
// texte au fil de l'eau, sans colonnes ni alignement à droite. Or une
// facture est une mise en page — émetteur à gauche, client à droite,
// montants alignés — et surtout un ensemble de mentions dont l'absence est
// sanctionnable. Les composer en HTML pour les reperdre au rendu serait le
// plus sûr moyen de livrer un document qui a l'air d'une facture sans en
// être une.

export type InvoicePdfIssuer = {
  name: string;
  legalForm: string | null;
  shareCapital: string | null;
  legalAddress: string | null;
  siret: string | null;
  rcsCity: string | null;
  rcsNumber: string | null;
  activityDeclarationNumber: string | null;
  publicContactEmail: string | null;
  publicContactPhone: string | null;
  vatRegime: string;
  vatRatePercent: number | null;
  vatNumber: string | null;
};

export type InvoicePdfCustomer = { name: string; address: string | null; siret: string | null };

export type InvoicePdfData = {
  kind: "invoice" | "quote";
  reference: string;
  description: string | null;
  amountCents: number;
  issuedAt: Date;
  dueDate: Date | null;
  issuer: InvoicePdfIssuer;
  customer: InvoicePdfCustomer;
};

// Article L. 441-10 et D. 441-5 du code de commerce : ces deux mentions sont
// obligatoires sur toute facture entre professionnels, et leur absence est
// passible d'une amende administrative. Elles ne dépendent d'aucun réglage,
// donc elles sont ici et pas dans un champ que quelqu'un oublierait.
const PENALTY_NOTICE =
  "En cas de retard de paiement, des pénalités seront exigibles au taux de trois fois le taux d'intérêt légal, " +
  "sans qu'un rappel soit nécessaire, ainsi qu'une indemnité forfaitaire pour frais de recouvrement de 40 € " +
  "(art. L. 441-10 et D. 441-5 du code de commerce). Aucun escompte n'est accordé pour paiement anticipé.";

const VAT_EXEMPT_NOTICE =
  "TVA non applicable — exonération au titre de l'article 261-4-4°a du code général des impôts " +
  "(formation professionnelle continue).";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;

function euros(cents: number): string {
  return `${(cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function jour(d: Date): string {
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

/** Les lignes d'identité de l'émetteur, dans l'ordre où on les lit sur une facture. */
function issuerLines(i: InvoicePdfIssuer): string[] {
  const lignes: string[] = [];
  const forme = [i.legalForm, i.shareCapital ? `au capital de ${i.shareCapital}` : null].filter(Boolean).join(" ");
  if (forme) lignes.push(forme);
  if (i.legalAddress) lignes.push(...i.legalAddress.split("\n").filter(Boolean));
  if (i.siret) lignes.push(`SIRET ${i.siret}`);
  if (i.rcsNumber) lignes.push(`RCS ${[i.rcsCity, i.rcsNumber].filter(Boolean).join(" ")}`);
  if (i.vatRegime === "standard" && i.vatNumber) lignes.push(`TVA ${i.vatNumber}`);
  if (i.activityDeclarationNumber) {
    // Mention propre aux organismes de formation (art. L. 6351-1 du code du
    // travail), avec la formule consacrée qui empêche de la lire comme un
    // agrément de l'État.
    lignes.push(`Déclaration d'activité n° ${i.activityDeclarationNumber}`);
    lignes.push("Cet enregistrement ne vaut pas agrément de l'État.");
  }
  if (i.publicContactEmail) lignes.push(i.publicContactEmail);
  if (i.publicContactPhone) lignes.push(i.publicContactPhone);
  return lignes;
}

/** Découpe un texte pour qu'il tienne dans une largeur donnée. */
function wrap(texte: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const mots = texte.split(/\s+/).filter(Boolean);
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
  return lignes;
}

export async function generateInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page: PDFPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const gras = await doc.embedFont(StandardFonts.HelveticaBold);

  const ink = rgb(0.11, 0.11, 0.12);
  const slate = rgb(0.42, 0.43, 0.45);
  const line = rgb(0.85, 0.85, 0.86);
  const droite = PAGE_WIDTH - MARGIN;
  const largeur = droite - MARGIN;

  function texte(t: string, x: number, y: number, opts: { font?: PDFFont; size?: number; color?: typeof ink } = {}) {
    page.drawText(t, { x, y, font: opts.font ?? normal, size: opts.size ?? 9.5, color: opts.color ?? ink });
  }
  function texteDroite(t: string, y: number, opts: { font?: PDFFont; size?: number; color?: typeof ink } = {}) {
    const f = opts.font ?? normal;
    const s = opts.size ?? 9.5;
    texte(t, droite - f.widthOfTextAtSize(t, s), y, opts);
  }

  let y = PAGE_HEIGHT - MARGIN;

  // En-tête : émetteur à gauche, nature et référence à droite.
  texte(data.issuer.name, MARGIN, y, { font: gras, size: 14 });
  const titre = data.kind === "invoice" ? "FACTURE" : "DEVIS";
  texteDroite(titre, y, { font: gras, size: 14 });
  y -= 18;
  texteDroite(data.reference, y, { font: gras, size: 10 });
  y -= 6;

  for (const l of issuerLines(data.issuer)) {
    y -= 11;
    texte(l, MARGIN, y, { size: 8.5, color: slate });
  }

  // Bloc client, aligné à droite sous le titre.
  let yClient = PAGE_HEIGHT - MARGIN - 46;
  texteDroite(data.customer.name, yClient, { font: gras, size: 10 });
  for (const l of [...(data.customer.address?.split("\n") ?? []), data.customer.siret ? `SIRET ${data.customer.siret}` : null].filter(
    (v): v is string => Boolean(v),
  )) {
    yClient -= 11;
    texteDroite(l, yClient, { size: 8.5, color: slate });
  }

  y = Math.min(y, yClient) - 34;

  // Dates.
  texte(`Date d'émission : ${jour(data.issuedAt)}`, MARGIN, y, { size: 9.5 });
  if (data.dueDate) texteDroite(`Échéance : ${jour(data.dueDate)}`, y, { size: 9.5 });
  y -= 26;

  // Tableau à deux colonnes : désignation et montant.
  page.drawLine({ start: { x: MARGIN, y }, end: { x: droite, y }, thickness: 0.8, color: line });
  y -= 14;
  texte("Désignation", MARGIN, y, { font: gras, size: 9 });
  texteDroite("Montant", y, { font: gras, size: 9 });
  y -= 8;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: droite, y }, thickness: 0.8, color: line });
  y -= 18;

  const designation = data.description?.trim() || "Prestation de formation professionnelle";
  const lignesDesignation = wrap(designation, normal, 9.5, largeur - 110);
  for (const [i, l] of lignesDesignation.entries()) {
    texte(l, MARGIN, y, { size: 9.5 });
    if (i === 0) texteDroite(euros(data.amountCents), y, { size: 9.5 });
    y -= 13;
  }

  y -= 6;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: droite, y }, thickness: 0.8, color: line });
  y -= 18;

  // Totaux. En exonération il n'y a qu'une ligne : afficher un « total HT »
  // puis une TVA à 0 laisserait croire à un assujettissement au taux zéro,
  // qui n'est pas la même chose.
  const exonere = data.issuer.vatRegime !== "standard";
  if (exonere) {
    texteDroite(`Total à payer  ${euros(data.amountCents)}`, y, { font: gras, size: 11 });
    y -= 20;
    for (const l of wrap(VAT_EXEMPT_NOTICE, normal, 8.5, largeur)) {
      texte(l, MARGIN, y, { size: 8.5, color: slate });
      y -= 11;
    }
  } else {
    // amountCents est le montant facturé, donc TTC : on en déduit la base
    // hors taxe plutôt que d'ajouter de la TVA par-dessus, sinon la somme
    // encaissée ne correspondrait plus à la ligne du relevé bancaire.
    const taux = data.issuer.vatRatePercent ?? 20;
    const ht = Math.round(data.amountCents / (1 + taux / 100));
    const tva = data.amountCents - ht;
    texteDroite(`Total HT  ${euros(ht)}`, y, { size: 9.5 });
    y -= 14;
    texteDroite(`TVA ${taux.toLocaleString("fr-FR")} %  ${euros(tva)}`, y, { size: 9.5 });
    y -= 16;
    texteDroite(`Total TTC  ${euros(data.amountCents)}`, y, { font: gras, size: 11 });
    y -= 20;
  }

  // Mentions de retard de paiement — uniquement sur une facture : un devis
  // n'est pas exigible, y faire figurer des pénalités n'aurait aucun sens.
  if (data.kind === "invoice") {
    y -= 8;
    for (const l of wrap(PENALTY_NOTICE, normal, 8, largeur)) {
      texte(l, MARGIN, y, { size: 8, color: slate });
      y -= 10;
    }
  } else {
    y -= 8;
    texte("Devis valable 30 jours à compter de sa date d'émission.", MARGIN, y, { size: 8, color: slate });
  }

  return Buffer.from(await doc.save());
}

/** Nom de fichier proposé au téléchargement et en pièce jointe. */
export function invoicePdfFileName(kind: "invoice" | "quote", reference: string): string {
  const base = `${kind === "invoice" ? "Facture" : "Devis"}-${reference}`.replace(/[^\w\-]/g, "-");
  return `${base}.pdf`;
}
