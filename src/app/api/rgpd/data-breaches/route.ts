import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, canWriteRgpd } from "@/lib/tenant";

const schema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  discoveredAt: z.string().min(1),
  affectedDataTypes: z.string().min(1),
  affectedPeopleCount: z.number().int().nonnegative().nullable().optional(),
  severity: z.enum(["low", "moderate", "high"]),
});

// GDPR art. 33/34 — this is the "something actually went wrong" register
// the RGPD module was missing (registre/DPIA only cover planned risk).
export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (!canWriteRgpd(session.role)) return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const discoveredAt = new Date(parsed.data.discoveredAt);
  if (Number.isNaN(discoveredAt.getTime())) return NextResponse.json({ error: "Date invalide." }, { status: 400 });

  const record = await prisma.dataBreach.create({
    data: {
      organizationId: session.organizationId,
      title: parsed.data.title,
      description: parsed.data.description,
      discoveredAt,
      affectedDataTypes: parsed.data.affectedDataTypes,
      affectedPeopleCount: parsed.data.affectedPeopleCount ?? null,
      severity: parsed.data.severity,
      createdByName: session.name || session.email,
    },
  });

  return NextResponse.json(record, { status: 201 });
}
