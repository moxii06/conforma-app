import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { addDays } from "date-fns";
import { computeFundingSummary, resolveDossierPriceCents } from "@/lib/funding";
import { nextInvoiceReference } from "@/lib/invoiceReference";
import { recordActivationEvent } from "@/lib/activation";

// Two invoices can come out of a funding plan, and this route generates
// both kinds:
//  - { commitmentId }  → the subrogated funder's invoice, for their share
//  - { remainder: true } → the client's invoice, for what's left after the
//    secured funding
const schema = z.union([
  z.object({ commitmentId: z.string().min(1) }),
  z.object({ remainder: z.literal(true) }),
]);

// Maps a funder type onto Invoice.fundingOrigin, which is what the BPF
// breakdown reads. CPF and France Travail money is public money in the
// BPF's vocabulary.
const FUNDER_TYPE_TO_ORIGIN: Record<string, string> = {
  opco: "opco",
  cpf: "public",
  france_travail: "public",
  agefice: "public",
  public: "public",
  company: "company",
  individual: "individual",
};

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.roles, "invoicing") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const dossier = await prisma.dossier.findFirst({
    where: { id: params.id, organizationId: session.organizationId },
    include: { session: { include: { course: true } } },
  });
  if (!dossier) return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  if ("commitmentId" in parsed.data) {
    const commitment = await prisma.fundingCommitment.findFirst({
      where: { id: parsed.data.commitmentId, dossierId: dossier.id, organizationId: session.organizationId },
      include: { funder: true },
    });
    if (!commitment) return NextResponse.json({ error: "Engagement introuvable." }, { status: 404 });
    if (!commitment.subrogation) {
      return NextResponse.json(
        { error: "Cet engagement n'est pas en subrogation — le montant appartient à la facture du client." },
        { status: 400 },
      );
    }
    if (commitment.status !== "granted") {
      return NextResponse.json(
        { error: "Facturez après l'accord : un financeur ne règle jamais une facture émise avant sa décision." },
        { status: 400 },
      );
    }
    if (commitment.invoiceId) {
      return NextResponse.json({ error: "Cet engagement a déjà sa facture." }, { status: 409 });
    }

    const invoice = await prisma.invoice.create({
      data: {
        organizationId: session.organizationId,
        contactId: dossier.contactId,
        dossierId: dossier.id,
        funderId: commitment.funderId,
        reference: await nextInvoiceReference(session.organizationId),
        amountCents: commitment.amountCents,
        status: "DRAFT",
        dueDate: addDays(new Date(), 30),
        fundingOrigin: FUNDER_TYPE_TO_ORIGIN[commitment.funder.type] ?? null,
      },
    });
    await prisma.fundingCommitment.update({
      where: { id: commitment.id },
      data: { invoiceId: invoice.id, status: "invoiced" },
    });
    await recordActivationEvent(session.organizationId, "first_invoice_created");
    return NextResponse.json(invoice, { status: 201 });
  }

  // Client remainder: total minus what funders have secured. A snapshot by
  // design — an invoice is a document, not a live formula.
  const commitments = await prisma.fundingCommitment.findMany({
    where: { dossierId: dossier.id, organizationId: session.organizationId },
  });
  const summary = computeFundingSummary(
    resolveDossierPriceCents(dossier, dossier.session.course),
    commitments.map((c) => ({
      amountCents: c.amountCents,
      status: c.status,
      subrogation: c.subrogation,
      validUntil: c.validUntil,
    })),
  );
  if (summary.remainderCents <= 0) {
    return NextResponse.json(
      { error: "Rien à facturer au client : le financement couvre la totalité du coût." },
      { status: 400 },
    );
  }

  const invoice = await prisma.invoice.create({
    data: {
      organizationId: session.organizationId,
      contactId: dossier.contactId,
      dossierId: dossier.id,
      reference: await nextInvoiceReference(session.organizationId),
      amountCents: summary.remainderCents,
      status: "DRAFT",
      dueDate: addDays(new Date(), 30),
      // The client's own share: their money, whoever they are.
      fundingOrigin: null,
    },
  });
  await recordActivationEvent(session.organizationId, "first_invoice_created");
  return NextResponse.json(invoice, { status: 201 });
}
