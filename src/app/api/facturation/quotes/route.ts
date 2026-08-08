import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { checkLines } from "@/lib/invoiceLines";

const schema = z.object({
  contactId: z.string().min(1),
  dossierId: z.string().optional(),
  reference: z.string().min(1),
  // Désignation de la prestation — mention obligatoire sur le document émis.
  description: z.string().min(1).optional(),
  amountCents: z.number().int().positive(),
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

export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.roles, "invoicing") === "none") {
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

  const quote = await prisma.quote.create({
    data: {
      organizationId: session.organizationId,
      contactId: contact.id,
      dossierId: parsed.data.dossierId,
      reference: parsed.data.reference,
      amountCents: parsed.data.amountCents,
      lines: { create: lignes.map((l, i) => ({ ...l, order: i })) },
    },
    include: { contact: true },
  });

  return NextResponse.json(quote, { status: 201 });
}
