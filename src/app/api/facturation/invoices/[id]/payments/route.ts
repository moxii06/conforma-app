import { NextResponse } from "next/server";
import { z } from "zod";
import { PipelineStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { advanceOpportunityStage } from "@/lib/pipeline";

const schema = z.object({
  amountCents: z.number().int().positive(),
  method: z.string().optional(),
});

// Records one installment against an invoice — an invoice doesn't have to
// be settled in a single payment. A payment that brings the running total
// to or past the invoice's amountCents auto-flips its status to PAID
// (mirrors what manually picking "Payé" in DocStatusSelect would do); a
// partial one leaves the status as-is, just visible as progress in the UI.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(auth.role, "invoicing") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const invoice = await prisma.invoice.findFirst({
    where: { id: params.id, organizationId: auth.organizationId },
    include: { payments: true },
  });
  if (!invoice) return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Montant invalide." }, { status: 400 });

  const alreadyPaid = invoice.payments.reduce((sum, p) => sum + p.amountCents, 0);
  const newTotal = alreadyPaid + parsed.data.amountCents;
  const justCompleted = newTotal >= invoice.amountCents && invoice.status !== "PAID";

  const [payment] = await prisma.$transaction([
    prisma.payment.create({
      data: {
        organizationId: auth.organizationId,
        invoiceId: invoice.id,
        amountCents: parsed.data.amountCents,
        method: parsed.data.method || null,
        recordedByUserId: auth.userId,
        recordedByName: auth.name || auth.email,
      },
    }),
    ...(justCompleted ? [prisma.invoice.update({ where: { id: invoice.id }, data: { status: "PAID" as const } })] : []),
  ]);

  if (justCompleted) {
    await advanceOpportunityStage(auth.organizationId, invoice.contactId, PipelineStage.INVOICED, PipelineStage.PAID);
  }

  return NextResponse.json({ payment, totalPaidCents: newTotal, fullyPaid: newTotal >= invoice.amountCents }, { status: 201 });
}

// Listing is used by the invoice row's expandable payment history.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(auth.role, "invoicing") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const invoice = await prisma.invoice.findFirst({ where: { id: params.id, organizationId: auth.organizationId } });
  if (!invoice) return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });

  const payments = await prisma.payment.findMany({ where: { invoiceId: invoice.id }, orderBy: { paidAt: "desc" } });
  return NextResponse.json(payments);
}
