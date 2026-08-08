import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { recordInvoicePayment } from "@/lib/payments";

const schema = z.object({ invoiceId: z.string().min(1) });

// Staff picking "Confirmer" on a suggested (or manually chosen) match —
// the one place a BankTransaction actually turns into a real Payment.
// Nothing upstream of this route ever writes a Payment on its own; see
// schema.prisma's BankTransaction comment for why suggestions never
// auto-apply.
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(auth.roles, "invoicing") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Facture à associer manquante." }, { status: 400 });

  const tx = await prisma.bankTransaction.findFirst({ where: { id: params.id, organizationId: auth.organizationId } });
  if (!tx) return NextResponse.json({ error: "Transaction introuvable." }, { status: 404 });
  if (tx.status !== "pending") return NextResponse.json({ error: "Cette transaction a déjà été traitée." }, { status: 409 });

  const invoice = await prisma.invoice.findFirst({ where: { id: parsed.data.invoiceId, organizationId: auth.organizationId } });
  if (!invoice) return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });

  const result = await recordInvoicePayment({
    organizationId: auth.organizationId,
    invoiceId: invoice.id,
    amountCents: tx.amountCents,
    method: "virement (rapprochement bancaire)",
    recordedByUserId: auth.userId,
    recordedByName: auth.name || auth.email,
  });
  if (!result) return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });

  await prisma.bankTransaction.update({
    where: { id: tx.id },
    data: {
      status: "confirmed",
      matchedInvoiceId: invoice.id,
      reviewedByUserId: auth.userId,
      reviewedByName: auth.name || auth.email,
      reviewedAt: new Date(),
    },
  });

  return NextResponse.json({ payment: result.payment, fullyPaid: result.fullyPaid });
}
