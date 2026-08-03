import { NextResponse } from "next/server";
import { z } from "zod";
import { addDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { checkLines } from "@/lib/invoiceLines";
import { recordActivationEvent } from "@/lib/activation";

const DEFAULT_PAYMENT_TERM_DAYS = 30;

const schema = z.object({
  contactId: z.string().min(1),
  dossierId: z.string().optional(),
  reference: z.string().min(1),
  // Désignation de la prestation — mention obligatoire (art. 242 nonies A).
  description: z.string().min(1).optional(),
  amountCents: z.number().int().positive(),
  fundingOrigin: z.enum(["company", "opco", "public", "individual"]).optional(),
  // ISO date string from NewInvoiceForm's date input, pre-filled to +30 days
  // but editable — falls back to the same default server-side so any other
  // future caller of this route still gets a real dueDate, needed for
  // dashboardTasks.ts's automatic overdue detection.
  dueDate: z.string().optional(),
  // Le détail, facultatif. Quand il est fourni, sa somme doit tomber
  // exactement sur amountCents — voir checkLines.
  lines: z
    .array(
      z.object({
        designation: z.string().min(1).max(300),
        quantity: z.number().positive(),
        unitPriceCents: z.number().int().min(0),
        unit: z.string().max(40).optional(),
      }),
    )
    .max(50)
    .optional(),
});

// Jalon n'est PAS une plateforme de dématérialisation agréée, et ne
// transmet aucune facture. Ce champ n'enregistre qu'une INTENTION de canal,
// pour le jour où un connecteur existera.
//
// L'écran de facturation annonçait « transmission via le portail public
// (PPF) par défaut » et affichait « · PPF » à côté de chaque facture. Un
// organisme pouvait raisonnablement en conclure que sa facture était
// partie. Elle n'allait nulle part. Les deux mentions ont été retirées :
// tant que rien ne transmet, rien ne doit le laisser croire.
//
// L'obligation de RECEVOIR des factures électroniques pèse sur l'organisme
// en tant qu'entreprise, via sa propre plateforme agréée — pas sur Jalon.
const DEFAULT_EINVOICING_PROVIDER = "ppf";

export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "invoicing") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const lignes = parsed.data.lines ?? [];
  const verif = checkLines(lignes, parsed.data.amountCents);
  if (!verif.ok) return NextResponse.json({ error: verif.error }, { status: 400 });

  const contact = await prisma.contact.findFirst({
    where: { id: parsed.data.contactId, organizationId: session.organizationId },
  });
  if (!contact) return NextResponse.json({ error: "Contact introuvable." }, { status: 404 });

  if (parsed.data.dossierId) {
    const dossier = await prisma.dossier.findFirst({
      where: { id: parsed.data.dossierId, organizationId: session.organizationId },
    });
    if (!dossier) return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });
  }

  const invoice = await prisma.invoice.create({
    data: {
      organizationId: session.organizationId,
      contactId: contact.id,
      dossierId: parsed.data.dossierId,
      reference: parsed.data.reference,
      amountCents: parsed.data.amountCents,
      fundingOrigin: parsed.data.fundingOrigin,
      einvoicingProvider: DEFAULT_EINVOICING_PROVIDER,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : addDays(new Date(), DEFAULT_PAYMENT_TERM_DAYS),
      lines: { create: lignes.map((l, i) => ({ ...l, order: i })) },
    },
    include: { contact: true },
  });
  await recordActivationEvent(session.organizationId, "first_invoice_created");

  return NextResponse.json(invoice, { status: 201 });
}
