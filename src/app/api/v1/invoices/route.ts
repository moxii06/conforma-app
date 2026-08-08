import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateApiRequest, parsePaging } from "@/lib/apiAuth";
import { encaissementFacture } from "@/lib/invoiceEncaissement";

// GET /api/v1/invoices — invoices, with how much has actually been received.
export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "read:invoices");
  if ("error" in auth) return auth.error;
  const { take, skip } = parsePaging(request);

  const [total, invoices] = await Promise.all([
    prisma.invoice.count({ where: { organizationId: auth.context.organizationId } }),
    prisma.invoice.findMany({
      where: { organizationId: auth.context.organizationId },
      orderBy: { createdAt: "desc" },
      take,
      skip,
      include: {
        contact: { select: { id: true, firstName: true, lastName: true } },
        // `method` sert au repli d'encaissementFacture() : sans lui, une
        // facture marquée payée sans règlement sortirait à paid_cents: 0.
        payments: { select: { amountCents: true, method: true } },
      },
    }),
  ]);

  return NextResponse.json({
    data: invoices.map((i) => {
      // Le helper partagé, pas un reduce local : une facture marquée payée
      // avant que « marquer payé » n'écrive son règlement ne porte aucun
      // Payment, et une intégration la lirait à paid_cents: 0 — sur le canal
      // le plus difficile à corriger après coup.
      const { encaisseCents: paid, resteDuCents } = encaissementFacture(i);
      return {
        id: i.id,
        reference: i.reference,
        status: i.status,
        amount_cents: i.amountCents,
        // Derived here rather than left to the caller: an integration
        // re-summing payments itself would drift from what the app shows the
        // moment partial-payment rules change.
        paid_cents: paid,
        remaining_cents: resteDuCents,
        due_date: i.dueDate ? i.dueDate.toISOString() : null,
        funding_origin: i.fundingOrigin,
        created_at: i.createdAt.toISOString(),
        contact: { id: i.contact.id, first_name: i.contact.firstName, last_name: i.contact.lastName },
      };
    }),
    pagination: { total, limit: take, offset: skip },
  });
}
