import { prisma } from "@/lib/prisma";
import { type DocStatus } from "@prisma/client";
import { generateInvoicePdf, invoicePdfFileName, type InvoicePdfData } from "@/lib/invoicePdf";

// Assemble les données d'un devis ou d'une facture pour le PDF. Partagé par
// le téléchargement et par l'envoi : les deux doivent produire exactement le
// même fichier, sans quoi le document reçu par le client différerait de
// celui que l'organisme a relu.

export type FacturationKind = "invoice" | "quote";

export async function buildFacturationPdf(
  kind: FacturationKind,
  id: string,
  organizationId: string,
): Promise<{
  pdf: Buffer;
  fileName: string;
  reference: string;
  contactEmail: string | null;
  contactName: string;
  /** Le statut AVANT l'envoi : l'appelant doit savoir s'il a le droit de le faire avancer. */
  status: DocStatus;
} | null> {
  const commun = {
    where: { id, organizationId },
    include: {
      contact: { include: { company: true } },
      dossier: { include: { session: { include: { course: true } } } },
      lines: { orderBy: { order: "asc" } },
    },
  } as const;

  const doc =
    kind === "invoice"
      ? await prisma.invoice.findFirst(commun)
      : await prisma.quote.findFirst(commun);
  if (!doc) return null;

  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });

  // Le client facturé est l'entreprise quand il y en a une — c'est elle qui
  // paie et dont le comptable a besoin du SIRET. À défaut, le particulier.
  const company = doc.contact.company;
  const customer = company
    ? { name: company.name, address: company.address, siret: company.siret }
    : {
        name: `${doc.contact.firstName} ${doc.contact.lastName}`,
        address: doc.contact.address,
        siret: null,
      };

  const data: InvoicePdfData = {
    kind,
    reference: doc.reference,
    // À défaut de désignation saisie, le titre de la formation du dossier —
    // c'est l'objet réel de la prestation, et le laisser vide priverait la
    // facture d'une mention obligatoire.
    description: doc.description ?? doc.dossier?.session.course.title ?? null,
    lines: doc.lines.map((l) => ({
      designation: l.designation,
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
      unit: l.unit,
    })),
    amountCents: doc.amountCents,
    issuedAt: doc.createdAt,
    dueDate: kind === "invoice" ? ((doc as { dueDate?: Date | null }).dueDate ?? null) : null,
    issuer: {
      name: org.name,
      legalForm: org.legalForm,
      shareCapital: org.shareCapital,
      legalAddress: org.legalAddress,
      siret: org.siret,
      rcsCity: org.rcsCity,
      rcsNumber: org.rcsNumber,
      activityDeclarationNumber: org.activityDeclarationNumber,
      publicContactEmail: org.publicContactEmail,
      publicContactPhone: org.publicContactPhone,
      vatRegime: org.vatRegime,
      vatRatePercent: org.vatRatePercent,
      vatNumber: org.vatNumber,
    },
    customer,
  };

  return {
    pdf: await generateInvoicePdf(data),
    fileName: invoicePdfFileName(kind, doc.reference),
    reference: doc.reference,
    contactEmail: doc.contact.email,
    contactName: `${doc.contact.firstName} ${doc.contact.lastName}`,
    status: doc.status,
  };
}
