import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

const schema = z.object({
  contactId: z.string().min(1),
  dossierId: z.string().optional(),
  reference: z.string().min(1),
  amountCents: z.number().int().positive(),
});

export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "invoicing") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

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

  const quote = await prisma.quote.create({
    data: {
      organizationId: session.organizationId,
      contactId: contact.id,
      dossierId: parsed.data.dossierId,
      reference: parsed.data.reference,
      amountCents: parsed.data.amountCents,
    },
    include: { contact: true },
  });

  return NextResponse.json(quote, { status: 201 });
}
