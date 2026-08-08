import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { recordInvoicePayment } from "@/lib/payments";

const schema = z.object({
  amountCents: z.number().int().positive(),
  method: z.string().optional(),
});

// Records one installment against an invoice — an invoice doesn't have to
// be settled in a single payment. A payment that brings the running total
// to or past the invoice's amountCents auto-flips its status to PAID
// (mirrors what manually picking "Payé" in DocStatusSelect would do); a
// partial one leaves the status as-is, just visible as progress in the UI.
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(auth.roles, "invoicing") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const invoice = await prisma.invoice.findFirst({ where: { id: params.id, organizationId: auth.organizationId } });
  if (!invoice) return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Montant invalide." }, { status: 400 });

  const result = await recordInvoicePayment({
    organizationId: auth.organizationId,
    invoiceId: invoice.id,
    amountCents: parsed.data.amountCents,
    method: parsed.data.method,
    recordedByUserId: auth.userId,
    recordedByName: auth.name || auth.email,
  });
  if (!result) return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });

  return NextResponse.json({ payment: result.payment, totalPaidCents: result.totalPaidCents, fullyPaid: result.fullyPaid }, { status: 201 });
}

// Listing is used by the invoice row's expandable payment history.
export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(auth.roles, "invoicing") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const invoice = await prisma.invoice.findFirst({ where: { id: params.id, organizationId: auth.organizationId } });
  if (!invoice) return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });

  const payments = await prisma.payment.findMany({ where: { invoiceId: invoice.id }, orderBy: { paidAt: "desc" } });
  return NextResponse.json(payments);
}
