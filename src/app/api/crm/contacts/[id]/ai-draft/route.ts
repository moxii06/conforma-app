import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can, canAccessContact } from "@/lib/tenant";
import { draftIntentEmail } from "@/lib/ai";

const schema = z.object({
  intent: z.enum(["follow_up", "payment_reminder", "quote_follow_up", "custom"]),
  instruction: z.string().optional(),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(auth.role, "crm") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const contact = await prisma.contact.findFirst({
    where: { id: params.id, organizationId: auth.organizationId },
    include: {
      opportunities: { select: { ownerId: true, label: true, amountCents: true }, orderBy: { createdAt: "desc" } },
      invoices: { where: { status: { in: ["SENT", "OVERDUE"] } }, orderBy: { createdAt: "desc" }, take: 1 },
      quotes: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!contact) return NextResponse.json({ error: "Contact introuvable." }, { status: 404 });
  if (!canAccessContact(auth.role, auth.userId, contact.opportunities)) {
    return NextResponse.json({ error: "Ce contact appartient à un autre commercial." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: auth.organizationId } });

  let context: string | undefined;
  if (parsed.data.intent === "payment_reminder" && contact.invoices[0]) {
    const inv = contact.invoices[0];
    context = `Facture ${inv.reference}, montant ${(inv.amountCents / 100).toFixed(2)} €, statut ${inv.status === "OVERDUE" ? "en retard" : "envoyée, non payée"}.`;
  } else if (parsed.data.intent === "quote_follow_up" && contact.quotes[0]) {
    const q = contact.quotes[0];
    context = `Devis ${q.reference}, montant ${(q.amountCents / 100).toFixed(2)} €.`;
  } else if (parsed.data.intent === "follow_up" && contact.opportunities[0]) {
    context = `Opportunité en cours : ${contact.opportunities[0].label}.`;
  }

  try {
    const draft = await draftIntentEmail({
      intent: parsed.data.intent,
      contactFirstName: contact.firstName,
      organizationName: organization.name,
      context,
      instruction: parsed.data.instruction,
    });
    return NextResponse.json({ draft });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur inattendue." }, { status: 502 });
  }
}
