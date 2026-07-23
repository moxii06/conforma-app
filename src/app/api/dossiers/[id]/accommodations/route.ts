import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, canAccessAccommodations } from "@/lib/tenant";

const schema = z.object({
  description: z.string().min(1),
  requestedAccommodations: z.string().min(1),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: session.organizationId } });
  if (!canAccessAccommodations(session.role, session.userId, organization)) {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const dossier = await prisma.dossier.findFirst({ where: { id: params.id, organizationId: session.organizationId } });
  if (!dossier) return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const created = await prisma.accommodationRequest.create({
    data: {
      organizationId: session.organizationId,
      dossierId: dossier.id,
      description: parsed.data.description,
      requestedAccommodations: parsed.data.requestedAccommodations,
      createdByName: session.name || session.email,
    },
  });

  return NextResponse.json(created, { status: 201 });
}
