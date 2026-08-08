import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

const schema = z.object({
  name: z.string().min(2).max(160),
  type: z.enum(["opco", "cpf", "france_travail", "agefice", "company", "individual", "public", "other"]),
  contactEmail: z.string().email().max(180).optional().or(z.literal("")),
  contactPhone: z.string().max(40).optional(),
  notes: z.string().max(2000).optional(),
  hourlyRateCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
  maxAmountCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
});

// The funder referential is money-side data, so it follows "invoicing"
// rather than "dossiers": a trainer who can open a dossier has no business
// editing who funds the organisation.
export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.roles, "invoicing") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const existing = await prisma.funder.findFirst({
    where: { organizationId: session.organizationId, name: parsed.data.name.trim() },
  });
  if (existing) {
    return NextResponse.json({ error: "Un financeur porte déjà ce nom." }, { status: 409 });
  }

  const funder = await prisma.funder.create({
    data: {
      organizationId: session.organizationId,
      name: parsed.data.name.trim(),
      type: parsed.data.type,
      contactEmail: parsed.data.contactEmail || null,
      contactPhone: parsed.data.contactPhone || null,
      notes: parsed.data.notes || null,
      hourlyRateCents: parsed.data.hourlyRateCents ?? null,
      maxAmountCents: parsed.data.maxAmountCents ?? null,
    },
  });
  return NextResponse.json(funder, { status: 201 });
}
